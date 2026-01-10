/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pipeline, AutoTokenizer, type FeatureExtractionPipeline, type PreTrainedTokenizer } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/multilingual-e5-small';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 50;

let extractor: FeatureExtractionPipeline | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
let initialized = false;

/**
 * WebGPU 지원 여부 확인
 */
async function checkWebGPU(): Promise<boolean> {
	try {
		if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const gpu = (navigator as any).gpu;
			const adapter = await gpu.requestAdapter();
			if (adapter) {
				console.log('[E5Worker] ✓ WebGPU available');
				return true;
			}
		}
	} catch (e) {
		console.log('[E5Worker] WebGPU check failed:', e);
	}
	console.log('[E5Worker] ✗ Falling back to WASM');
	return false;
}

/**
 * 모델 초기화
 */
async function initModel(): Promise<void> {
	if (initialized) {
		return;
	}

	try {
		postMessage({ type: 'progress', progress: 0, message: 'Loading tokenizer...' });
		tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);

		postMessage({ type: 'progress', progress: 30, message: 'Loading E5-Small model...' });

		const useWebGPU = await checkWebGPU();
		extractor = await pipeline('feature-extraction', MODEL_NAME, {
			device: useWebGPU ? 'webgpu' : 'wasm',
			dtype: 'fp32',
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			progress_callback: (p: any) => {
				if (typeof p?.progress === 'number') {
					const modelProgress = 30 + (p.progress * 0.7);
					postMessage({ type: 'progress', progress: modelProgress, message: `Model loading: ${Math.round(p.progress)}%` });
				}
			},
		});

		initialized = true;
		postMessage({ type: 'progress', progress: 100, message: 'Model ready' });
		postMessage({ type: 'ready' });
		console.log(`[E5Worker] Model initialized with ${useWebGPU ? 'WebGPU 🚀' : 'WASM'}`);
	} catch (error) {
		console.error('[E5Worker] Initialization failed:', error);
		postMessage({ type: 'error', error: String(error) });
	}
}

/**
 * 문서 임베딩 (passage prefix)
 */
async function embedDocument(text: string): Promise<number[]> {
	if (!extractor) {
		throw new Error('Model not initialized');
	}
	const input = `passage: ${text}`;
	const output = await extractor(input, { pooling: 'mean', normalize: true });
	return Array.from(output.data as Float32Array);
}

/**
 * 쿼리 임베딩 (query prefix)
 */
async function embedQuery(query: string): Promise<number[]> {
	if (!extractor) {
		throw new Error('Model not initialized');
	}
	const input = `query: ${query}`;
	const output = await extractor(input, { pooling: 'mean', normalize: true });
	return Array.from(output.data as Float32Array);
}

/**
 * 텍스트 청킹
 */
async function chunkText(text: string): Promise<{ text: string; range: [number, number] }[]> {
	if (!tokenizer) {
		throw new Error('Tokenizer not initialized');
	}

	const normalizedText = text.replace(/\s+/g, ' ').trim();
	const encoded = tokenizer(normalizedText);
	const tokenIds = encoded.input_ids.tolist()[0] as number[];

	if (tokenIds.length <= CHUNK_SIZE) {
		return [{ text: normalizedText, range: [0, normalizedText.length] }];
	}

	const chunks: { text: string; range: [number, number] }[] = [];
	const stepSize = CHUNK_SIZE - CHUNK_OVERLAP;
	let charOffset = 0;

	for (let tokenStart = 0; tokenStart < tokenIds.length; tokenStart += stepSize) {
		const tokenEnd = Math.min(tokenStart + CHUNK_SIZE, tokenIds.length);
		const chunkTokenIds = tokenIds.slice(tokenStart, tokenEnd);
		const chunkText = tokenizer.decode(chunkTokenIds, { skip_special_tokens: true });

		const chunkStart = charOffset;
		const chunkEnd = Math.min(chunkStart + chunkText.length, normalizedText.length);

		chunks.push({
			text: chunkText,
			range: [chunkStart, chunkEnd]
		});

		if (tokenStart + stepSize < tokenIds.length) {
			const overlapTokens = tokenIds.slice(tokenStart, tokenStart + stepSize);
			const overlapText = tokenizer.decode(overlapTokens, { skip_special_tokens: true });
			charOffset += overlapText.length;
		}
	}

	return chunks;
}

/**
 * 메시지 핸들러
 */
self.onmessage = async (event: MessageEvent) => {
	const { type, id, payload } = event.data;

	try {
		switch (type) {
			case 'init':
				await initModel();
				break;

			case 'embedDocument':
				const docVector = await embedDocument(payload.text);
				postMessage({ type: 'result', id, result: docVector });
				break;

			case 'embedQuery':
				const queryVector = await embedQuery(payload.query);
				postMessage({ type: 'result', id, result: queryVector });
				break;

			case 'chunkText':
				const chunks = await chunkText(payload.text);
				postMessage({ type: 'result', id, result: chunks });
				break;

			case 'embedDocumentChunks':
				// 문서 청킹 후 각 청크 임베딩
				const textChunks = await chunkText(payload.text);
				const embeddings = [];
				for (let i = 0; i < textChunks.length; i++) {
					const vector = await embedDocument(textChunks[i].text);
					embeddings.push({
						chunkIndex: i,
						range: textChunks[i].range,
						vector
					});
					postMessage({
						type: 'chunkProgress',
						id,
						current: i + 1,
						total: textChunks.length
					});
				}
				postMessage({ type: 'result', id, result: embeddings });
				break;

			default:
				console.warn('[E5Worker] Unknown message type:', type);
		}
	} catch (error) {
		postMessage({ type: 'error', id, error: String(error) });
	}
};

// 초기화 시작
initModel();
