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
import { logService } from './services/logService.js';

// 모델명 상수
const MODEL_NAME = 'Xenova/multilingual-e5-small';
const VECTOR_DIMENSION = 384;

let fileWatcher: FileWatcher | null = null;
let gitWatcher: GitWatcher | null = null;
let hiddenWebview: vscode.HiddenWebview | null = null;
let modelReady = false;
const pendingQueryEmbeddings = new Map<string, (vector: number[]) => void>();

/**
 * 작업 큐 관리 클래스
 * 동시 실행 수를 제한하여 UI 블로킹 방지
 */
class ProcessingQueue {
	private queue: (() => Promise<void>)[] = [];
	private activeCount = 0;
	private readonly CONCURRENCY_LIMIT = 5; // 동시에 처리할 파일 수

	constructor(private readonly onProgress?: (remaining: number) => void) { }

	add(task: () => Promise<void>) {
		this.queue.push(task);
		this.processNext();
	}

	private async processNext() {
		if (this.activeCount >= this.CONCURRENCY_LIMIT || this.queue.length === 0) {
			return;
		}

		this.activeCount++;
		const task = this.queue.shift();

		if (task) {
			try {
				await task();
			} catch (error) {
				logService.error('Task failed:', error);
			} finally {
				this.activeCount--;
				if (this.onProgress) {
					this.onProgress(this.queue.length + this.activeCount);
				}
				this.processNext();
			}
		}
	}

	clear() {
		this.queue = [];
	}

	get pending() {
		return this.queue.length + this.activeCount;
	}
}

const processingQueue = new ProcessingQueue((remaining) => {
	if (remaining % 10 === 0 && remaining > 0) {
		logService.info(`Remaining indexing tasks: ${remaining}`);
	}
});

export interface SearchResult {
	filePath: string;
	range: [number, number]; // [startOffset, endOffset]
	score: number;
	snippet: string;
}

export interface GitbbonSearchAPI {
	search(query: string, limit?: number, options?: { filePathPrefix?: string }): Promise<SearchResult[]>;
}



// NOTE: 인덱싱은 Webview에서 Worker를 통해 처리됨
// 추후 Webview ↔ Extension 간 인덱싱 메시지 통신 구현 예정

/**
 * 확장 활성화
 */
