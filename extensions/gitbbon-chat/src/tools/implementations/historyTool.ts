import { tool } from 'ai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';

export const createHistoryTool = (messages: ModelMessage[]) => tool({
	description: 'Retrieve previous chat history. Use when user refers to "before", "previously", etc.',
	inputSchema: z.object({
		count: z.number().min(1).max(50).describe('Number of recent messages to retrieve (1-50)'),
		query: z.string().optional().describe('Search keyword (optional)'),
	}),
	execute: async ({ count, query }) => {
		if (messages.length === 0) {
			return "Error: No history available.";
		}

		let filteredMessages = messages;

		// Filter by query if present
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

		// Get last 'count' messages
		const selectedMessages = filteredMessages.slice(-count);

		// Format
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
	},
});
