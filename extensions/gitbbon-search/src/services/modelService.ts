/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pipeline, AutoTokenizer, type FeatureExtractionPipeline, type PreTrainedTokenizer } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/multilingual-e5-small';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 50;

/**
 * E5-Small 모델 서비스
 * 문서/쿼리 임베딩 및 텍스트 청킹 담당
 */
export class ModelService {
	private extractor: FeatureExtractionPipeline | null = null;
	private tokenizer: PreTrainedTokenizer | null = null;
	private initialized = false;

	/**
	 * 모델 초기화
	 */
	async init(progressCallback?: (progress: number, message: string) => void): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			progressCallback?.(0, 'Loading tokenizer...');
			this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);

			progressCallback?.(30, 'Loading E5-Small model...');
			this.extractor = await pipeline('feature-extraction', MODEL_NAME, {
				device: 'cpu',  // Node.js 환경에서는 cpu만 지원
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
			console.log('[ModelService] E5-Small model initialized');
		} catch (error) {
			console.error('[ModelService] Initialization failed:', error);
			throw error;
		}
	}

	/**
	 * 문서 임베딩 (passage prefix 사용)
	 */
	async embedDocument(text: string): Promise<number[]> {
		if (!this.extractor) {
			throw new Error('Model not initialized');
		}

		const input = `passage: ${text}`;
		const output = await this.extractor(input, { pooling: 'mean', normalize: true });
		return Array.from(output.data as Float32Array);
	}

	/**
	 * 쿼리 임베딩 (query prefix 사용)
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
	 * 텍스트를 청크로 분할 (토크나이저 기반)
	 */
	async chunkText(text: string): Promise<{ text: string; range: [number, number] }[]> {
		if (!this.tokenizer) {
			throw new Error('Tokenizer not initialized');
		}

		// 줄바꿈을 스페이스로 정규화하고 다중 공백 제거
		const normalizedText = text.replace(/\s+/g, ' ').trim();

		// 토큰화
		const encoded = this.tokenizer(normalizedText);
		const tokenIds = encoded.input_ids.tolist()[0] as number[];

		// 짧은 문서는 청킹 불필요
		if (tokenIds.length <= CHUNK_SIZE) {
			return [{ text: normalizedText, range: [0, normalizedText.length] }];
		}

		// 청킹
		const chunks: { text: string; range: [number, number] }[] = [];
		const stepSize = CHUNK_SIZE - CHUNK_OVERLAP;
		let charOffset = 0;

		for (let tokenStart = 0; tokenStart < tokenIds.length; tokenStart += stepSize) {
			const tokenEnd = Math.min(tokenStart + CHUNK_SIZE, tokenIds.length);
			const chunkTokenIds = tokenIds.slice(tokenStart, tokenEnd);
			const chunkText = this.tokenizer.decode(chunkTokenIds, { skip_special_tokens: true });

			// 대략적인 문자 위치 계산
			const chunkStart = charOffset;
			const chunkEnd = Math.min(chunkStart + chunkText.length, normalizedText.length);

			chunks.push({
				text: chunkText,
				range: [chunkStart, chunkEnd]
			});

			// 다음 청크의 시작 위치 계산
			if (tokenStart + stepSize < tokenIds.length) {
				const overlapTokens = tokenIds.slice(tokenStart, tokenStart + stepSize);
				const overlapText = this.tokenizer.decode(overlapTokens, { skip_special_tokens: true });
				charOffset += overlapText.length;
			}
		}

		return chunks;
	}

	/**
	 * 모델이 초기화되었는지 확인
	 */
	isReady(): boolean {
		return this.initialized;
	}

	/**
	 * 리소스 해제
	 */
	dispose(): void {
		this.extractor = null;
		this.tokenizer = null;
		this.initialized = false;
	}
}

// 싱글톤 인스턴스
export const modelService = new ModelService();
