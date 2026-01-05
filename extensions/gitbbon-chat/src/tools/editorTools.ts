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
				console.log('[Tool:get_selection] Executing...');
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
				console.log('[Tool:get_current_file] Executing...');
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
				console.log(`[Tool:read_file] Executing with filePath=${filePath}`);
				try {
					const content = await ContextService.readFile(filePath);
					return content;
				} catch (e) {
					return `Error: Failed to read file (${filePath}). ${e}`;
				}
			},
		}),

		edit_note: tool({
			description: 'Create, Update, or Delete a note file. For create: directories auto-created. For update: use oldText/newText pairs.',
			inputSchema: z.object({
				action: z.enum(['create', 'update', 'delete']).describe('Action type: create, update, or delete'),
				filePath: z.string().describe('File path (relative or absolute). Directories auto-created for create.'),
				content: z.string().optional().describe('For create: full markdown content of the new file'),
				changes: z.array(z.object({
					oldText: z.string().describe('The exact existing text to be replaced'),
					newText: z.string().describe('The new text to replace with')
				})).optional().describe('For update: list of text replacements')
			}),
			execute: async ({ action, filePath, content, changes }) => {
				console.log(`[Tool:edit_note] Executing action=${action}, filePath=${filePath}`);
				try {
					switch (action) {
						case 'create':
							if (!content) {
								return 'Error: content is required for create action.';
							}
							return await ContextService.createNote(filePath, content);
						case 'update':
							if (!changes || changes.length === 0) {
								return 'Error: changes are required for update action.';
							}
							await ContextService.applySuggestions(filePath, changes, 'direct');
							return `Updated: ${filePath}`;
						case 'delete':
							return await ContextService.deleteNote(filePath);
						default:
							return `Error: Unknown action ${action}`;
					}
				} catch (e: unknown) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					console.error(`[Tool:edit_note] Failed: ${errorMessage}`);

					// For update failures, fetch content for AI to self-correct
					if (action === 'update') {
						let fileContent = '';
						try {
							fileContent = await ContextService.readFile(filePath);
						} catch (readErr) {
							return `Error: Failed to ${action} AND failed to read file. Error: ${errorMessage}. Read Error: ${readErr}`;
						}
						return `Error: Failed to update. ${errorMessage}\n\n[Current File Content - Use this to fix 'oldText']\n${fileContent}`;
					}
					return `Error: Failed to ${action}. ${errorMessage}`;
				}
			}
		}),
	};
}

export const editorTools = createEditorTools([]);

