import * as vscode from 'vscode';
import { tool } from 'ai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';

/**
 * Editor Tools for AI Chat
 *
 * 사용자의 주 편집 환경은 gitbbon-editor (Milkdown 기반 마크다운 에디터)입니다.
 * gitbbon-editor는 VS Code의 CustomTextEditorProvider를 사용하므로
 * vscode.window.activeTextEditor로 접근할 수 없습니다.
 *
 * 따라서 다음 순서로 처리합니다:
 * 1. 먼저 일반 TextEditor(activeTextEditor)를 확인
 * 2. 없으면 활성 탭이 gitbbon.editor인지 확인하고 커맨드로 통신
 *
 * createEditorTools(messages)는 대화 내역을 클로저로 캡처하여
 * get_chat_history 도구에서 활용할 수 있게 합니다.
 */

/**
 * 현재 활성화된 에디터가 gitbbon-editor (Milkdown)인지 확인
 */
function isGitbbonEditorActive(): boolean {
	const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
	if (activeTab?.input instanceof vscode.TabInputCustom) {
		return activeTab.input.viewType === 'gitbbon.editor';
	}
	return false;
}

/**
 * EditorTools 팩토리 함수
 * 대화 내역(messages)을 클로저로 캡처하여 get_chat_history에서 사용
 */
