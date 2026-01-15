/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pipeline, AutoTokenizer, env, type Pipeline, type PreTrainedTokenizer } from '@huggingface/transformers';

// Transformers 환경 설정 추가
env.allowLocalModels = false;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/{revision}/';

const MODEL_NAME = 'Xenova/multilingual-e5-small';

// 전역 설정 객체 타입 정의
interface GitbbonSearchConfig {
	assetsUri: string;
}

declare const GITBBON_SEARCH_CONFIG: GitbbonSearchConfig;

// Transformers 환경 설정 추가
if (typeof GITBBON_SEARCH_CONFIG !== 'undefined' && GITBBON_SEARCH_CONFIG.assetsUri) {
	// ONNX Runtime WASM 경로 설정 (v3 기준)
	// 기본적으로 워커 모드(proxy: true) 사용.
	// 이전의 proxy: false 설정은 자산 파일 누락 문제를 우회하기 위한 임시책이었으나,
	// 이제 자산 복사가 정상화되어 워커 모드를 사용합니다.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(env.backends.onnx as any).wasm.wasmPaths = GITBBON_SEARCH_CONFIG.assetsUri;
	// 초기화 로그는 브라우저 개발자 도구용으로만 (sendLog 정의 전이라 직접 postMessage 불가)
}

// 익스텐션 Output 채널로 중요 로그만 전달하기 위한 인터페이스
interface WindowWithGitbbonBridge extends Window {
	gitbbonBridge?: {
		postMessage: (data: Record<string, unknown>) => void;
	};
}

/**
 * 익스텐션 Output 채널로 로그 전달 (중요 로그만 사용)
 * console.log는 브라우저 개발자 도구용으로만 사용
 */
function sendLog(level: 'info' | 'warn' | 'error', message: string): void {
	if ((window as WindowWithGitbbonBridge).gitbbonBridge) {
		(window as WindowWithGitbbonBridge).gitbbonBridge!.postMessage({ type: 'consoleLog', level, message });
	} else {
		window.parent.postMessage({ type: 'consoleLog', level, message }, '*');
	}
}



class ModelHost {
	private extractor: Pipeline | null = null;
	private tokenizer: PreTrainedTokenizer | null = null;
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	// 우선순위 큐 (검색 쿼리 우선 처리)
	private highPriorityQueue: Array<{ task: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void; timeoutMs: number }> = [];
	private normalQueue: Array<{ task: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void; timeoutMs: number }> = [];
	private isProcessing = false;

	/**
	 * 요청을 큐에 추가하고 순차 처리
	 */
	async enqueue<T>(task: () => Promise<T>, timeoutMs = 60000, priority: 'high' | 'normal' = 'normal'): Promise<T> {
		return new Promise((resolve, reject) => {
			const queue = priority === 'high' ? this.highPriorityQueue : this.normalQueue;
			queue.push({ task: task as () => Promise<unknown>, resolve: resolve as (value: unknown) => void, reject, timeoutMs });
			this.processQueue();
		});
	}

	private async processQueue(): Promise<void> {
		if (this.isProcessing || (this.highPriorityQueue.length === 0 && this.normalQueue.length === 0)) {
			return;
		}

		this.isProcessing = true;

		// 고우선순위 큐(검색 쿼리)를 먼저 확인
		let item = this.highPriorityQueue.shift();
		if (!item) {
			item = this.normalQueue.shift();
		}

		if (!item) {
			this.isProcessing = false;
			return;
		}

		const { task, resolve, reject, timeoutMs } = item;

		try {
			const result = await Promise.race([
				task(),
				new Promise((_, timeoutReject) =>
					setTimeout(() => timeoutReject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs)
				)
			]);
			resolve(result);
		} catch (error) {
			reject(error as Error);
		} finally {
			this.isProcessing = false;
			this.processQueue();
		}
	}

