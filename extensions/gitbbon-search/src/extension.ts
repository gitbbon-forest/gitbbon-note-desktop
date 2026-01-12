/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { searchService } from './services/searchService.js';
import { FileWatcher, GitWatcher } from './watchers/fileWatcher.js';
import { vectorStorageService, type VectorData } from './services/vectorStorageService.js';
import {
	decodeVector,
	encodeVector,
	simpleHash,
} from './services/vectorUtils.js';
import { extractTitle, stripFrontmatter } from './services/titleExtractor.js';
import { aiTextSearchProvider } from './aiTextSearchProvider.js';

// 모델명 상수
const MODEL_NAME = 'Xenova/multilingual-e5-small';
const VECTOR_DIMENSION = 384;

let fileWatcher: FileWatcher | null = null;
let gitWatcher: GitWatcher | null = null;
let hiddenWebview: vscode.HiddenWebview | null = null;
let modelReady = false;
let searchProvider: SearchViewProvider | null = null;
const pendingSearchRequests = new Map<string, vscode.WebviewView>();

// AI 검색 쿼리 임베딩 대기 맵
const pendingQueryEmbeddings = new Map<string, (vector: number[]) => void>();

export interface SearchResult {
	filePath: string;
	range: [number, number]; // [startOffset, endOffset]
	score: number;
	snippet: string;
}

export interface GitbbonSearchAPI {
	search(query: string, limit?: number): Promise<SearchResult[]>;
}

/**
 * 검색 뷰 프로바이더
 */
class SearchViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon-search.searchView';
	private currentWebviewView: vscode.WebviewView | null = null;

	constructor(private readonly extensionUri: vscode.Uri) { }

	async resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext<unknown>,
		_token: vscode.CancellationToken
	): Promise<void> {
		this.currentWebviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtmlContent(webviewView.webview);

		// 웹뷰 메시지 처리
		webviewView.webview.onDidReceiveMessage(async (message) => {
			console.log('[Extension] Received message from UI Webview:', message.type);
			switch (message.type) {
				case 'uiReady':
					// UI Webview가 준비되면 현재 모델 상태 전송
					console.log('[Extension] UI Webview ready, sending model status:', modelReady ? 'ready' : 'loading');
					webviewView.webview.postMessage({
						type: 'modelStatus',
						status: modelReady ? 'ready' : 'loading',
						progress: modelReady ? 100 : 0
					});
					break;
				case 'search':
					// 검색 요청 처리 - Hidden Webview를 통해 쿼리 임베딩
					console.log('[Extension] Search request:', message.query);
					await this.handleSearchRequest(message.query, webviewView);
					break;
				case 'openFile':
					console.log('[Extension] openFile:', message.filePath);
					await this.openFileAtPosition(message.filePath, message.range);
					break;
			}
		});
	}

	/**
	 * 모델 상태 업데이트를 UI Webview에 전송
	 */
	sendModelStatus(status: 'loading' | 'ready' | 'error', progress?: number) {
		if (this.currentWebviewView) {
			this.currentWebviewView.webview.postMessage({
				type: 'modelStatus',
				status,
				progress: progress ?? (status === 'ready' ? 100 : 0)
			});
		}
	}

	/**
	 * 검색 결과를 UI Webview에 전송
	 */
	sendSearchResults(results: unknown[]) {
		if (this.currentWebviewView) {
			this.currentWebviewView.webview.postMessage({
				type: 'searchResults',
				data: results
			});
		}
	}

	/**
	 * 검색 요청 처리 - Hidden Webview를 통해 쿼리 임베딩 후 검색
	 */
	private async handleSearchRequest(query: string, webviewView: vscode.WebviewView): Promise<void> {
		if (!hiddenWebview || !modelReady) {
			console.log('[Extension] Cannot search - model not ready');
			webviewView.webview.postMessage({
				type: 'searchError',
				message: '모델이 아직 로딩 중입니다.'
			});
			return;
		}

		// Hidden Webview에 쿼리 임베딩 요청
		const requestId = Date.now().toString();
		pendingSearchRequests.set(requestId, webviewView);

		hiddenWebview.postMessage({
			type: 'embedQuery',
			query,
			requestId
		});
	}

	/**
	 * 벡터 검색 처리 (Webview에서 임베딩된 벡터 사용)
	 */
	private async handleVectorSearch(vector: number[], webviewView: vscode.WebviewView): Promise<void> {
		try {
			console.log('[Extension] Calling searchService.vectorSearch...');
			const results = await searchService.vectorSearch(vector, 10);
			console.log('[Extension] vectorSearch returned:', results.count, 'hits');

			// 결과에 스니펫 추가
			const searchResults = await Promise.all(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				results.hits.map(async (hit: any) => {
					const doc = hit.document;
					const snippet = await searchService.getSnippet(doc.filePath, doc.range);
					return {
						filePath: doc.filePath,
						range: doc.range,
						score: hit.score,
						snippet,
					};
				})
			);

			console.log('[Extension] Sending searchResults to Webview:', searchResults.length, 'items');
			webviewView.webview.postMessage({
				type: 'searchResults',
				data: searchResults
			});
		} catch (error) {
			console.error('[Extension] Search error:', error);
			webviewView.webview.postMessage({
				type: 'searchError',
				message: '검색 중 오류가 발생했습니다.'
			});
		}
	}

	/**
	 * 파일 열기 및 위치 이동
	 */
	private async openFileAtPosition(filePath: string, range: [number, number]): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			const document = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(document);

			// 문자 위치를 Position으로 변환
			const startPos = document.positionAt(range[0]);
			const endPos = document.positionAt(range[1]);

			// 선택 영역 설정 및 스크롤
			editor.selection = new vscode.Selection(startPos, endPos);
			editor.revealRange(
				new vscode.Range(startPos, endPos),
				vscode.TextEditorRevealType.InCenter
			);
		} catch {
			vscode.window.showErrorMessage(`파일을 열 수 없습니다: ${filePath}`);
		}
	}

	/**
	 * Webview HTML 생성
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'index.js')
		);
		const nonce = getNonce();

		// CSP: HuggingFace 모델 다운로드, WASM, blob/data URL 허용
		const csp = [
			"default-src 'none'",
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}' 'unsafe-eval' blob:`,
			`connect-src ${webview.cspSource} https://huggingface.co https://*.huggingface.co https://*.hf.co https://hf.co https://*.xethub.hf.co https://cdn.jsdelivr.net blob: data:`,
			`worker-src blob:`,
			`img-src ${webview.cspSource} https: data:`,
		].join('; ');

		return `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<title>Gitbbon Search</title>
	<style>
		:root {
			--container-padding: 12px;
		}
		body {
			margin: 0;
			padding: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background);
		}
		.search-container {
			padding: var(--container-padding);
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100vh;
		}
		.model-loading {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 12px;
			padding: 24px;
		}
		.loading-text {
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		.progress-bar {
			width: 100%;
			height: 4px;
			background-color: var(--vscode-progressBar-background);
			border-radius: 2px;
			overflow: hidden;
		}
		.progress-fill {
			height: 100%;
			background-color: var(--vscode-button-background);
			transition: width 0.3s ease;
		}
		.search-input-wrapper {
			display: flex;
			gap: 8px;
		}
		.search-input {
			flex: 1;
			padding: 8px 12px;
			border: 1px solid var(--vscode-input-border);
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			outline: none;
		}
		.search-input:focus {
			border-color: var(--vscode-focusBorder);
		}
		.search-button {
			padding: 8px 16px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		}
		.search-button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.search-button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		.error-message {
			color: var(--vscode-errorForeground);
			padding: 8px;
			background-color: var(--vscode-inputValidation-errorBackground);
			border-radius: 4px;
		}
		.results-container {
			flex: 1;
			overflow-y: auto;
		}
		.no-results {
			color: var(--vscode-descriptionForeground);
			text-align: center;
			padding: 16px;
		}
		.result-item {
			padding: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
			cursor: pointer;
		}
		.result-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}
		.result-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 4px;
		}
		.result-filename {
			font-weight: 600;
			color: var(--vscode-textLink-foreground);
		}
		.result-score {
			font-size: 0.85em;
			color: var(--vscode-descriptionForeground);
		}
		.result-snippet {
			font-size: 0.9em;
			color: var(--vscode-descriptionForeground);
			line-height: 1.4;
		}
	</style>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// NOTE: 인덱싱은 Webview에서 Worker를 통해 처리됨
// 추후 Webview ↔ Extension 간 인덱싱 메시지 통신 구현 예정

/**
 * 확장 활성화
 */
