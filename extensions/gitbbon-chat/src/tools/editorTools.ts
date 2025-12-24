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
				// 1. 일반 TextEditor 확인
				const editor = vscode.window.activeTextEditor;
				if (editor && !editor.selection.isEmpty) {
					return editor.document.getText(editor.selection);
				}

				// 2. gitbbon-editor (Milkdown) 확인
				if (isGitbbonEditorActive()) {
					try {
						const selection = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getSelection');
						if (selection) {
							return selection;
						}
					} catch (e) {
						console.error('[editorTools] gitbbon.editor.getSelection failed:', e);
					}
				}

				return "Error: 선택된 텍스트가 없습니다.";
			},
		}),

		get_current_file: tool({
			description: '현재 활성화된 파일의 전체 내용을 가져옵니다. "파일 전체", "문맥", "코드 전체" 등을 파악해야 할 때 사용합니다.',
			inputSchema: z.object({}),
			execute: async () => {
				// 1. 일반 TextEditor 확인
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					return editor.document.getText();
				}

				// 2. gitbbon-editor (Milkdown) 확인
				if (isGitbbonEditorActive()) {
					try {
						const content = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getContent');
						if (content) {
							return content;
						}
					} catch (e) {
						console.error('[editorTools] gitbbon.editor.getContent failed:', e);
					}
				}

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
				if (messages.length === 0) {
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

				return formatted;
			},
		}),
	};
}

// 하위 호환성을 위한 기본 export (messages 없이 사용 시)
export const editorTools = createEditorTools([]);
