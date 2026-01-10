/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pipeline, AutoTokenizer, type FeatureExtractionPipeline, type PreTrainedTokenizer } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/multilingual-e5-small';

type ProgressCallback = (progress: number, message: string) => void;

class ModelService {
	private extractor: FeatureExtractionPipeline | null = null;
	private tokenizer: PreTrainedTokenizer | null = null;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	/**
	 * WebGPU 지원 여부 확인
	 */
	private async checkWebGPU(): Promise<boolean> {
		try {
			if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const gpu = (navigator as any).gpu;
				const adapter = await gpu.requestAdapter();
				if (adapter) {
					console.log('[ModelService] ✓ WebGPU available');
					return true;
				}
			}
		} catch (e) {
			console.log('[ModelService] WebGPU check failed:', e);
		}
		console.log('[ModelService] ✗ Falling back to WASM');
		return false;
	}

	/**
	 * 모델 초기화
	 */
	async init(progressCallback?: ProgressCallback): Promise<void> {
		if (this.initialized) {
			return;
		}

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this._init(progressCallback);
		return this.initPromise;
	}

	private async _init(progressCallback?: ProgressCallback): Promise<void> {
		try {
			progressCallback?.(0, 'Loading tokenizer...');
			this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);

			progressCallback?.(30, 'Loading E5-Small model...');

			const useWebGPU = await this.checkWebGPU();
			this.extractor = await pipeline('feature-extraction', MODEL_NAME, {
				device: useWebGPU ? 'webgpu' : 'wasm',
				dtype: 'fp32',
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				progress_callback: (p: any) => {
					if (typeof p?.progress === 'number') {
						const modelProgress = 30 + (p.progress * 0.7);
						progressCallback?.(modelProgress, `Model loading: ${Math.round(p.progress)}%`);
					}
				},
			});

			this.initialized = true;
			progressCallback?.(100, 'Model ready');
			console.log(`[ModelService] Model initialized with ${useWebGPU ? 'WebGPU 🚀' : 'WASM'}`);
		} catch (error) {
			console.error('[ModelService] Initialization failed:', error);
			throw error;
		}
	}

	isReady(): boolean {
		return this.initialized;
	}

	/**
	 * 쿼리 임베딩 (query prefix)
	 */
	async embedQuery(query: string): Promise<number[]> {
		if (!this.extractor) {
			throw new Error('Model not initialized');
		}
		const input = `query: ${query}`;
		const output = await this.extractor(input, { pooling: 'mean', normalize: true });
		return Array.from(output.data as Float32Array);
	}

	/**
	 * 문서 임베딩 (passage prefix)
	 */
	async embedDocument(text: string): Promise<number[]> {
		if (!this.extractor) {
			throw new Error('Model not initialized');
		}
		const input = `passage: ${text}`;
		const output = await this.extractor(input, { pooling: 'mean', normalize: true });
		return Array.from(output.data as Float32Array);
	}
}

export const modelService = new ModelService();
