/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { searchService } from './services/searchService.js';
import { logService } from './services/logService.js';

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
	async provideAITextSearchResults(
		query: string,
		options: unknown,
		progress: { report: (match: unknown) => void },
		token: vscode.CancellationToken
	): Promise<{ limitHit: boolean }> {
		logService.info('Query received:', query);

		if (!this.embedQuery) {
			logService.warn('embedQuery function not set');
			return { limitHit: false };
		}

		if (!searchService.isReady()) {
			logService.warn('Search service not ready');
			return { limitHit: false };
		}

		try {
			// 1. 쿼리를 벡터로 변환
			logService.info('Embedding query...');
			const queryVector = await this.embedQuery(query);

			if (token.isCancellationRequested) {
				return { limitHit: false };
			}

			// 2. 벡터 검색 수행
			logService.info('Performing vector search...');
			const results = await searchService.vectorSearch(queryVector, 20);

			if (token.isCancellationRequested) {
				return { limitHit: false };
			}

			// 3. 결과를 TextSearchMatch2로 변환하여 보고
			logService.info(`Found ${results.count} results`);

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

					// [Gitbbon] AI 검색 결과의 previewText는 항상 청크 위치의 원본 텍스트를 사용
					// 파일 제목(title)은 FileMatchRenderer에서 별도로 표시하므로
					// 여기서는 실제 검색된 청크의 스니펫을 보여줌
					const previewText = await searchService.getSnippet(filePath, range);

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
						// [Gitbbon] AI 검색 결과는 previewText 전체를 표시해야 하므로
						// previewRange를 스니펫 전체 길이로 설정 (MatchImpl에서 이 범위로 표시함)
						const previewLines = previewText.split('\n');
						const lastLineLength = previewLines[previewLines.length - 1].length;
						const previewRange = new vscode.Range(
							0, 0,
							previewLines.length - 1, lastLineLength
						);

						const match = new TextSearchMatch2(
							fileUri,
							[{ sourceRange, previewRange }],
							previewText
						);

						progress.report(match);
					}
				} catch (e) {
					logService.warn(`Failed to read file ${filePath}:`, e);
				}
			}

			return {
				limitHit: results.count > 20,
			};
		} catch (error) {
			logService.error('Search failed:', error);
			return { limitHit: false };
		}
	}
}

// 싱글톤 인스턴스
export const aiTextSearchProvider = new GitbbonAITextSearchProvider();
