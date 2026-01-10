/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { searchService } from './services/searchService.js';

// Proposed API 타입 정의 (vscode.proposed.aiTextSearchProvider.d.ts에서 발췌)
// VS Code 커스텀 빌드에서만 사용 가능

/**
 * 쿼리 임베딩 요청 함수 (extension.ts에서 주입)
 */
type EmbedQueryFn = (query: string) => Promise<number[]>;

/**
 * VS Code 빌트인 검색에 시멘틱 서치 결과를 제공하는 Provider
 *
 * 참고: AITextSearchProvider, TextSearchMatch2 등은 proposed API로,
 * vscode namespace에서 직접 사용하지 않고 any 타입으로 처리
 */
export class GitbbonAITextSearchProvider {
	readonly name = 'Semantic';

	private embedQuery: EmbedQueryFn | null = null;

	/**
	 * 쿼리 임베딩 함수 설정
	 */
	setEmbedQueryFn(fn: EmbedQueryFn): void {
		this.embedQuery = fn;
	}

	/**
	 * AI 텍스트 검색 결과 제공
	 *
	 * @param query 검색 쿼리 문자열
	 * @param options 검색 옵션
	 * @param progress 결과 보고 콜백
	 * @param token 취소 토큰
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async provideAITextSearchResults(
		query: string,
		options: unknown,
		progress: { report: (match: unknown) => void },
		token: vscode.CancellationToken
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): Promise<{ limitHit: boolean }> {
		console.log('[gitbbon-search][aiTextSearchProvider] Query received:', query);

		if (!this.embedQuery) {
			console.warn('[gitbbon-search][aiTextSearchProvider] embedQuery function not set');
			return { limitHit: false };
		}

		if (!searchService.isReady()) {
			console.warn('[gitbbon-search][aiTextSearchProvider] Search service not ready');
			return { limitHit: false };
		}

		try {
			// 1. 쿼리를 벡터로 변환
			console.log('[gitbbon-search][aiTextSearchProvider] Embedding query...');
			const queryVector = await this.embedQuery(query);

			if (token.isCancellationRequested) {
				return { limitHit: false };
			}

			// 2. 벡터 검색 수행
			console.log('[gitbbon-search][aiTextSearchProvider] Performing vector search...');
			const results = await searchService.vectorSearch(queryVector, 20);

			if (token.isCancellationRequested) {
				return { limitHit: false };
			}

			// 3. 결과를 TextSearchMatch2로 변환하여 보고
			console.log(`[gitbbon-search][aiTextSearchProvider] Found ${results.count} results`);

			for (const hit of results.hits) {
				if (token.isCancellationRequested) {
					break;
				}

				const filePath = hit.document.filePath as string;
				const range = hit.document.range as [number, number];

				// 스니펫 가져오기
				const snippet = await searchService.getSnippet(filePath, range);

				if (snippet) {
					const fileUri = vscode.Uri.file(filePath);

					// 파일 내용 읽어서 라인 번호 계산
					try {
						const content = await vscode.workspace.fs.readFile(fileUri);
						const text = Buffer.from(content).toString('utf-8');

						// 문자 오프셋을 라인/컬럼으로 변환
						const beforeRange = text.substring(0, range[0]);
						const startLine = beforeRange.split('\n').length - 1;
						const lastNewline = beforeRange.lastIndexOf('\n');
						const startCol = range[0] - lastNewline - 1;

						const textInRange = text.substring(range[0], range[1]);
						const lines = textInRange.split('\n');
						const endLine = startLine + lines.length - 1;
						const endCol = lines.length === 1
							? startCol + textInRange.length
							: lines[lines.length - 1].length;

						// TextSearchMatch2 클래스 인스턴스 생성
						// 시맨틱 검색은 의미적 일치 위치를 알 수 없으므로 하이라이트 없음
						const sourceRange = new vscode.Range(startLine, startCol, endLine, endCol);
						const previewRange = new vscode.Range(0, 0, 0, 0);  // 빈 범위 = 하이라이트 없음

						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const TextSearchMatch2 = (vscode as any).TextSearchMatch2;
						if (TextSearchMatch2) {
							const match = new TextSearchMatch2(
								fileUri,
								[{ sourceRange, previewRange }],
								snippet
							);

							progress.report(match);
						}
					} catch (e) {
						console.warn(`[gitbbon-search][aiTextSearchProvider] Failed to read file ${filePath}:`, e);
					}
				}
			}

			return {
				limitHit: results.count > 20,
			};
		} catch (error) {
			console.error('[gitbbon-search][aiTextSearchProvider] Search failed:', error);
			return { limitHit: false };
		}
	}
}

// 싱글톤 인스턴스
export const aiTextSearchProvider = new GitbbonAITextSearchProvider();