	private async checkWebGPU(): Promise<boolean> {
		try {
			if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
				const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
				if (adapter) {
					sendLog('info', '[modelHost] ✓ WebGPU available');
					return true;
				}
			}
		} catch {
			// WebGPU 체크 실패 - WASM으로 폴백
		}
		sendLog('info', '[modelHost] Using WASM backend');
		return false;
	}

	async init(): Promise<void> {
		sendLog('info', '[modelHost] init() called');
		if (this.initialized) {
			sendLog('info', '[modelHost] Already initialized, skipping');
			return;
		}

		if (this.initPromise) {
			sendLog('info', '[modelHost] Init already in progress, waiting...');
			return this.initPromise;
		}

		sendLog('info', '[modelHost] Starting new initialization...');
		this.initPromise = this._init();
		return this.initPromise;
	}

	private async _init(): Promise<void> {
		sendLog('info', '[modelHost] _init() started');
		sendLog('info', '[modelHost] Starting model initialization...');

		try {
			sendLog('info', '[modelHost] Loading tokenizer from: ' + MODEL_NAME);
			this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);
			sendLog('info', '[modelHost] ✓ Tokenizer loaded');

			const useWebGPU = await this.checkWebGPU();

			sendLog('info', '[modelHost] Starting pipeline creation with device: ' + (useWebGPU ? 'webgpu' : 'wasm'));
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.extractor = await (pipeline as any)('feature-extraction', MODEL_NAME, {
				device: useWebGPU ? 'webgpu' : 'wasm',
				dtype: 'fp16',
				progress_callback: (p: { progress?: number; status?: string; file?: string }) => {
					// 시작과 완료 이벤트만 Output 채널에 전달
					if (p?.status === 'initiate') {
						sendLog('info', `[modelHost] Loading started: ${p.file || 'model'}`);
					} else if (p?.status === 'done') {
						sendLog('info', `[modelHost] Loading completed: ${p.file || 'model'}`);
					} else if (p?.status === 'progress') {
						// 10% 단위로 진행률 로그 출력 (디버깅용)
						const progress = p.progress ?? 0;
						if (Math.floor(progress) % 25 === 0) {
							sendLog('info', `[modelHost] Progress: ${p.file || 'model'} - ${Math.floor(progress)}%`);
						}
					}
				},
			}) as Pipeline;
			sendLog('info', '[modelHost] Pipeline created successfully');

			this.initialized = true;
			sendLog('info', `[modelHost] ✓ Model initialized with ${useWebGPU ? 'WebGPU 🚀' : 'WASM'}`);

			this.sendMessage({ type: 'modelReady' });
		} catch (error) {
			sendLog('error', `[modelHost] ✗ Initialization failed: ${(error as Error).message}`);
			this.sendMessage({ type: 'modelError', error: (error as Error).message });
		}
	}

	private sendMessage(data: Record<string, unknown>): void {
		if ((window as WindowWithGitbbonBridge).gitbbonBridge) {
			(window as WindowWithGitbbonBridge).gitbbonBridge!.postMessage(data);
		} else {
			window.parent.postMessage(data, '*');
		}
	}

	async embedQuery(query: string): Promise<number[]> {
		if (!this.extractor) {
			throw new Error('Model not initialized');
		}
		const input = `query: ${query}`;
		const output = await this.extractor(input, { pooling: 'mean', normalize: true });
		return Array.from(output.data as Float32Array);
	}

	async embedDocument(text: string): Promise<number[]> {
		if (!this.extractor) {
			throw new Error('Model not initialized');
		}
		const input = `passage: ${text}`;
		const output = await this.extractor(input, { pooling: 'mean', normalize: true });
		return Array.from(output.data as Float32Array);
	}

	async embedDocumentChunks(filePath: string, content: string, title?: string): Promise<void> {
		if (!this.extractor || !this.tokenizer) {
			throw new Error('Model not initialized');
		}

		const MAX_TOKENS = 512;
		const OVERLAP_TOKENS = 50;

		const tokens = this.tokenizer.encode(content);
		const chunks: Array<{ chunkIndex: number; range: [number, number]; vector: number[] }> = [];
		let offset = 0;
		let chunkIndex = 0;

		while (offset < tokens.length) {
			const endOffset = Math.min(offset + MAX_TOKENS, tokens.length);
			const chunkTokens = tokens.slice(offset, endOffset);
			const chunkText = this.tokenizer.decode(chunkTokens, { skip_special_tokens: true });

			const startPos = this.findCharPosition(content, offset);
			const endPos = this.findCharPosition(content, endOffset);

			// 제목을 청크 앞에 접두사로 추가
			const textWithTitle = title ? `${title}. ${chunkText}` : chunkText;
			const vector = await this.embedDocument(textWithTitle);

			chunks.push({
				chunkIndex,
				range: [startPos, endPos],
				vector
			});

			offset += MAX_TOKENS - OVERLAP_TOKENS;
			chunkIndex++;
		}

		const contentHash = await this.simpleHash(content);

		this.sendMessage({
			type: 'embeddingResult',
			filePath,
			chunks,
			contentHash
		});
	}

	private findCharPosition(text: string, tokenIndex: number): number {
		return Math.min(tokenIndex * 4, text.length);
	}

	private async simpleHash(str: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(str);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
	}
}

