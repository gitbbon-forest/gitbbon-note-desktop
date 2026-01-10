/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pipeline, AutoTokenizer, type Pipeline, type PreTrainedTokenizer } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/multilingual-e5-small';

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
					console.log('[ModelHost] ✓ WebGPU available');
					return true;
				}
			}
		} catch (e) {
			console.log('[ModelHost] WebGPU check failed:', e);
		}
		console.log('[ModelHost] ✗ Falling back to WASM');
		return false;
	}

	async init(): Promise<void> {
		if (this.initialized) {
			console.log('[ModelHost] Already initialized');
			return;
		}

		if (this.initPromise) {
			console.log('[ModelHost] Already initializing, waiting...');
			return this.initPromise;
		}

		this.initPromise = this._init();
		return this.initPromise;
	}

	private async _init(): Promise<void> {
		console.log('[ModelHost] Starting model initialization...');

		try {
			console.log('[ModelHost] Loading tokenizer...');
			this.sendProgress(0, 'Loading tokenizer...');
			this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);
			console.log('[ModelHost] ✓ Tokenizer loaded');

			console.log('[ModelHost] Loading model with progress...');
			this.sendProgress(30, 'Loading E5-Small model...');

			const useWebGPU = await this.checkWebGPU();
			console.log('[ModelHost] Creating pipeline...');

			// Note: Using 'unknown' intermediate cast to avoid TypeScript error:
			// "Expression produces a union type that is too complex to represent"
			this.extractor = await (pipeline as Function)('feature-extraction', MODEL_NAME, {
				device: useWebGPU ? 'webgpu' : 'wasm',
				dtype: 'fp32',
				progress_callback: (p: { progress?: number; status?: string; file?: string }) => {
					console.log('[ModelHost] Download progress:', p);
					if (typeof p?.progress === 'number') {
						const modelProgress = 30 + (p.progress * 0.7);
						this.sendProgress(modelProgress, `Model loading: ${Math.round(p.progress)}%`);
					} else if (p?.status) {
						console.log('[ModelHost] Status:', p.status, p.file || '');
					}
				},
			}) as Pipeline;

			this.initialized = true;
			this.sendProgress(100, 'Model ready');
			console.log(`[ModelHost] ✓ Model initialized with ${useWebGPU ? 'WebGPU 🚀' : 'WASM'}`);

			this.sendMessage({ type: 'modelReady' });
		} catch (error) {
			console.error('[ModelHost] ✗ Initialization failed:', error);
			this.sendMessage({ type: 'modelError', error: (error as Error).message });
		}
	}

	private sendProgress(progress: number, message: string): void {
		console.log(`[ModelHost] Progress: ${progress}% - ${message}`);
		this.sendMessage({ type: 'modelProgress', progress, message });
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

	async embedDocumentChunks(filePath: string, content: string): Promise<void> {
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

			const vector = await this.embedDocument(chunkText);

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

	// 중복 메시지 체크 (requestId 또는 filePath 기반)
	const messageId = message.requestId || message.filePath || `${message.type}-${Date.now()}`;
	if (processedMessages.has(messageId)) {
		console.log('[ModelHost] Duplicate message ignored:', message.type, messageId);
		return;
	}
	processedMessages.add(messageId);
	// 오래된 메시지 ID 정리 (5초 후)
	setTimeout(() => processedMessages.delete(messageId), 5000);

	console.log('[ModelHost] Received message:', message.type);

	switch (message.type) {
		case 'initModel':
			await modelHost.init();
			break;
		case 'embedDocument':
			modelHost.enqueue(async () => {
				await modelHost.embedDocumentChunks(message.filePath, message.content);
			}).catch(error => {
				console.error('[ModelHost] embedDocument error:', error);
				(window as WindowWithGitbbonBridge).gitbbonBridge?.postMessage({
					type: 'embeddingError',
					filePath: message.filePath,
					error: (error as Error).message
				}) || window.parent.postMessage({
					type: 'embeddingError',
					filePath: message.filePath,
					error: (error as Error).message
				}, '*');
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
				console.error('[ModelHost] embedQuery error:', error);
				((window as WindowWithGitbbonBridge).gitbbonBridge?.postMessage || ((data: Record<string, unknown>) => window.parent.postMessage(data, '*')))({
					type: 'queryEmbeddingError',
					error: (error as Error).message,
					requestId: message.requestId
				});
			});
			break;
	}
});

// Also listen for direct postMessage (fallback)
window.addEventListener('message', (event) => {
	if (event.source !== window.parent) {
		return;
	}
	window.dispatchEvent(new CustomEvent('gitbbon-message', { detail: event.data }));
});

console.log('[ModelHost] Initialized and listening for messages');

// AUTO-INITIALIZE: Start loading model immediately
console.log('[ModelHost] Starting auto-initialization...');
modelHost.init().then(() => {
	console.log('[ModelHost] Auto-initialization completed');
}).catch(err => {
	console.error('[ModelHost] Auto-initialization failed:', err);
});
