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
import { logService } from './logService.js';

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
		logService.info('Orama DB initialized');
	}

	/**
	 * 저장된 인덱스 복원
	 */
	async loadFromStorage(): Promise<boolean> {
		if (!this.context || !this.db) {
			return false;
		}

		try {
			// 1. 파일 스토리지에서 먼저 로드 시도
			let dataStr: string | undefined;
			if (this.context.storageUri) {
				const indexUri = vscode.Uri.joinPath(this.context.storageUri, 'orama-index.json');
				try {
					const content = await vscode.workspace.fs.readFile(indexUri);
					dataStr = new TextDecoder().decode(content);
					logService.info('Loaded index from file storage');
				} catch {
					// 파일 없으면 무시하고 workspaceState 확인
				}
			}

			// 2. 파일 없으면 workspaceState 확인 (마이그레이션)
			if (!dataStr) {
				dataStr = this.context.workspaceState.get<string>('orama-index');
				if (dataStr) {
					logService.info('Loaded index from workspaceState (migration)');
					// 마이그레이션: 로드 성공했으므로 즉시 파일로 저장하여 마이그레이션 수행
					// (비동기로 수행하여 현재 로드 프로세스 방해 금지)
					setTimeout(() => this.saveToStorage(), 0);
				}
			}

			if (!dataStr) {
				return false;
			}

			const files = this.context.workspaceState.get<string[]>('indexed-files');
			const chunkIdsData = this.context.workspaceState.get<[string, string[]][]>('file-chunk-ids');

			logService.debug('loadFromStorage - data exists: true');
			logService.debug(`loadFromStorage - indexed files stored: ${files?.length ?? 0}`);

			await load(this.db, JSON.parse(dataStr));
			this.indexedFiles = new Set(files || []);
			this.fileChunkIds = new Map(chunkIdsData || []);

			// 복원 후 DB 문서 수 확인
			const dbCount = await count(this.db);
			logService.debug(`loadFromStorage - DB document count after restore: ${dbCount}`);

			logService.info('Index restored from storage');
			return true;
		} catch (error) {
			logService.error('Failed to load index:', error);
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
			logService.debug(`saveToStorage - DB document count before save: ${dbCount}`);

			const data = await save(this.db);
			const dataStr = JSON.stringify(data);

			// 저장 데이터 크기 확인
			logService.debug(`saveToStorage - serialized data size: ${dataStr.length} bytes`);

			// 1. 파일 스토리지에 저장 (storageUri 사용)
			if (this.context.storageUri) {
				try {
					await vscode.workspace.fs.createDirectory(this.context.storageUri);
					const indexUri = vscode.Uri.joinPath(this.context.storageUri, 'orama-index.json');
					const encoder = new TextEncoder();
					await vscode.workspace.fs.writeFile(indexUri, encoder.encode(dataStr));
					logService.debug(`Index saved to file storage: ${indexUri.fsPath}`);

					// 2. workspaceState의 기존 데이터 삭제 (마이그레이션 완료 후 공간 확보)
					await this.context.workspaceState.update('orama-index', undefined);
				} catch (fileError) {
					logService.error('Failed to save to file:', fileError);
					// 파일 저장 실패 시 fallback으로 workspaceState 사용 (안전장치)
					await this.context.workspaceState.update('orama-index', dataStr);
				}
			} else {
				// storageUri가 없는 경우 (거의 없겠지만) workspaceState 사용
				logService.warn('No storageUri available, falling back to workspaceState');
				await this.context.workspaceState.update('orama-index', dataStr);
			}

			await this.context.workspaceState.update('indexed-files', Array.from(this.indexedFiles));
			await this.context.workspaceState.update('file-chunk-ids', Array.from(this.fileChunkIds.entries()));
		} catch (error) {
			logService.error('Failed to save index:', error);
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
				logService.debug(`indexFileWithEmbeddings - first doc vector[0:5]: ${docs[0].vector.slice(0, 5)}`);
			}

			if (docs.length > 0) {
				await insertMultiple(this.db, docs);
				this.indexedFiles.add(filePath);
				// chunk ID 저장
				this.fileChunkIds.set(filePath, docs.map(d => d.id));

				// 삽입 후 DB 문서 수 확인
				const dbCount = await count(this.db);
				logService.debug(`indexFileWithEmbeddings - DB document count after insert: ${dbCount}`);
			}

			logService.info(`Indexed ${filePath} (${docs.length} chunks)`);
		} catch (error) {
			logService.error(`Failed to index ${filePath}:`, error);
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
			logService.debug(`Replacing ${chunkIds.length} chunks in index for ${filePath}`);
		} catch (error) {
			logService.error(`Failed to remove ${filePath}:`, error);
		}
	}

	/**
	 * 벡터 검색
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async vectorSearch(queryVector: number[], limit = 10, filePathPrefix?: string): Promise<any> {
		if (!this.db) {
			logService.error('vectorSearch called but DB not initialized');
			throw new Error('Search engine not initialized');
		}

		const dbDocCount = await count(this.db);
		logService.debug(`vectorSearch - docs: ${dbDocCount}, results will be returned`);

		// 필터링이 있는 경우 더 많은 결과를 가져와서 JS에서 필터링 (Orama 무료 버전 한계 극복)
		const searchLimit = filePathPrefix ? Math.max(limit * 10, 50) : limit;

		const result = await search(this.db, {
			mode: 'vector',
			vector: {
				value: queryVector,
				property: 'vector',
			},
			limit: searchLimit,
			similarity: 0.8,  // 관련성 낮은 결과 필터링 (0.0~1.0, 높을수록 엄격)
		} as SearchParams<OramaDB>);

		// Project 범위 필터링
		if (filePathPrefix) {
			const originalCount = result.hits.length;
			result.hits = result.hits.filter((hit) => hit.document.filePath.startsWith(filePathPrefix));
			logService.debug(`Filtered results by prefix: ${originalCount} -> ${result.hits.length}`);

			// 요청된 limit만큼 자르기
			if (result.hits.length > limit) {
				result.hits = result.hits.slice(0, limit);
			}
			result.count = result.hits.length;
		}

		logService.info(`Search completed, results: ${result.count}`);
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
			// workspaceState 정리
			await this.context.workspaceState.update('orama-index', undefined);
			await this.context.workspaceState.update('indexed-files', undefined);
			await this.context.workspaceState.update('file-chunk-ids', undefined);

			// 파일 스토리지 정리
			if (this.context.storageUri) {
				try {
					const indexUri = vscode.Uri.joinPath(this.context.storageUri, 'orama-index.json');
					await vscode.workspace.fs.delete(indexUri);
					logService.info('Removed index file from storage');
				} catch {
					// 파일 없으면 무시
				}
			}
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
		logService.info('Index cleared');
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