export async function activate(context: vscode.ExtensionContext): Promise<GitbbonSearchAPI> {
	logService.init();
	logService.info('Extension activating...');

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
	// FileSystemWatcher 등록
	fileWatcher = new FileWatcher(async (uris) => {
		if (uris && uris.length > 0) {
			logService.info(`${uris.length} files changed - queuing for reindexing...`);
			for (const uri of uris) {
				processingQueue.add(() => indexFile(uri));
			}
		}
	});
	context.subscriptions.push(fileWatcher);

	// Git Watcher 등록 (TODO: Webview 인덱싱 구현 후 연결)
	gitWatcher = new GitWatcher(async () => {
		logService.info('Git state changed - reindex needed. Not implemented yet.');
	});
	context.subscriptions.push(gitWatcher);

	// Hidden Webview 초기화 (배경에서 모델 로딩)
	logService.debug('Starting Hidden Webview initialization...');
	try {
		logService.debug('Creating HiddenWebview...');
		hiddenWebview = vscode.window.createHiddenWebview('gitbbon-search-model', {
			webviewOptions: {
				enableScripts: true
			}
		});
		logService.debug('HiddenWebview created successfully');

		// modelHost.js를 읽어서 인라인으로 삽입 (Hidden Webview에서 외부 ES 모듈 로드 불가)
		const modelHostScriptUri = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'modelHost.js');
		const modelHostScriptContent = await vscode.workspace.fs.readFile(modelHostScriptUri);
		const scriptCode = Buffer.from(modelHostScriptContent).toString('utf-8');

		// WASM/JS 자산 디렉토리의 Webview URI 생성
		// HiddenWebview가 asWebviewUri를 지원하지 않을 수 있으므로 manual construction 시도
		const assetsPath = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'assets').fsPath;
		const assetsUri = `vscode-file://vscode-app${assetsPath}`;

		hiddenWebview.html = `<!DOCTYPE html>
<html lang="ko">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Gitbbon Search - Model Host (Hidden)</title>
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' vscode-resource: vscode-file:; style-src 'unsafe-inline' vscode-resource: vscode-file:; font-src https: data: vscode-resource: vscode-file:; connect-src https: data: vscode-resource: vscode-file:;">
	<script>
		// 전역 설정 객체 주입
		window.GITBBON_SEARCH_CONFIG = {
			assetsUri: "${assetsUri.toString()}/"
		};
	</script>
	<style>body { display: none; }</style>
</head>
<body>
	<script>
		// Debug: 스크립트 로드 확인
		// console.log('[modelHost] Script loading...');
		window.addEventListener('error', (e) => {
			window.parent.postMessage({ type: 'consoleLog', level: 'error', message: '[modelHost SCRIPT ERROR] ' + e.message + ' at ' + e.filename + ':' + e.lineno }, '*');
		});
	</script>
	<script type="module">${scriptCode}</script>
</body>
</html>`;

		logService.debug('Hidden Webview HTML set, length: ' + hiddenWebview.html.length);

		// Hidden Webview로부터 메시지 수신
		logService.info('[DEBUG] Setting up message handler...');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		hiddenWebview.onDidReceiveMessage(async (message: any) => {
			logService.debug('Received message from Hidden Webview: ' + message.type);
			switch (message.type) {
				case 'webviewReady':
					// Webview가 준비되었으므로 이제 initModel 전송
					logService.debug('Received webviewReady, sending initModel message...');
					hiddenWebview!.postMessage({ type: 'initModel' });
					break;
				case 'modelReady':
					modelReady = true;
					logService.info('Model ready in hidden webview!');

					// AITextSearchProvider 설정 및 등록
					aiTextSearchProvider.setEmbedQueryFn(embedQuery);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const registerFn = (vscode.workspace as any).registerAITextSearchProvider;
					if (registerFn) {
						context.subscriptions.push(
							registerFn('file', aiTextSearchProvider)
						);
						logService.info('AITextSearchProvider registered for file scheme');
					} else {
						logService.warn('registerAITextSearchProvider not available (proposed API)');
					}

					// 모델이 준비되면 인덱싱 시작
					await startBackgroundIndexing();
					break;
				case 'modelProgress':
					// 모델 로딩 진행률은 로그 출력하지 않음 (과도한 로그 방지)
					// 시작/완료 이벤트는 modelHost에서 별도 로그 출력
					break;
				case 'modelError':
					logService.error('Model error:', message.error);
					break;
				case 'embeddingResult':
					await handleEmbeddingResult(message);
					break;
				case 'embeddingError':
					// 임베딩 실패 처리
					logService.error(`Embedding failed for ${message.filePath}:`, message.error);
					break;
				case 'queryEmbedding':
					// 쿼리 임베딩 결과 수신 - 벡터 검색 수행
					logService.info(`Query embedding received, requestId: ${message.requestId}`);

					// AITextSearchProvider를 위한 콜백 처리
					const aiSearchResolver = pendingQueryEmbeddings.get(message.requestId);
					if (aiSearchResolver) {
						aiSearchResolver(message.vector);
						pendingQueryEmbeddings.delete(message.requestId);
					}
					break;
				case 'queryEmbeddingError':
					// 쿼리 임베딩 오류
					logService.error(`Query embedding error: ${message.error}`);
					if (message.stack) {
						logService.debug(`Error stack: ${message.stack}`);
					}
					// pending request 정리
					if (pendingQueryEmbeddings.has(message.requestId)) {
						pendingQueryEmbeddings.delete(message.requestId);
					}
					break;
				case 'consoleLog':
					// 웹뷰 콘솔 로그를 확장 출력 채널로 전달
					if (message.level === 'error') {
						logService.error(message.message);
					} else if (message.level === 'warn') {
						logService.warn(message.message);
					} else {
						logService.info(message.message);
					}
					break;
			}
		});

		// 모델 로딩 시작 요청은 webviewReady 메시지를 받은 후에 수행
		// (initModel을 즉시 보내면 Webview가 아직 리스너를 설정하지 않아 메시지가 손실될 수 있음)
		logService.debug('Hidden Webview created, waiting for webviewReady message...');

		context.subscriptions.push(hiddenWebview);
	} catch (error) {
		logService.error('Failed to create hidden webview:', error);
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
				vscode.window.showInformationMessage('인덱스가 삭제되었습니다. 자동으로 재인덱싱될 때까지 기다려주세요.');
			}
		})
	);

	logService.info('Extension activated!');

	return {
		search: (query: string, limit?: number, options?: { filePathPrefix?: string }) => executeSemanticSearch(query, limit, options)
	};
}

