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
const pendingQueryEmbeddings = new Map<string, (vector: number[]) => void>();

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
					// 모델 로딩 진행률 (UI가 없으므로 로그만 출력)
					console.log(`[Extension] Model loading progress: ${message.progress}%`);
					break;
				case 'modelError':
					console.error('[Extension] Model error:', message.error);
					break;
				case 'embeddingResult':
					await handleEmbeddingResult(message);
					break;
				case 'embeddingError':
					// 임베딩 실패 처리
					console.error(`[Extension] Embedding failed for ${message.filePath}:`, message.error);
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
					break;
				case 'queryEmbeddingError':
					// 쿼리 임베딩 오류
					console.error('[Extension] Query embedding error:', message.error);
					if (message.stack) {
						console.error('[Extension] Error stack:', message.stack);
					}
					// pending request 정리
					if (pendingQueryEmbeddings.has(message.requestId)) {
						pendingQueryEmbeddings.delete(message.requestId);
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
				vscode.window.showInformationMessage('인덱스가 삭제되었습니다. 자동으로 재인덱싱될 때까지 기다려주세요.');
			}
		})
	);

	console.log('[gitbbon-search] Extension activated!');

	return {
		search: (query: string, limit?: number, options?: { filePathPrefix?: string }) => executeSemanticSearch(query, limit, options)
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
async function executeSemanticSearch(query: string, limit: number = 5, options?: { filePathPrefix?: string }): Promise<SearchResult[]> {
	try {
		console.log(`[gitbbon-search] Executing semantic search for: "${query}" (prefix: ${options?.filePathPrefix ?? 'none'})`);
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


/**
 * 확장 비활성화
 */
export function deactivate(): void {
	fileWatcher?.dispose();
	gitWatcher?.dispose();
	console.log('[gitbbon-search] Extension deactivated');
}

