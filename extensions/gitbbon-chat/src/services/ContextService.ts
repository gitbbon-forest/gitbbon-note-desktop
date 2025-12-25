import * as vscode from 'vscode';


export interface EditorContext {
	activeFile: string;
	selection: string | null;
	cursorContext: string | null;
	openTabs: string[];
}

export class ContextService {
	private static SELECTION_LIMIT = 1000;

	/**
	 * Checks if Gitbbon Custom Editor (Milkdown) is active.
	 */
	public static isGitbbonEditor(): boolean {
		const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
		if (activeTab?.input instanceof vscode.TabInputCustom) {
			return activeTab.input.viewType === 'gitbbon.editor';
		}
		return false;
	}

	/**
	 * Helper to get relative path or label for the active editor
	 */
	public static getActiveFileName(): string {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			return vscode.workspace.asRelativePath(activeEditor.document.uri);
		} else if (this.isGitbbonEditor()) {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			return activeTab?.label || 'Milkdown Doc';
		}
		return 'None';
	}

	/**
 * Get the selected text from either Standard Editor or Milkdown Editor.
 * Returns object with text and surrounding context (50 chars).
 */
	public static async getSelection(): Promise<{ text: string; before: string; after: string } | null> {
		// 1. Standard Text Editor
		const editor = vscode.window.activeTextEditor;
		if (editor && !editor.selection.isEmpty) {
			const selection = editor.selection;
			const text = editor.document.getText(selection);

			// Get context (50 chars before/after)
			const doc = editor.document;
			const offsetStart = doc.offsetAt(selection.start);
			const offsetEnd = doc.offsetAt(selection.end);

			const startOffset = Math.max(0, offsetStart - 50);
			const beforeRange = new vscode.Range(doc.positionAt(startOffset), selection.start);
			const before = doc.getText(beforeRange);

			const afterEndPos = doc.positionAt(offsetEnd + 50);
			const afterRange = new vscode.Range(selection.end, afterEndPos);
			const after = doc.getText(afterRange);

			return { text, before, after };
		}

		// 2. Milkdown Editor
		if (this.isGitbbonEditor()) {
			try {
				// Try getting selection detail (text + context)
				interface SelectionDetail { text: string; before: string; after: string }
				const detail = await vscode.commands.executeCommand<SelectionDetail | null>('gitbbon.editor.getSelectionDetail');

				if (detail && detail.text) {
					return detail;
				}

				// Fallback to old getSelection if detail fails (backwards compatibility)
				const selection = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getSelection');
				if (selection && selection.length > 0) {
					return { text: selection, before: '', after: '' };
				}
			} catch (e) {
				console.warn('[ContextService] Failed to get selection from milkdown:', e);
			}
		}

		return null;
	}

	/**
	 * Get the full content of the active file.
	 */
	public static async getActiveFileContent(): Promise<string | null> {
		// 1. Standard Text Editor
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			return editor.document.getText();
		}

		// 2. Milkdown Editor
		if (this.isGitbbonEditor()) {
			try {
				const content = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getContent');
				if (content) {
					return content;
				}
			} catch (e) {
				console.warn('[ContextService] Failed to get content from milkdown:', e);
			}
		}

		return null;
	}

	/**
	 * Get cursor context (surrounding lines) when no text is selected.
	 */
	public static async getCursorContext(): Promise<string | null> {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const cursorLine = editor.selection.active.line;
			const startLine = Math.max(0, cursorLine - 5);
			const endLine = Math.min(editor.document.lineCount - 1, cursorLine + 5);
			const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
			return editor.document.getText(range);
		}

		if (this.isGitbbonEditor()) {
			try {
				const context = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getCursorContext');
				if (context && context.length > 0) {
					return context;
				}
			} catch (e) {
				console.warn('[ContextService] Failed to get cursor context from milkdown:', e);
			}
		}

		return null;
	}

	/**
	 * Get list of open tabs
	 */
	public static getOpenTabs(): string[] {
		return vscode.window.tabGroups.all
			.flatMap(group => group.tabs)
			.map(tab => tab.label);
	}

	/**
	 * Reads a specific file from the workspace.
	 */
	public static async readFile(filePath: string): Promise<string> {
		let fileUri: vscode.Uri;
		if (filePath.startsWith('/') || filePath.match(/^[a-zA-Z]:\\/)) {
			fileUri = vscode.Uri.file(filePath);
		} else {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				throw new Error("No workspace folders open");
			}
			fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
		}

		const readData = await vscode.workspace.fs.readFile(fileUri);
		return Buffer.from(readData).toString('utf-8');
	}
}
