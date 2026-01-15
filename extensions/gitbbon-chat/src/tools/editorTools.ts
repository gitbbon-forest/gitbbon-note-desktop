import { tool } from 'ai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';
import { ContextService } from '../services/ContextService';
import { executeSearch } from './implementations/searchTool';
import { createHistoryTool } from './implementations/historyTool';
import { type ToolEventEmitter, generateToolId } from '../types';

/**
 * Human-friendly tool labels (not developer names)
 */
const TOOL_LABELS: Record<string, string> = {
	get_selection: 'Reading selection',
	get_current_file: 'Reading current file',
	get_chat_history: 'Loading chat history',
	search_in_workspace: 'Searching files',
	read_file: 'Reading file',
	edit_note: 'Editing note',
};

function getToolLabel(toolName: string): string {
	return TOOL_LABELS[toolName] || toolName;
}

/**
 * Helper to wrap tool execution with progress events
 */
function withProgress<T>(
	toolName: string,
	args: Record<string, unknown>,
	emitter: ToolEventEmitter | undefined,
	fn: () => Promise<T>
): Promise<T> {
	const id = generateToolId();
	const startTime = Date.now();
	const label = getToolLabel(toolName);

	// Extract human-friendly context from args
	let context = '';
	if (args.filePath) context = String(args.filePath).split('/').pop() || '';
	else if (args.query) context = String(args.query);
	else if (args.action) context = String(args.action);

	emitter?.emit({
		type: 'tool-start',
		id,
		toolName: label,
		args: context ? { context } : undefined,
		timestamp: startTime,
	});

	return fn()
		.then((result) => {
			emitter?.emit({
				type: 'tool-end',
				id,
				toolName: label,
				duration: Date.now() - startTime,
				success: true,
			});
			return result;
		})
		.catch((error) => {
			emitter?.emit({
				type: 'tool-end',
				id,
				toolName: label,
				duration: Date.now() - startTime,
				success: false,
			});
			throw error;
		});
}

export function isGitbbonEditorActive(): boolean {
	return ContextService.isGitbbonEditor();
}

/**
 * EditorTools Factory
 */
export function createEditorTools(messages: ModelMessage[], emitter?: ToolEventEmitter) {
	return {
		get_selection: tool({
			description: 'Get selected text from the active editor. Use for "this code", "selected part", etc.',
			inputSchema: z.object({}),
			execute: async () => {
				return withProgress('get_selection', {}, emitter, async () => {
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
				});
			},
		}),

		get_current_file: tool({
			description: 'Get the entire content of the active file. Use for "whole file", "structure", etc.',
			inputSchema: z.object({}),
			execute: async () => {
				return withProgress('get_current_file', {}, emitter, async () => {
					const content = await ContextService.getActiveFileContent();
					if (content) return content;
					return "Error: No active editor found.";
				});
			},
		}),

		get_chat_history: createHistoryTool(messages),

		search_in_workspace: tool({
			description: 'Search for code or notes using natural language (Semantic Search) or keywords (Regex/Ripgrep). Use this for "find code about X" or "where is logic for Y".',
			inputSchema: z.object({
				query: z.string().describe('Natural language query (for semantic search) or specific pattern (for exact match)'),
				isRegex: z.boolean().optional().describe('Set to true ONLY if you need strict regex matching (bypasses semantic search)'),
				filePattern: z.string().optional().describe('File path pattern (e.g., src/**/*.ts) - mostly for regex mode'),
				context: z.number().min(0).max(500).optional().describe('Characters of context around match (default: 100)'),
				maxResults: z.number().min(1).max(30).optional().describe('Maximum number of results (default: 5)'),
			}),
			execute: async (args) => {
				return withProgress('search_in_workspace', { query: args.query }, emitter, () => executeSearch(args));
			},
		}),

		read_file: tool({
			description: 'Read the content of a specific file. Use for "that file" or search results.',
			inputSchema: z.object({
				filePath: z.string().describe('File path (relative or absolute)'),
			}),
			execute: async ({ filePath }) => {
				return withProgress('read_file', { filePath }, emitter, async () => {
					try {
						return await ContextService.readFile(filePath);
					} catch (e) {
						return `Error: Failed to read file (${filePath}). ${e}`;
					}
				});
			},
		}),

		edit_note: tool({
			description: 'Create, Update, or Delete a note file.',
			inputSchema: z.object({
				action: z.enum(['create', 'update', 'delete']).describe('Action type'),
				filePath: z.string().describe('File path'),
				title: z.string().optional().describe('For create: Note title (will be placed in YAML frontmatter)'),
				content: z.string().optional().describe('For create: Note body content (without frontmatter)'),
				changes: z.array(z.object({
					oldText: z.string(),
					newText: z.string()
				})).optional().describe('For update: text replacements')
			}),
			execute: async ({ action, filePath, title, content, changes }) => {
				return withProgress('edit_note', { action, filePath }, emitter, async () => {
					try {
						switch (action) {
							case 'create':
								if (!content) return 'Error: content required.';
								return await ContextService.createNote(filePath, content, title);
							case 'update':
								if (!changes?.length) return 'Error: changes required.';
								await ContextService.applySuggestions(filePath, changes, 'direct');
								return `Updated: ${filePath}`;
							case 'delete':
								return await ContextService.deleteNote(filePath);
							default:
								return `Error: Unknown action ${action}`;
						}
					} catch (e: unknown) {
						const msg = e instanceof Error ? e.message : String(e);
						if (action === 'update') {
							try {
								const fileContent = await ContextService.readFile(filePath);
								return `Error: ${msg}\n\n[Current Content]\n${fileContent}`;
							} catch { /* ignore */ }
						}
						return `Error: ${msg}`;
					}
				});
			},
		}),
	};
}

export const editorTools = createEditorTools([]);