export async function activate(context: vscode.ExtensionContext): Promise<GitbbonSearchAPI> {
	console.log('[gitbbon-search] Extension activating...');

	// 검색 엔진 초기화 (모델은 Webview Worker에서 로딩)
	try {
		// 1. 검색 엔진 초기화
		await searchService.init(context);

		// 2. 저장된 인덱스 복원 시도
		await searchService.loadFromStorage();
	} catch (error) {
		vscode.window.showErrorMessage(`Gitbbon Search 초기화 실패: ${error}`);
		throw error;
	}

	// FileSystemWatcher 등록
	fileWatcher = new FileWatcher(async (uri) => {
		if (uri) {
			console.log(`[Extension] File changed: ${uri.fsPath} - reindexing...`);
			await indexFile(uri);
		} else {
			console.log('[Extension] Index updated (full scan needed?)');
			// 필요 시 startBackgroundIndexing() 호출 가능하나 너무 무거울 수 있음
		}
	});
	context.subscriptions.push(fileWatcher);

	// Git Watcher 등록 (TODO: Webview 인덱싱 구현 후 연결)
	gitWatcher = new GitWatcher(async () => {
		console.log('[Extension] Git state changed - reindex needed');
	});
	context.subscriptions.push(gitWatcher);

	// Search View 등록
	searchProvider = new SearchViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SearchViewProvider.viewType,
			searchProvider
		)
	);

	// Hidden Webview 초기화 (배경에서 모델 로딩)
	try {
		hiddenWebview = vscode.window.createHiddenWebview('gitbbon-search-model', {
			webviewOptions: {
				enableScripts: true
			}
		});

		// modelHost.js를 읽어서 인라인으로 삽입 (Hidden Webview에서 외부 ES 모듈 로드 불가)
		const modelHostScriptUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'modelHost.js');
		const modelHostScriptContent = await vscode.workspace.fs.readFile(modelHostScriptUri);
		const scriptCode = Buffer.from(modelHostScriptContent).toString('utf-8');
		hiddenWebview.html = `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Gitbbon Search - Model Host (Hidden)</title>
	<style>body { display: none; }</style>
</head>
<body>
	<script type="module">${scriptCode}</script>
</body>
</html>`;

		// Hidden Webview로부터 메시지 수신
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		hiddenWebview.onDidReceiveMessage(async (message: any) => {
			console.log('[Extension] Hidden Webview message:', message.type);
			switch (message.type) {
				case 'modelReady':
					modelReady = true;
					console.log('[Extension] Model ready in hidden webview!');
					// UI Webview에 모델 준비 완료 알림
					if (searchProvider) {
						searchProvider.sendModelStatus('ready');
					}

					// AITextSearchProvider 설정 및 등록
					aiTextSearchProvider.setEmbedQueryFn(embedQuery);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const registerFn = (vscode.workspace as any).registerAITextSearchProvider;
					if (registerFn) {
						context.subscriptions.push(
							registerFn('file', aiTextSearchProvider)
						);
						console.log('[Extension] AITextSearchProvider registered for file scheme');
					} else {
						console.warn('[Extension] registerAITextSearchProvider not available (proposed API)');
					}

					// 모델이 준비되면 인덱싱 시작
					await startBackgroundIndexing();
					break;
				case 'modelProgress':
					// UI Webview에 진행률 전달
					if (searchProvider) {
						searchProvider.sendModelStatus('loading', message.progress);
					}
					break;
				case 'modelError':
					console.error('[Extension] Model error:', message.error);
					if (searchProvider) {
						searchProvider.sendModelStatus('error');
					}
					break;
				case 'embeddingResult':
					await handleEmbeddingResult(message);
					break;
				case 'embeddingError':
					// 임베딩 실패 처리
					console.error(`[Extension] Embedding failed for ${message.filePath}:`, message.error);
					// TODO: 필요 시 재시도 로직 또는 사용자 알림 추가
					break;
				case 'queryEmbedding':
					// 쿼리 임베딩 결과 수신 - 벡터 검색 수행
					console.log('[Extension] Query embedding received, requestId:', message.requestId);

					// AITextSearchProvider를 위한 콜백 처리
					const aiSearchResolver = pendingQueryEmbeddings.get(message.requestId);
					if (aiSearchResolver) {
						aiSearchResolver(message.vector);
						pendingQueryEmbeddings.delete(message.requestId);
					}

					// 기존 UI Webview 검색 처리
					await handleQueryEmbeddingResult(message.vector, message.requestId);
					break;
				case 'queryEmbeddingError':
					// 쿼리 임베딩 오류
					console.error('[Extension] Query embedding error:', message.error);
					if (message.stack) {
						console.error('[Extension] Error stack:', message.stack);
					}
					const errorWebview = pendingSearchRequests.get(message.requestId);
					if (errorWebview) {
						errorWebview.webview.postMessage({
							type: 'searchError',
							message: `검색 쿼리 처리 중 오류가 발생했습니다: ${message.error}`
						});
						pendingSearchRequests.delete(message.requestId);
					}
					break;
			}
		});

		// 모델 로딩 시작 요청
		hiddenWebview.postMessage({ type: 'initModel' });
		console.log('[Extension] Hidden Webview created, model loading started');

		context.subscriptions.push(hiddenWebview);
	} catch (error) {
		console.error('[Extension] Failed to create hidden webview:', error);
		// Hidden Webview 실패 시에도 기존 방식으로 동작 가능하도록 fallback
	}

	// 명령어 등록
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon-search.reindex', async () => {
			await searchService.clearIndex();
			if (hiddenWebview && modelReady) {
				await startBackgroundIndexing();
				vscode.window.showInformationMessage('인덱싱을 시작합니다.');
			} else {
				vscode.window.showInformationMessage('인덱스가 삭제되었습니다. Webview를 열어 다시 인덱싱해주세요.');
			}
		})
	);

	console.log('[gitbbon-search] Extension activated!');

	return {
		search: (query: string, limit?: number) => executeSemanticSearch(query, limit)
	};
}