/**
 * 쿼리 임베딩 요청 헬퍼
 */
async function embedQuery(query: string): Promise<number[]> {
	if (!hiddenWebview || !modelReady) {
		logService.warn(`embedQuery failed: hiddenWebview=${!!hiddenWebview}, modelReady=${modelReady}`);
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
async function executeSemanticSearch(query: string, limit: number = 5, options?: { filePathPrefix?: string }): Promise<SearchResult[]> {
	try {
		logService.info(`Executing semantic search for: "${query}" (prefix: ${options?.filePathPrefix ?? 'none'})`);
		const vector = await embedQuery(query);

		const results = await searchService.vectorSearch(vector, limit, options?.filePathPrefix);

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
		logService.error('Semantic search failed:', e);
		return [];
	}
}

/**
 * 배경에서 워크스페이스 인덱싱 시작
 */
async function startBackgroundIndexing(): Promise<void> {
	if (!hiddenWebview || !modelReady) {
		logService.info('Skipping indexing - model not ready');
		return;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		logService.info('No workspace folder found');
		return;
	}

	const mdFiles = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
	logService.info(`Background indexing: ${mdFiles.length} markdown files`);


	// 큐 초기화 (이전 작업 취소 효과)
	processingQueue.clear();

	for (const fileUri of mdFiles) {
		processingQueue.add(() => indexFile(fileUri));
	}

	logService.info(`Queued ${mdFiles.length} files for indexing`);
}

/**
 * 단일 파일 인덱싱
 */
async function indexFile(fileUri: vscode.Uri): Promise<void> {
	if (!hiddenWebview || !modelReady) {
		logService.debug(`Skipping indexFile(${fileUri.fsPath}) - model not ready`);
		return;
	}

	try {
		const content = await vscode.workspace.fs.readFile(fileUri);
		const text = Buffer.from(content).toString('utf-8');

		if (text.trim().length === 0) {
			return;
		}


		// 캐시 없음 → 새로 임베딩 요청 (먼저 Frontmatter 제거 및 제목 추출)
		const title = extractTitle(text, fileUri.fsPath);
		const contentWithoutFrontmatter = stripFrontmatter(text);



		// contentHash 계산 (Frontmatter가 제거된 본문 기준)
		// modelHost.ts에서도 embedDocumentChunks에서 content(본문)에 대해서만 해시를 계산하므로 이를 맞춰야 함
		const contentHash = simpleHash(contentWithoutFrontmatter);
		logService.debug(`Checking cache for ${fileUri.fsPath} with hash ${contentHash}`);

		// VectorStorageService로 캐시 확인
		const isValid = await vectorStorageService.hasValidCache(fileUri, contentHash, MODEL_NAME);
		if (isValid) {
			logService.debug(`Using cached embedding for ${fileUri.fsPath}`);
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
		} else {
			logService.info(`Cache invalid for ${fileUri.fsPath}, re-indexing...`);
		}

		logService.debug(`Requesting embedding for ${fileUri.fsPath} (title: ${title})`);
		hiddenWebview.postMessage({
			type: 'embedDocument',
			filePath: fileUri.fsPath,
			content: contentWithoutFrontmatter,
			title,
		});
	} catch (error) {
		logService.error(`Failed to read ${fileUri.fsPath}:`, error);
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
		logService.info(`Indexed ${message.chunks.length} chunks from ${message.filePath}`);

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
		logService.debug(`Saved vector data to ${message.filePath}`);

		// 인덱스 저장 (debounce 적용)
		searchService.debouncedSave();
	} catch (error) {
		logService.error(`Failed to index ${message.filePath}:`, error);
	}
}

/**
 * 쿼리 임베딩 결과 처리 - 벡터 검색 수행 후 결과 반환
 */


/**
 * 확장 비활성화
 */
export function deactivate(): void {
	fileWatcher?.dispose();
	gitWatcher?.dispose();
	logService.info('Extension deactivated');
	logService.dispose();
}

