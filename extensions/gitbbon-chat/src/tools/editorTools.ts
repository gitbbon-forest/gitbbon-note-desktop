import { tool } from 'ai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';
import { ContextService } from '../services/ContextService';
import { searchInWorkspaceTool } from './implementations/searchTool';
import { createHistoryTool } from './implementations/historyTool';

/**
 * Editor Tools for AI Chat
 *
 * Uses ContextService to interact with VS Code and Milkdown editors.
 * Creates a collection of tools including history retrieval and workspace search.
 */

// Re-export for potential legacy usage, or we can just remove it if we update aiService correctly.
// But to be safe, we can make it a wrapper.
export function isGitbbonEditorActive(): boolean {
	return ContextService.isGitbbonEditor();
}

/**
 * EditorTools Factory
 */
export function createEditorTools(messages: ModelMessage[]) {
	return {
		get_selection: tool({
			description: 'Get selected text from the active editor. Use for "this code", "selected part", etc.',
			inputSchema: z.object({}),
			execute: async () => {
				const detail = await ContextService.getSelection();
				if (detail) {
					return `
[Context Before]
${detail.before}

[Selected Text]
${detail.text}

[Context After]
${detail.after}
`.trim();
				}
				return "Error: No text selected.";
			},
		}),

		get_current_file: tool({
			description: 'Get the entire content of the active file. Use for "whole file", "structure", etc.',
			inputSchema: z.object({}),
			execute: async () => {
				const content = await ContextService.getActiveFileContent();
				if (content) {
					return content;
				}
				return "Error: No active editor found.";
			},
		}),

		get_chat_history: createHistoryTool(messages),

		search_in_workspace: searchInWorkspaceTool,

		read_file: tool({
			description: 'Read the content of a specific file. Use for "that file" or search results.',
			inputSchema: z.object({
				filePath: z.string().describe('File path (relative or absolute)'),
			}),
			execute: async ({ filePath }) => {
				try {
					const content = await ContextService.readFile(filePath);
					return content;
				} catch (e) {
					return `Error: Failed to read file (${filePath}). ${e}`;
				}
			},
		}),
	};
}

export const editorTools = createEditorTools([]);