/**
 * 쿼리 임베딩 요청 헬퍼
 */
async function embedQuery(query: string): Promise<number[]> {
	if (!hiddenWebview || !modelReady) {
		throw new Error('Search model is not ready');
	}

	return new Promise<number[]>((resolve, reject) => {
		// 고유 ID 생성
		const requestId = `api-query-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		pendingQueryEmbeddings.set(requestId, resolve);

		// 타임아웃 설정 (10초)
		const timeout = setTimeout(() => {
			if (pendingQueryEmbeddings.has(requestId)) {
				pendingQueryEmbeddings.delete(requestId);
				reject(new Error('Query embedding timeout'));
			}
		}, 10000);

		try {
			hiddenWebview!.postMessage({
				type: 'embedQuery',
				query,
				requestId,
			});
		} catch (e) {
			clearTimeout(timeout);
			pendingQueryEmbeddings.delete(requestId);
			reject(e);
		}
	});
}

/**
 * 시멘틱 검색 실행
 */
async function executeSemanticSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
	try {
		console.log(`[gitbbon-search] Executing semantic search for: "${query}"`);
		const vector = await embedQuery(query);

		const results = await searchService.vectorSearch(vector, limit);

		const searchResults: SearchResult[] = await Promise.all(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			results.hits.map(async (hit: any) => {
				const doc = hit.document;
				const snippet = await searchService.getSnippet(doc.filePath, doc.range);
				return {
					filePath: doc.filePath,
					range: doc.range,
					score: hit.score,
					snippet,
				};
			})
		);

		return searchResults;
	} catch (e) {
		console.error('[gitbbon-search] Semantic search failed:', e);
		return [];
	}
}

/**
 * 배경에서 워크스페이스 인덱싱 시작
 */
async function startBackgroundIndexing(): Promise<void> {
	if (!hiddenWebview || !modelReady) {
		console.log('[Extension] Skipping indexing - model not ready');
		return;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		console.log('[Extension] No workspace folder found');
		return;
	}

	const mdFiles = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
	console.log(`[Extension] Background indexing: ${mdFiles.length} markdown files`);


	for (const fileUri of mdFiles) {
		await indexFile(fileUri);
	}
}

/**
 * 단일 파일 인덱싱
 */
async function indexFile(fileUri: vscode.Uri): Promise<void> {
	if (!hiddenWebview || !modelReady) {
		console.log(`[Extension] Skipping indexFile(${fileUri.fsPath}) - model not ready`);
		return;
	}

	try {
		const content = await vscode.workspace.fs.readFile(fileUri);
		const text = Buffer.from(content).toString('utf-8');

		if (text.trim().length === 0) {
			return;
		}

		// contentHash 계산
		const contentHash = simpleHash(text);

		// VectorStorageService로 캐시 확인
		if (await vectorStorageService.hasValidCache(fileUri, contentHash, MODEL_NAME)) {
			console.log(`[Extension] Using cached embedding for ${fileUri.fsPath}`);
			const vectorData = await vectorStorageService.loadVectorData(fileUri);
			if (vectorData) {
				const chunks = vectorData.chunks.map((chunk, i) => ({
					chunkIndex: i,
					range: chunk.range,
					vector: decodeVector(chunk.vector),
				}));
				await searchService.indexFileWithEmbeddings(fileUri.fsPath, chunks);
			}
			return;
		}

		// 캐시 없음 → 새로 임베딩 요청
		const title = extractTitle(text, fileUri.fsPath);
		const contentWithoutFrontmatter = stripFrontmatter(text);
		console.log(`[Extension] Requesting embedding for ${fileUri.fsPath} (title: ${title})`);
		hiddenWebview.postMessage({
			type: 'embedDocument',
			filePath: fileUri.fsPath,
			content: contentWithoutFrontmatter,
			title,
		});
	} catch (error) {
		console.error(`[Extension] Failed to read ${fileUri.fsPath}:`, error);
	}
}

/**
 * 임베딩 결과 처리 (Hidden Webview로부터)
 */
async function handleEmbeddingResult(message: {
	filePath: string;
	chunks: Array<{ chunkIndex: number; range: [number, number]; vector: number[] }>;
	contentHash: string;
}): Promise<void> {
	try {
		// Orama DB에 인덱싱
		await searchService.indexFileWithEmbeddings(
			message.filePath,
			message.chunks
		);
		console.log(`[Extension] Indexed ${message.chunks.length} chunks from ${message.filePath}`);

		// VectorData 객체 생성
		const uri = vscode.Uri.file(message.filePath);
		const content = await vscode.workspace.fs.readFile(uri);
		const text = Buffer.from(content).toString('utf-8');

		const vectorData: VectorData = {
			model: MODEL_NAME,
			dim: VECTOR_DIMENSION,
			contentHash: message.contentHash,
			chunks: message.chunks.map(chunk => ({
				range: chunk.range,
				hash: simpleHash(text.slice(chunk.range[0], chunk.range[1])),
				vector: encodeVector(chunk.vector),
			})),
		};

		// VectorStorageService로 저장
		await vectorStorageService.saveVectorData(uri, vectorData);
		console.log(`[Extension] Saved vector data to ${message.filePath}`);

		// 인덱스 저장 (debounce 적용)
		searchService.debouncedSave();
	} catch (error) {
		console.error(`[Extension] Failed to index ${message.filePath}:`, error);
	}
}

/**
 * 쿼리 임베딩 결과 처리 - 벡터 검색 수행 후 결과 반환
 */
async function handleQueryEmbeddingResult(vector: number[], requestId: string): Promise<void> {
	const webviewView = pendingSearchRequests.get(requestId);
	if (!webviewView) {
		console.warn('[Extension] No pending search request for:', requestId);
		return;
	}

	try {
		console.log('[Extension] Calling searchService.vectorSearch...');
		const results = await searchService.vectorSearch(vector, 10);
		console.log('[Extension] vectorSearch returned:', results.count, 'hits');

		// 결과에 스니펫 추가
		const searchResults = await Promise.all(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			results.hits.map(async (hit: any) => {
				const doc = hit.document;
				const snippet = await searchService.getSnippet(doc.filePath, doc.range);
				return {
					filePath: doc.filePath,
					range: doc.range,
					score: hit.score,
					snippet,
				};
			})
		);

		console.log('[Extension] Sending searchResults to UI Webview:', searchResults.length, 'items');
		webviewView.webview.postMessage({
			type: 'searchResults',
			data: searchResults
		});
	} catch (error) {
		console.error('[Extension] Search error:', error);
		webviewView.webview.postMessage({
			type: 'searchError',
			message: '검색 중 오류가 발생했습니다.'
		});
	} finally {
		pendingSearchRequests.delete(requestId);
	}
}

/**
 * 확장 비활성화
 */
export function deactivate(): void {
	fileWatcher?.dispose();
	gitWatcher?.dispose();
	console.log('[gitbbon-search] Extension deactivated');
}