interface WindowWithGitbbonBridge extends Window {
	gitbbonBridge?: {
		postMessage: (data: Record<string, unknown>) => void;
	};
}

// Initialize model host
const modelHost = new ModelHost();

// 중복 메시지 처리 방지
const processedMessages = new Set<string>();

// Listen for messages from extension
window.addEventListener('gitbbon-message', async (event) => {
	const message = (event as CustomEvent).detail;
	sendLog('info', '[modelHost] Received gitbbon-message: ' + message.type);

	// 중복 메시지 체크 (requestId 또는 filePath 기반)
	const messageId = message.requestId || message.filePath || `${message.type}-${Date.now()}`;
	if (processedMessages.has(messageId)) {
		sendLog('info', '[modelHost] Duplicate message ignored: ' + messageId);
		return;
	}
	processedMessages.add(messageId);
	// 오래된 메시지 ID 정리 (5초 후)
	setTimeout(() => processedMessages.delete(messageId), 5000);

	switch (message.type) {
		case 'initModel':
			await modelHost.init();
			break;
		case 'embedDocument':
			modelHost.enqueue(async () => {
				await modelHost.embedDocumentChunks(message.filePath, message.content, message.title);
			}).catch(error => {
				console.error('[gitbbon-search][modelHost] embedDocument error:', error);
				const errorData = {
					type: 'embeddingError',
					filePath: message.filePath,
					error: (error as Error).message
				};
				if ((window as WindowWithGitbbonBridge).gitbbonBridge) {
					(window as WindowWithGitbbonBridge).gitbbonBridge!.postMessage(errorData);
				} else {
					window.parent.postMessage(errorData, '*');
				}
			});
			break;
		case 'embedQuery':
			modelHost.enqueue(async () => {
				const vector = await modelHost.embedQuery(message.query);
				((window as WindowWithGitbbonBridge).gitbbonBridge?.postMessage || ((data: Record<string, unknown>) => window.parent.postMessage(data, '*')))({
					type: 'queryEmbedding',
					vector,
					requestId: message.requestId
				});
			}, 10000, 'high').catch(error => {
				console.error('[gitbbon-search][modelHost] embedQuery error:', error);
				const errorData = {
					type: 'queryEmbeddingError',
					error: (error as Error).message,
					requestId: message.requestId
				};
				if ((window as WindowWithGitbbonBridge).gitbbonBridge) {
					(window as WindowWithGitbbonBridge).gitbbonBridge!.postMessage(errorData);
				} else {
					window.parent.postMessage(errorData, '*');
				}
			});
			break;
	}
});

// Also listen for direct postMessage (fallback)
window.addEventListener('message', (event) => {
	if (event.source !== window.parent) {
		return;
	}
	sendLog('info', '[modelHost] Received postMessage, dispatching as gitbbon-message: ' + (event.data?.type || 'unknown'));
	window.dispatchEvent(new CustomEvent('gitbbon-message', { detail: event.data }));
});

sendLog('info', '[modelHost] Initialized and listening for messages');
sendLog('info', '[modelHost] Waiting for initModel message...');

// Webview가 준비되었음을 Extension에 알림
// 이 메시지를 받으면 Extension이 initModel을 전송해야 함
window.parent.postMessage({ type: 'webviewReady' }, '*');
