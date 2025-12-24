import * as vscode from 'vscode';
import { tool } from 'ai';
import { z } from 'zod';

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

export const editorTools = {
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
};
