/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { create, insertMultiple, search, save, load, remove, count } from '@orama/orama';
import type { Orama, SearchParams } from '@orama/orama';
import type { IndexedDocument } from '../types.js';
import { vectorStorageService } from './vectorStorageService.js';
import { cleanMarkdown } from './titleExtractor.js';

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
	// 파일별 chunk ID 추적 (removeFile에서 사용)
	private fileChunkIds = new Map<string, string[]>();
	// Debounce 저장을 위한 타이머
	private saveDebounceTimer: NodeJS.Timeout | null = null;
	private readonly SAVE_DEBOUNCE_MS = 1000;
	async init(context: vscode.ExtensionContext): Promise<void> {
		this.context = context;
		this.db = await create({
			schema,
			components: {
				tokenizer: createIntlSegmenterTokenizer(),
			},
		});
		console.log('[gitbbon-search][searchService] Orama DB initialized');
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
			const chunkIdsData = this.context.globalState.get<[string, string[]][]>('file-chunk-ids');

			console.log('[gitbbon-search][searchService] loadFromStorage - data exists:', !!data);
			console.log('[gitbbon-search][searchService] loadFromStorage - indexed files stored:', files?.length ?? 0);

			if (!data) {
				return false;
			}

			await load(this.db, JSON.parse(data));
			this.indexedFiles = new Set(files || []);
			this.fileChunkIds = new Map(chunkIdsData || []);

			// 복원 후 DB 문서 수 확인
			const dbCount = await count(this.db);
			console.log('[gitbbon-search][searchService] loadFromStorage - DB document count after restore:', dbCount);

			console.log('[gitbbon-search][searchService] Index restored from storage');
			return true;
		} catch (error) {
			console.error('[gitbbon-search][searchService] Failed to load index:', error);
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
			// 저장 전 DB 문서 수 확인
			const dbCount = await count(this.db);
			console.log('[gitbbon-search][searchService] saveToStorage - DB document count before save:', dbCount);

			const data = await save(this.db);

			// 저장 데이터 크기 확인
			const dataStr = JSON.stringify(data);
			console.log('[gitbbon-search][searchService] saveToStorage - serialized data size:', dataStr.length, 'bytes');

			await this.context.globalState.update('orama-index', dataStr);
			await this.context.globalState.update('indexed-files', Array.from(this.indexedFiles));
			await this.context.globalState.update('file-chunk-ids', Array.from(this.fileChunkIds.entries()));
			console.log('[gitbbon-search][searchService] Index saved to storage');
		} catch (error) {
			console.error('[gitbbon-search][searchService] Failed to save index:', error);
		}
	}

	/**
	 * 인덱스 저장 (debounce 적용 - 다수 파일 처리 시 한 번만 저장)
	 */
	debouncedSave(): void {
		if (this.saveDebounceTimer) {
			clearTimeout(this.saveDebounceTimer);
		}

		this.saveDebounceTimer = setTimeout(async () => {
			this.saveDebounceTimer = null;
			await this.saveToStorage();
		}, this.SAVE_DEBOUNCE_MS);
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

			// 벡터 값 확인 (첫 번째 문서의 첫 5개 값)
			if (docs.length > 0 && docs[0].vector.length > 0) {
				console.log('[gitbbon-search][searchService] indexFileWithEmbeddings - first doc vector[0:5]:', docs[0].vector.slice(0, 5));
			}

			if (docs.length > 0) {
				await insertMultiple(this.db, docs);
				this.indexedFiles.add(filePath);
				// chunk ID 저장
				this.fileChunkIds.set(filePath, docs.map(d => d.id));

				// 삽입 후 DB 문서 수 확인
				const dbCount = await count(this.db);
				console.log('[gitbbon-search][searchService] indexFileWithEmbeddings - DB document count after insert:', dbCount);
			}

			console.log(`[gitbbon-search][searchService] Indexed ${filePath} (${docs.length} chunks)`);
		} catch (error) {
			console.error(`[gitbbon-search][searchService] Failed to index ${filePath}:`, error);
		}
	}

	/**
	 * 파일 인덱스 제거 (ID 기반 삭제)
	 */
	async removeFile(uri: vscode.Uri): Promise<void> {
		if (!this.db) {
			return;
		}

		const filePath = uri.fsPath;
		const chunkIds = this.fileChunkIds.get(filePath);

		if (!chunkIds || chunkIds.length === 0) {
			// 저장된 ID가 없으면 삭제할 것 없음
			this.indexedFiles.delete(filePath);
			return;
		}

		try {
			// 저장된 ID 목록으로 직접 삭제
			for (const id of chunkIds) {
				try {
					await remove(this.db, id);
				} catch {
					// 이미 제거된 경우 무시
				}
			}

			this.fileChunkIds.delete(filePath);
			this.indexedFiles.delete(filePath);
			console.log(`[gitbbon-search][searchService] Removed ${chunkIds.length} chunks for ${filePath}`);
		} catch (error) {
			console.error(`[gitbbon-search][searchService] Failed to remove ${filePath}:`, error);
		}
	}

	/**
	 * 벡터 검색
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async vectorSearch(queryVector: number[], limit = 10): Promise<any> {
		if (!this.db) {
			console.error('[gitbbon-search][searchService] vectorSearch called but DB not initialized');
			throw new Error('Search engine not initialized');
		}

		const dbDocCount = await count(this.db);
		console.log('[gitbbon-search][searchService] vectorSearch - docs:', dbDocCount, 'results will be returned');

		const result = await search(this.db, {
			mode: 'vector',
			vector: {
				value: queryVector,
				property: 'vector',
			},
			limit,
			similarity: 0.5,  // 관련성 낮은 결과 필터링 (0.0~1.0, 높을수록 엄격)
		} as SearchParams<OramaDB, 'vector'>);

		console.log('[gitbbon-search][searchService] Search completed, results:', result.count);
		return result;
	}

	/**
	 * 파일에서 스니펫 추출 (마크다운 문법 제거)
	 */
	async getSnippet(filePath: string, range: [number, number]): Promise<string> {
		try {
			const uri = vscode.Uri.file(filePath);
			const content = await vscode.workspace.fs.readFile(uri);
			const text = Buffer.from(content).toString('utf-8');
			const rawSnippet = text.slice(range[0], Math.min(range[1], range[0] + 200));
			return cleanMarkdown(rawSnippet);
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
			await this.context.globalState.update('file-chunk-ids', undefined);
		}
		this.indexedFiles.clear();
		this.fileChunkIds.clear();

		// vectors 폴더도 삭제
		await vectorStorageService.clearAllVectors();

		// DB 재생성
		this.db = await create({
			schema,
			components: {
				tokenizer: createIntlSegmenterTokenizer(),
			},
		});
		console.log('[gitbbon-search][searchService] Index cleared');
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