export function createEditorTools(messages: ModelMessage[]) {
	return {
		get_selection: tool({
			description: '현재 활성화된 에디터에서 사용자가 드래그하여 선택한 텍스트를 가져옵니다. "이거", "선택된 부분" 등을 지칭할 때 사용합니다.',
			inputSchema: z.object({}),
			execute: async () => {
				console.log('[editorTools] get_selection: 실행 시작');

				// 1. 일반 TextEditor 확인
				const editor = vscode.window.activeTextEditor;
				if (editor && !editor.selection.isEmpty) {
					const result = editor.document.getText(editor.selection);
					console.log('[editorTools] get_selection: 완료 (TextEditor)', { length: result.length });
					return result;
				}

				// 2. gitbbon-editor (Milkdown) 확인
				if (isGitbbonEditorActive()) {
					try {
						const selection = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getSelection');
						if (selection) {
							console.log('[editorTools] get_selection: 완료 (gitbbon-editor)', { length: selection.length });
							return selection;
						}
					} catch (e) {
						console.error('[editorTools] gitbbon.editor.getSelection failed:', e);
					}
				}

				console.log('[editorTools] get_selection: 완료 (선택 없음)');
				return "Error: 선택된 텍스트가 없습니다.";
			},
		}),

		get_current_file: tool({
			description: '현재 활성화된 파일의 전체 내용을 가져옵니다. "파일 전체", "문맥", "코드 전체" 등을 파악해야 할 때 사용합니다.',
			inputSchema: z.object({}),
			execute: async () => {
				console.log('[editorTools] get_current_file: 실행 시작');

				// 1. 일반 TextEditor 확인
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					const result = editor.document.getText();
					console.log('[editorTools] get_current_file: 완료 (TextEditor)', { length: result.length });
					return result;
				}

				// 2. gitbbon-editor (Milkdown) 확인
				if (isGitbbonEditorActive()) {
					try {
						const content = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getContent');
						if (content) {
							console.log('[editorTools] get_current_file: 완료 (gitbbon-editor)', { length: content.length });
							return content;
						}
					} catch (e) {
						console.error('[editorTools] gitbbon.editor.getContent failed:', e);
					}
				}

				console.log('[editorTools] get_current_file: 완료 (에디터 없음)');
				return "Error: 활성화된 에디터가 없습니다.";
			},
		}),

		get_chat_history: tool({
			description: '이전 대화 내역을 가져옵니다. 사용자가 "아까", "이전에", "방금 말한" 등을 언급할 때 사용합니다.',
			inputSchema: z.object({
				count: z.number().min(1).max(50).describe('가져올 최근 대화 개수 (1-50)'),
				query: z.string().optional().describe('검색 키워드 (선택). 특정 주제의 대화를 찾을 때 사용'),
			}),
			execute: async ({ count, query }) => {
				console.log('[editorTools] get_chat_history: 실행 시작', { count, query });

				if (messages.length === 0) {
					console.log('[editorTools] get_chat_history: 완료 (대화 없음)');
					return "Error: 이전 대화가 없습니다.";
				}

				let filteredMessages = messages;

				// 검색어가 있으면 필터링
				if (query) {
					const lowerQuery = query.toLowerCase();
					filteredMessages = messages.filter(m => {
						const content = typeof m.content === 'string'
							? m.content
							: JSON.stringify(m.content);
						return content.toLowerCase().includes(lowerQuery);
					});

					if (filteredMessages.length === 0) {
						return `Error: "${query}"를 포함하는 대화를 찾을 수 없습니다.`;
					}
				}

				// 최근 count개 가져오기
				const selectedMessages = filteredMessages.slice(-count);

				// 간결한 형태로 반환
				const formatted = selectedMessages.map((m) => {
					const content = typeof m.content === 'string'
						? m.content
						: JSON.stringify(m.content);

					let truncated = content;
					if (content.length > 500) {
						if (query) {
							// 검색어가 있으면 해당 위치 기준으로 앞뒤 250자 추출
							const lowerContent = content.toLowerCase();
							const matchIndex = lowerContent.indexOf(query.toLowerCase());
							if (matchIndex !== -1) {
								const start = Math.max(0, matchIndex - 250);
								const end = Math.min(content.length, matchIndex + query.length + 250);
								truncated = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
							} else {
								truncated = content.slice(0, 500) + '...';
							}
						} else {
							truncated = content.slice(0, 500) + '...';
						}
					}
					return `[${m.role}]: ${truncated}`;
				}).join('\n\n');

				console.log('[editorTools] get_chat_history: 완료', { count: selectedMessages.length, length: formatted.length });
				return formatted;
			},
		}),

		search_in_workspace: tool({
			description: '프로젝트 전체에서 키워드나 패턴을 검색합니다. (ripgrep 엔진 사용)',
			inputSchema: z.object({
				query: z.string().describe('검색할 키워드 또는 정규표현식'),
				isRegex: z.boolean().optional().describe('정규표현식 사용 여부 (기본: false)'),
				filePattern: z.string().optional().describe('검색할 파일 경로 패턴 (예: src/**/*.ts)'),
				context: z.number().min(0).max(500).optional().describe('검색어 앞뒤로 포함할 문자 수 (기본: 100)'),
				maxResults: z.number().min(1).max(30).optional().describe('최대 검색 결과 수 (기본: 3)'),
			}),
			execute: async ({ query, isRegex, filePattern, context, maxResults }) => {
				console.log('[editorTools] search_in_workspace: 실행 시작', { query, isRegex, filePattern, context, maxResults });

				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) {
					console.log('[editorTools] search_in_workspace: 완료 (워크스페이스 없음)');
					return "Error: 열린 워크스페이스가 없습니다.";
				}

				const matches: string[] = [];
				const MAX_RESULTS = maxResults ?? 3;
				const CONTEXT_LENGTH = context ?? 100;

				// findTextInFiles API 타입 정의 (런타임에 존재할 수 있음)
				interface TextSearchMatch {
					uri: vscode.Uri;
					ranges: vscode.Range[];
					preview: { text: string };
				}

				type FindTextInFilesFunc = (
					query: { pattern: string; isRegExp?: boolean; isCaseSensitive?: boolean; isWordMatch?: boolean },
					options: { include?: vscode.GlobPattern; exclude?: string },
					callback: (result: TextSearchMatch) => void
				) => Thenable<void>;

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const workspaceAny = vscode.workspace as any;

				// 파일별 매치를 수집하기 위한 맵
				const fileMatches = new Map<string, { uri: vscode.Uri; lines: { lineNum: number; text: string }[] }>();

				try {
					const findTextInFiles: FindTextInFilesFunc = workspaceAny.findTextInFiles.bind(vscode.workspace);

					await findTextInFiles(
						{
							pattern: query,
							isRegExp: !!isRegex,
							isCaseSensitive: false,
							isWordMatch: false,
						},
						{
							include: filePattern
								? new vscode.RelativePattern(workspaceFolders[0], filePattern)
								: undefined,
							exclude: '**/{node_modules,.git,dist,out}/**',
						},
						(result: TextSearchMatch) => {
							if (matches.length >= MAX_RESULTS) return;

							const relativePath = vscode.workspace.asRelativePath(result.uri);

							// 같은 파일의 여러 매치를 수집
							if (!fileMatches.has(relativePath)) {
								fileMatches.set(relativePath, { uri: result.uri, lines: [] });
							}

							const fileData = fileMatches.get(relativePath)!;

							// 모든 ranges (동일 파일 내 여러 매치)를 처리
							for (const range of result.ranges) {
								const lineNum = range.start.line + 1;
								// preview.text에서 context 길이만큼 자르기
								const previewText = result.preview.text.trim().slice(0, CONTEXT_LENGTH * 2);
								fileData.lines.push({ lineNum, text: previewText });
							}
						}
					);

					// 수집된 결과를 포맷팅
					for (const [relativePath, data] of fileMatches) {
						if (matches.length >= MAX_RESULTS) break;

						const linesInfo = data.lines
							.slice(0, 5) // 파일당 최대 5개 매치
							.map(l => `  (Line ${l.lineNum}): ${l.text}`)
							.join('\n');

						matches.push(`[${relativePath}]\n${linesInfo}`);
					}

				} catch (e) {
					console.error('[editorTools] search_in_workspace failed:', e);
					return `Error: 검색 실패 - ${e}`;
				}

				if (matches.length === 0) {
					console.log('[editorTools] search_in_workspace: 완료 (결과 없음)');
					return `"${query}"에 대한 검색 결과가 없습니다.`;
				}

				const result = `Found ${matches.length} files with matches:\n\n` + matches.join('\n\n');
				console.log('[editorTools] search_in_workspace: 완료', { matchCount: matches.length, length: result.length });
				return result;
			},
		}),
	};
}

// 하위 호환성을 위한 기본 export (messages 없이 사용 시)
export const editorTools = createEditorTools([]);

