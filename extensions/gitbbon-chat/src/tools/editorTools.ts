import { tool } from 'ai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';
import { ContextService } from '../services/ContextService';
import { executeSearch } from './implementations/searchTool';
import { createHistoryTool } from './implementations/historyTool';
import { type ToolEventEmitter, generateToolId } from '../types';
import { logService } from '../services/logService';

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

// gitbbon custom: Issue #99 - experimental_context 타입 정의
export interface EditorToolContext {
	messages: ModelMessage[];
	emitter?: ToolEventEmitter;
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

/**
 * EditorTools Factory
 * gitbbon custom: Issue #99 - closure 의존성 제거, experimental_context로 messages/emitter 수신
 */
export function createEditorTools() {
	return {
		get_selection: tool({
			description: 'Get selected text from the active editor. Use for "this code", "selected part", etc.',
			inputSchema: z.object({}),
			execute: async (_input, { experimental_context: ctx }) => {
				// gitbbon custom: Issue #99 - experimental_context에서 emitter 수신
				const { emitter } = (ctx ?? {}) as EditorToolContext;
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
					return "No text selected. Do NOT retry — ask the user to select text first.";
				});
			},
		}),

		get_current_file: tool({
			description: 'Get the entire content of the active file. Use for "whole file", "structure", etc.',
			inputSchema: z.object({}),
			execute: async (_input, { experimental_context: ctx }) => {
				// gitbbon custom: Issue #99 - experimental_context에서 emitter 수신
				const { emitter } = (ctx ?? {}) as EditorToolContext;
				return withProgress('get_current_file', {}, emitter, async () => {
					const content = await ContextService.getActiveFileContent();
					if (content) return content;
					return "No active editor found. Do NOT retry — use read_file with a specific file path instead.";
				});
			},
		}),

		// gitbbon custom: Issue #99 - get_chat_history는 messages를 experimental_context에서 수신
		get_chat_history: tool({
			description: 'Retrieve previous chat history. Use when user refers to "before", "previously", etc.',
			inputSchema: z.object({
				count: z.number().min(1).max(50).describe('Number of recent messages to retrieve (1-50)'),
				query: z.string().optional().describe('Search keyword (optional)'),
			}),
			execute: async ({ count, query }, { experimental_context: ctx }) => {
				const { messages } = (ctx ?? {}) as EditorToolContext;
				// createHistoryTool의 execute 로직을 인라인으로 호출
				return executeHistoryQuery(messages ?? [], count, query);
			},
		}),

		search_in_workspace: tool({
			description: 'Search for code or notes using natural language (Semantic Search) or keywords (Regex/Ripgrep). Use this for "find code about X" or "where is logic for Y".',
			inputSchema: z.object({
				query: z.string().describe('Natural language query (for semantic search) or specific pattern (for exact match)'),
				isRegex: z.boolean().optional().describe('Set to true ONLY if you need strict regex matching (bypasses semantic search)'),
				filePattern: z.string().optional().describe('File path pattern (e.g., src/**/*.ts) - mostly for regex mode'),
				context: z.number().min(0).max(500).optional().describe('Characters of context around match (default: 100)'),
				maxResults: z.number().min(1).max(30).optional().describe('Maximum number of results (default: 5)'),
			}),
			execute: async (args, { experimental_context: ctx }) => {
				// gitbbon custom: Issue #99 - experimental_context에서 emitter 수신
				const { emitter } = (ctx ?? {}) as EditorToolContext;
				return withProgress('search_in_workspace', { query: args.query }, emitter, () => executeSearch(args));
			},
		}),

		read_file: tool({
			description: 'Read the content of a specific file. Use for "that file" or search results. IMPORTANT: include the .md extension for note files.',
			inputSchema: z.object({
				filePath: z.string().describe('File path with extension (e.g., "notes/chapter 1.md"). Include .md for note files.'),
			}),
			execute: async ({ filePath }, { experimental_context: ctx }) => {
				// gitbbon custom: Issue #99 - experimental_context에서 emitter 수신
				const { emitter } = (ctx ?? {}) as EditorToolContext;
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
			description: 'Create, Update, or Delete a note file. IMPORTANT: filePath MUST include the .md extension (e.g., "chapter 1.md", not "chapter 1").',
			inputSchema: z.object({
				action: z.enum(['create', 'update', 'delete']).describe('Action type'),
				filePath: z.string().describe('File path with extension (e.g., "notes/chapter 1.md"). MUST include .md extension.'),
				title: z.string().optional().describe('For create: Note title (will be placed in YAML frontmatter)'),
				content: z.string().optional().describe('For create: Note body content (without frontmatter)'),
				changes: z.array(z.object({
					oldText: z.string(),
					newText: z.string()
				})).optional().describe('For update: text replacements'),
				mode: z.enum(['direct', 'suggestion']).optional().default('direct').describe(
					'How to apply the edit:\n' +
					'- "suggestion": REQUIRED when the target file has a YAML frontmatter header (starts with ---). \n' +
					'- "direct": Use only for plain-text files without YAML/markdown, or when the user gives a clear imperative command ("fix", "apply", "change") on a non-markdown file.\n' +
					'Default: "direct", but override to "suggestion" for any .md file.'
				)
			}),
			execute: async ({ action, filePath, title, content, changes, mode }, { experimental_context: ctx }) => {
				// gitbbon custom: Issue #99 - experimental_context에서 emitter 수신
				const { emitter } = (ctx ?? {}) as EditorToolContext;
				return withProgress('edit_note', { action, filePath }, emitter, async () => {
					try {
						switch (action) {
							case 'create':
								if (!content) return 'Error: content required.';
								return await ContextService.createNote(filePath, content, title);
							case 'update':
								if (!changes?.length) return 'Error: changes required.';
								await ContextService.applySuggestions(filePath, changes, mode || 'direct');
								if ((mode || 'direct') === 'suggestion') {
									return `Suggestion applied to ${filePath}. Changes are shown in the UI pending user approval — do NOT read or re-edit this file.`;
								}
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

/**
 * gitbbon custom: Issue #99 - get_chat_history execute 로직 (historyTool closure 대체)
 * messages를 experimental_context로부터 수신하여 처리
 */
function executeHistoryQuery(messages: ModelMessage[], count: number, query?: string): string {
	if (messages.length === 0) {
		return "No history available. Do NOT retry this tool.";
	}

	const historyPool = messages.length > 5 ? messages.slice(0, -5) : [];

	if (historyPool.length === 0) {
		return "No older history available. Recent history is already provided in context — do NOT call this tool again.";
	}

	let filteredMessages = historyPool;

	if (query) {
		const lowerQuery = query.toLowerCase();
		filteredMessages = messages.filter(m => {
			const content = typeof m.content === 'string'
				? m.content
				: JSON.stringify(m.content);
			return content.toLowerCase().includes(lowerQuery);
		});

		if (filteredMessages.length === 0) {
			return `Error: No messages found containing "${query}".`;
		}
	}

	const selectedMessages = filteredMessages.slice(-count);

	const formatted = selectedMessages.map((m) => {
		const content = typeof m.content === 'string'
			? m.content
			: JSON.stringify(m.content);

		let truncated = content;
		if (content.length > 500) {
			if (query) {
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
}
