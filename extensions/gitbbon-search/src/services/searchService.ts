/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { create, insertMultiple, search, save, load, remove } from '@orama/orama';
import type { Orama, SearchParams } from '@orama/orama';
import type { IndexedDocument } from '../types.js';

const VECTOR_SIZE = 384;

// 한국어/CJK 토크나이저 생성
function createIntlSegmenterTokenizer() {
	const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
	return {
		tokenize: (text: string): string[] => {
			const tokens: string[] = [];
			for (const segment of segmenter.segment(text.toLowerCase())) {
				if (segment.isWordLike && segment.segment.trim()) {
					tokens.push(segment.segment.trim());
				}
			}
			return tokens;
		},
		language: 'multilingual',
		normalizationCache: new Map(),
	};
}

// Orama 스키마 정의
const schema = {
	id: 'string' as const,
	filePath: 'string' as const,
	chunkIndex: 'number' as const,
	range: 'number[]' as const,
	vector: `vector[${VECTOR_SIZE}]` as const,
};

type OramaDB = Orama<typeof schema>;

/**
 * 검색 서비스
 * Orama DB 관리 및 벡터 검색 담당
 */
export class SearchService {
	private db: OramaDB | null = null;
	private context: vscode.ExtensionContext | null = null;
	private indexedFiles = new Set<string>();

	/**
	 * 검색 엔진 초기화
	 */
	async init(context: vscode.ExtensionContext): Promise<void> {
		this.context = context;
		this.db = await create({
			schema,
			components: {
				tokenizer: createIntlSegmenterTokenizer(),
			},
		});
		console.log('[SearchService] Orama DB initialized');
	}

	/**
	 * 저장된 인덱스 복원
	 */
	async loadFromStorage(): Promise<boolean> {
		if (!this.context || !this.db) {
			return false;
		}

		try {
			const data = this.context.globalState.get<string>('orama-index');
			const files = this.context.globalState.get<string[]>('indexed-files');

			if (!data) {
				return false;
			}

			await load(this.db, JSON.parse(data));
			this.indexedFiles = new Set(files || []);
			console.log('[SearchService] Index restored from storage');
			return true;
		} catch (error) {
			console.error('[SearchService] Failed to load index:', error);
			return false;
		}
	}

	/**
	 * 인덱스 저장
	 */
	async saveToStorage(): Promise<void> {
		if (!this.context || !this.db) {
			return;
		}

		try {
			const data = await save(this.db);
			await this.context.globalState.update('orama-index', JSON.stringify(data));
			await this.context.globalState.update('indexed-files', Array.from(this.indexedFiles));
			console.log('[SearchService] Index saved to storage');
		} catch (error) {
			console.error('[SearchService] Failed to save index:', error);
		}
	}

	/**
	 * 단일 파일 인덱싱 (문서 임베딩과 함께 호출 - Webview에서 전달)
	 */
	async indexFileWithEmbeddings(
		filePath: string,
		embeddings: { chunkIndex: number; range: [number, number]; vector: number[] }[]
	): Promise<void> {
		if (!this.db) {
			return;
		}

		try {
			// 기존 문서 제거
			await this.removeFile(vscode.Uri.file(filePath));

			// 문서 추가
			const docs: IndexedDocument[] = embeddings.map((emb) => ({
				id: `${filePath}:${emb.chunkIndex}`,
				filePath,
				chunkIndex: emb.chunkIndex,
				range: emb.range,
				vector: emb.vector,
			}));

			if (docs.length > 0) {
				await insertMultiple(this.db, docs);
				this.indexedFiles.add(filePath);
			}

			console.log(`[SearchService] Indexed ${filePath} (${docs.length} chunks)`);
		} catch (error) {
			console.error(`[SearchService] Failed to index ${filePath}:`, error);
		}
	}

	/**
	 * 파일 인덱스 제거
	 */
	async removeFile(uri: vscode.Uri): Promise<void> {
		if (!this.db) {
			return;
		}

		const filePath = uri.fsPath;

		try {
			// 해당 파일의 모든 청크 검색
			const results = await search(this.db, {
				mode: 'fulltext',
				term: filePath,
				properties: ['filePath'],
				limit: 1000,
			} as SearchParams<OramaDB, 'fulltext'>);

			// 각 문서 제거
			for (const hit of results.hits) {
				try {
					await remove(this.db, hit.id);
				} catch {
					// 이미 제거된 경우 무시
				}
			}

			this.indexedFiles.delete(filePath);
		} catch (error) {
			console.error(`[SearchService] Failed to remove ${filePath}:`, error);
		}
	}

	/**
	 * 벡터 검색
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async vectorSearch(queryVector: number[], limit = 10): Promise<any> {
		if (!this.db) {
			console.error('[SearchService] vectorSearch called but DB not initialized');
			throw new Error('Search engine not initialized');
		}

		console.log('[SearchService] vectorSearch called, vector length:', queryVector.length);
		console.log('[SearchService] Indexed files count:', this.indexedFiles.size);
		console.log('[SearchService] Indexed files:', Array.from(this.indexedFiles));

		const result = await search(this.db, {
			mode: 'vector',
			vector: {
				value: queryVector,
				property: 'vector',
			},
			limit,
			similarity: 0.0,
		} as SearchParams<OramaDB, 'vector'>);

		console.log('[SearchService] Search result count:', result.count);
		return result;
	}



	/**
	 * 파일에서 스니펫 추출
	 */
	async getSnippet(filePath: string, range: [number, number]): Promise<string> {
		try {
			const uri = vscode.Uri.file(filePath);
			const content = await vscode.workspace.fs.readFile(uri);
			const text = Buffer.from(content).toString('utf-8');
			return text.slice(range[0], Math.min(range[1], range[0] + 200));
		} catch {
			return '';
		}
	}

	/**
	 * 인덱싱된 파일 목록
	 */
	getIndexedFiles(): string[] {
		return Array.from(this.indexedFiles);
	}

	/**
	 * 인덱스 비우기
	 */
	async clearIndex(): Promise<void> {
		if (this.context) {
			await this.context.globalState.update('orama-index', undefined);
			await this.context.globalState.update('indexed-files', undefined);
		}
		this.indexedFiles.clear();
		// DB 재생성
		this.db = await create({
			schema,
			components: {
				tokenizer: createIntlSegmenterTokenizer(),
			},
		});
		console.log('[SearchService] Index cleared');
	}

	/**
	 * DB 준비 상태 확인
	 */
	isReady(): boolean {
		return this.db !== null;
	}
}

// 싱글톤 인스턴스
export const searchService = new SearchService();
