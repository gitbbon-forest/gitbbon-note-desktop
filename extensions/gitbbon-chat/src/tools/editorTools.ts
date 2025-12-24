import * as vscode from 'vscode';
import { tool } from 'ai';
import { z } from 'zod';

export const editorTools = {
	get_selection: tool({
		description: '현재 활성화된 에디터에서 사용자가 드래그하여 선택한 텍스트를 가져옵니다. "이거", "선택된 부분" 등을 지칭할 때 사용합니다.',
		parameters: z.object({}),
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		execute: async (_args: unknown) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return "Error: 활성화된 에디터가 없습니다.";
			}
			const selection = editor.selection;
			if (selection.isEmpty) {
				return "Error: 선택된 텍스트가 없습니다.";
			}
			return editor.document.getText(selection);
		},
	} as any),
	get_current_file: tool({
		description: '현재 활성화된 파일의 전체 내용을 가져옵니다. "파일 전체", "문맥", "코드 전체" 등을 파악해야 할 때 사용합니다.',
		parameters: z.object({}),
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		execute: async (_args: unknown) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return "Error: 활성화된 에디터가 없습니다.";
			}
			return editor.document.getText();
		},
	} as any),
};
