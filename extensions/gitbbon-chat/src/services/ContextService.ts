import * as vscode from 'vscode';

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
	 * Helper to get relative path for the active editor.
	 * Uses the actual file path (with extension) instead of the UI display label
	 * to avoid issues where labels omit the file extension (e.g., "chapter 1" instead of "chapter 1.md").
	 */
	public static getActiveFileName(): string {
		let fileName = 'None';
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			fileName = vscode.workspace.asRelativePath(activeEditor.document.uri);
		} else if (this.isGitbbonEditor()) {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			// Use the actual URI path instead of tab.label (which may omit the file extension)
			if (activeTab?.input instanceof vscode.TabInputCustom) {
				fileName = vscode.workspace.asRelativePath(activeTab.input.uri);
			} else {
				fileName = activeTab?.label || 'Milkdown Doc';
			}
		}
		console.log('[gitbbon-chat][Context] Active File Name:', fileName);
		return fileName;
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

			const result = { text, before, after };
			console.log('[gitbbon-chat][Context] Selection:', JSON.stringify(result));
			return result;
		}

		// 2. Milkdown Editor
		if (this.isGitbbonEditor()) {
			try {
				// Try getting selection detail (text + context)
				interface SelectionDetail { text: string; before: string; after: string }
				const detail = await vscode.commands.executeCommand<SelectionDetail | null>('gitbbon.editor.getSelectionDetail');

				if (detail && detail.text) {
					console.log('[gitbbon-chat][Context] Selection (Milkdown):', JSON.stringify(detail));
					return detail;
				}

				// Fallback to old getSelection if detail fails (backwards compatibility)
				const selection = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getSelection');
				if (selection && selection.length > 0) {
					console.log('[gitbbon-chat][Context] Selection (Milkdown Fallback):', selection);
					return { text: selection, before: '', after: '' };
				}
			} catch (e) {
				console.warn('[gitbbon-chat][Context] Failed to get selection from milkdown:', e);
			}
		}

		console.log('[gitbbon-chat][Context] Selection: None');
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
				console.warn('[gitbbon-chat][Context] Failed to get content from milkdown:', e);
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
			const context = editor.document.getText(range);
			console.log('[gitbbon-chat][Context] Cursor Context:', context);
			return context;
		}

		if (this.isGitbbonEditor()) {
			try {
				const context = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getCursorContext');
				if (context && context.length > 0) {
					console.log('[gitbbon-chat][Context] Cursor Context (Milkdown):', context);
					return context;
				}
			} catch (e) {
				console.warn('[gitbbon-chat][Context] Failed to get cursor context from milkdown:', e);
			}
		}

		console.log('[gitbbon-chat][Context] Cursor Context: None');
		return null;
	}

	/**
	 * Get list of open tabs with their actual file paths (including extension).
	 * Falls back to tab.label only when a URI is not available.
	 */
	public static getOpenTabs(): string[] {
		const tabs = vscode.window.tabGroups.all
			.flatMap(group => group.tabs)
			.map(tab => {
				// TabInputText: standard text editor
				if (tab.input instanceof vscode.TabInputText) {
					return vscode.workspace.asRelativePath(tab.input.uri);
				}
				// TabInputCustom: Gitbbon / Milkdown custom editor
				if (tab.input instanceof vscode.TabInputCustom) {
					return vscode.workspace.asRelativePath(tab.input.uri);
				}
				// Fallback for other tab types (e.g., terminal, webview)
				return tab.label;
			});
		console.log('[gitbbon-chat][Context] Open Tabs:', tabs.join(', '));
		return tabs;
	}

	/**
	 * Convert a file path string to a vscode.Uri.
	 * Handles both absolute and relative (workspace-relative) paths.
	 */
	private static pathToUri(filePath: string): vscode.Uri {
		if (filePath.startsWith('/') || filePath.match(/^[a-zA-Z]:\\/)) {
			return vscode.Uri.file(filePath);
		}
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error("No workspace folders open");
		}
		return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
	}

	/**
	 * Resolve a file path to a vscode.Uri, with automatic .md extension fallback.
	 *
	 * When the AI agent omits the file extension (e.g., sends "chapter 1" instead of
	 * "chapter 1.md"), this method detects that the path has no extension and
	 * automatically tries appending ".md" before giving up.
	 *
	 * This is the single source of truth for file resolution — used by readFile,
	 * applySuggestions, and deleteNote.
	 */
	private static async resolveFileUri(filePath: string): Promise<vscode.Uri> {
		const uri = this.pathToUri(filePath);

		// If the path already has a file extension, trust it
		const hasExtension = /\.[a-zA-Z0-9]+$/.test(filePath);
		if (hasExtension) {
			return uri;
		}

		// No extension detected — try the path as-is first
		try {
			await vscode.workspace.fs.stat(uri);
			return uri;
		} catch {
			// Not found without extension — try with .md (the default note format)
			const mdPath = filePath + '.md';
			const mdUri = this.pathToUri(mdPath);
			try {
				await vscode.workspace.fs.stat(mdUri);
				console.log(`[gitbbon-chat][Context] Resolved "${filePath}" -> "${mdPath}" (auto-appended .md)`);
				return mdUri;
			} catch {
				// Neither variant exists — throw with both attempted paths
				throw new Error(`File not found: "${filePath}" (also tried "${mdPath}")`);
			}
		}
	}

	/**
	 * Reads a specific file from the workspace.
	 * Automatically appends .md if the path has no extension and the file is not found.
	 */
	public static async readFile(filePath: string): Promise<string> {
		const fileUri = await this.resolveFileUri(filePath);

		const readData = await vscode.workspace.fs.readFile(fileUri);
		const content = Buffer.from(readData).toString('utf-8');
		console.log(`[gitbbon-chat][Context] Read File: ${filePath}`, content.slice(0, 500) + (content.length > 500 ? '...' : ''));
		return content;
	}

	/**
	 * Apply suggestions to a file using Gitbbon Editor's inline suggestion feature.
	 * If the file is not open, it opens it.
	 * If it's a markdown file, it tries to use the Gitbbon Editor.
	 * @param mode 'direct' (immediate change) or 'suggestion' (ins/del marks)
	 */
	public static async applySuggestions(filePath: string, changes: { oldText: string; newText: string }[], mode: 'direct' | 'suggestion' = 'direct'): Promise<void> {
		if (!filePath) {
			throw new Error("File path is required.");
		}

		// 1. Resolve URI (auto-appends .md if needed)
		const uri = await this.resolveFileUri(filePath);

		// 2. Open Document (User must see the changes to approve)
		// Use 'vscode.open' command which respects default editor settings.
		// If it's a .md file and Gitbbon Editor is default, it will open with it.
		await vscode.commands.executeCommand('vscode.open', uri);

		// 3. Wait for editor to be active (200ms x 20 = 4 seconds)
		let editorReady = false;
		for (let i = 0; i < 20; i++) {
			const activeEditor = vscode.window.activeTextEditor;
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

			const isActive = (activeEditor && activeEditor.document.uri.toString() === uri.toString()) ||
				(activeTab?.input instanceof vscode.TabInputCustom && activeTab.input.uri.toString() === uri.toString());

			if (isActive) {
				editorReady = true;
				break;
			}
			await new Promise(resolve => setTimeout(resolve, 200));
		}

		if (!editorReady) {
			const retry = await vscode.window.showWarningMessage(
				`파일을 여는 데 시간이 걸리고 있습니다: ${vscode.workspace.asRelativePath(uri)}`,
				'다시 시도',
				'취소'
			);
			if (retry === '다시 시도') {
				return this.applySuggestions(filePath, changes, mode);
			}
			throw new Error(`에디터를 열 수 없습니다: ${filePath}`);
		}

		// 4. Apply Suggestions or Direct Edit
		if (this.isGitbbonEditor()) {
			if (mode === 'direct') {
				await vscode.commands.executeCommand('gitbbon.editor.directApply', changes);
			} else {
				await vscode.commands.executeCommand('gitbbon.editor.applySuggestions', changes);
			}
		} else {
			try {
				if (mode === 'direct') {
					await vscode.commands.executeCommand('gitbbon.editor.directApply', changes);
				} else {
					await vscode.commands.executeCommand('gitbbon.editor.applySuggestions', changes);
				}
			} catch (e) {
				throw new Error(`Failed to apply changes. Ensure the file is opened in Gitbbon Editor. Error: ${e}`);
			}
		}
	}

	/**
	 * Create a new note file with content.
	 * Automatically creates parent directories if they don't exist.
	 * If title is provided, it will be placed in YAML frontmatter.
	 */
	public static async createNote(filePath: string, content: string, title?: string): Promise<string> {
		if (!filePath) {
			throw new Error("File path is required.");
		}

		// Ensure .md extension for new notes
		const normalizedPath = /\.[a-zA-Z0-9]+$/.test(filePath) ? filePath : filePath + '.md';

		// Build final content with YAML frontmatter if title is provided
		let finalContent = content;
		if (title) {
			finalContent = `---\ntitle: ${title}\n---\n${content}`;
		}

		// Resolve URI
		const uri = this.pathToUri(normalizedPath);

		// Create parent directories if needed
		const parentDir = vscode.Uri.joinPath(uri, '..');
		try {
			await vscode.workspace.fs.createDirectory(parentDir);
		} catch {
			// Directory might already exist, ignore
		}

		// Write file
		const encoder = new TextEncoder();
		await vscode.workspace.fs.writeFile(uri, encoder.encode(finalContent));

		// Open the created file
		await vscode.commands.executeCommand('vscode.open', uri);

		return `Created: ${vscode.workspace.asRelativePath(uri)}`;
	}

	/**
	 * Delete a note file.
	 * Automatically appends .md if the path has no extension and the file is not found.
	 */
	public static async deleteNote(filePath: string): Promise<string> {
		if (!filePath) {
			throw new Error("File path is required.");
		}

		// Resolve URI (auto-appends .md if needed)
		const uri = await this.resolveFileUri(filePath);

		await vscode.workspace.fs.delete(uri);
		return `Deleted: ${vscode.workspace.asRelativePath(uri)}`;
	}
}
