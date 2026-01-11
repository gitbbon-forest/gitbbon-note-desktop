/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { searchService } from './services/searchService.js';
import { extractTitle } from './services/titleExtractor.js';

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

				const fileUri = vscode.Uri.file(filePath);

				try {
					const content = await vscode.workspace.fs.readFile(fileUri);
					const text = Buffer.from(content).toString('utf-8');

					// [Gitbbon] YAML frontmatter의 title 추출 (마크다운 파일인 경우)
					// title이 있으면 스니펫으로 사용, 없으면 기존 청크 스니펫 사용
					const isMarkdown = filePath.endsWith('.md');
					let previewText: string;
					const highlightRanges: vscode.Range[] = [];

					if (isMarkdown) {
						const title = extractTitle(text, filePath);
						previewText = title;

						// 검색어가 title에 포함되어 있으면 하이라이트 범위 계산 (대소문자 무시)
						const lowerTitle = title.toLowerCase();
						const lowerQuery = query.toLowerCase();
						const matchIndex = lowerTitle.indexOf(lowerQuery);

						if (matchIndex !== -1) {
							// 검색어 위치에 하이라이트 표시
							highlightRanges.push(new vscode.Range(0, matchIndex, 0, matchIndex + query.length));
						}
					} else {
						// 마크다운이 아닌 경우 기존 스니펫 사용
						previewText = await searchService.getSnippet(filePath, range);
					}

					if (!previewText) {
						continue;
					}

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

					const sourceRange = new vscode.Range(startLine, startCol, endLine, endCol);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const TextSearchMatch2 = (vscode as any).TextSearchMatch2;
					if (TextSearchMatch2) {
						// 하이라이트가 있으면 사용, 없으면 빈 범위 (하이라이트 없음)
						const previewRange = highlightRanges.length > 0
							? highlightRanges[0]
							: new vscode.Range(0, 0, 0, 0);

						const match = new TextSearchMatch2(
							fileUri,
							[{ sourceRange, previewRange }],
							previewText
						);

						progress.report(match);
					}
				} catch (e) {
					console.warn(`[gitbbon-search][aiTextSearchProvider] Failed to read file ${filePath}:`, e);
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

