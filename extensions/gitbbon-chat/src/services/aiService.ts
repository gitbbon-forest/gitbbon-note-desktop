import * as vscode from 'vscode';
import { ToolLoopAgent, type ModelMessage } from 'ai';
import { createEditorTools } from '../tools/editorTools';
import { ContextService } from './ContextService';
import { SYSTEM_PROMPT } from '../constants/prompts';
import { type StreamEvent, type ToolStartEvent, type ToolEndEvent, generateToolId } from '../types';

/**
 * Event Channel for real-time streaming
 */
class EventChannel {
	private queue: StreamEvent[] = [];
	private resolvers: ((value: IteratorResult<StreamEvent>) => void)[] = [];
	private done = false;

	push(event: StreamEvent): void {
		if (this.resolvers.length > 0) {
			const resolver = this.resolvers.shift()!;
			resolver({ value: event, done: false });
		} else {
			this.queue.push(event);
		}
	}

	finish(): void {
		this.done = true;
		for (const resolver of this.resolvers) {
			resolver({ value: undefined as unknown as StreamEvent, done: true });
		}
		this.resolvers = [];
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<StreamEvent, void, unknown> {
		while (true) {
			if (this.queue.length > 0) {
				yield this.queue.shift()!;
			} else if (this.done) {
				return;
			} else {
				const event = await new Promise<IteratorResult<StreamEvent>>((resolve) => {
					this.resolvers.push(resolve);
				});
				if (event.done) return;
				yield event.value;
			}
		}
	}
}

export class AIService {
	private apiKey: string | undefined;

	constructor() {
		this.initializeApiKey();
	}

	private initializeApiKey(): void {
		const HARDCODED_KEY = 'vck_4XdyhTvmnGMqyMBjZSTfGjgTTw0OfkKanAuoABTT2mJhFd49bt4YtYL5';
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY || HARDCODED_KEY;

		if (this.apiKey) {
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			console.log('[gitbbon-chat][aiService] Initialized with API Key');
		} else {
			console.warn('[GitbbonChat] No API key found.');
		}
	}

	public hasApiKey(): boolean {
		return !!this.apiKey;
	}

	/**
	 * Real-time streaming with LLM phase indicators
	 */
	public async *streamAgentChat(messages: ModelMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
		if (!this.apiKey) throw new Error('No API Key');
		const lastMessage = messages[messages.length - 1];
		const userInput = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

		const channel = new EventChannel();

		const emitter = {
			emit: (event: ToolStartEvent | ToolEndEvent) => {
				channel.push(event);
			}
		};

		const tools = createEditorTools(messages, emitter);
		const modelName = 'google/gemini-3-pro';

		// Context collection
		const activeFile = ContextService.getActiveFileName();
		let selectionPreview = 'None';
		const selectionDetail = await ContextService.getSelection();
		const SELECTION_LIMIT = 1000;

		if (selectionDetail) {
			const { text, before, after } = selectionDetail;
			const isTruncated = text.length > SELECTION_LIMIT;
			const truncatedText = text.slice(0, SELECTION_LIMIT) + (isTruncated ? '...' : '');
			selectionPreview = `[Context Before]\n${before}\n\n[Selected Text]\n${truncatedText}\n\n[Context After]\n${after}`;
		}

		let cursorContext = 'None';
		if (!selectionDetail) {
			const context = await ContextService.getCursorContext();
			if (context) cursorContext = context;
		}

		const olderMessageCount = Math.max(0, messages.length - 5);
		const openTabs = ContextService.getOpenTabs();
		const contextParts: string[] = ['[Current Environment Context]'];

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders?.length) {
			try {
				const configUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.gitbbon.json');
				const configData = await vscode.workspace.fs.readFile(configUri);
				const config = JSON.parse(Buffer.from(configData).toString('utf-8'));
				if (config.title?.trim()) contextParts.push(`- Project: ${config.title}`);
			} catch { /* skip */ }
		}

		if (activeFile && activeFile !== 'None') contextParts.push(`- Active File: ${activeFile}`);
		if (selectionPreview !== 'None') contextParts.push(`\n- Selection Preview:\n"""\n${selectionPreview}\n"""`);
		if (cursorContext !== 'None' && selectionPreview === 'None') contextParts.push(`\n- Cursor Context:\n"""\n${cursorContext}\n"""`);
		if (olderMessageCount > 0) contextParts.push(`\n- Older Chat History: ${olderMessageCount} messages`);
		if (openTabs.length > 0) contextParts.push(`\n- Open Files:\n${openTabs.map(l => `  - ${l}`).join('\n')}`);

		const previousMessages = messages.slice(0, -1).slice(-4);
		if (previousMessages.length > 0) {
			const historyText = previousMessages.map(m =>
				`[${m.role}]: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`
			).join('\n\n');
			contextParts.push(`\n- Recent History:\n${historyText}`);
		}

		const instructions = SYSTEM_PROMPT + '\n\n' + contextParts.join('\n');
		console.log(`[gitbbon-chat][aiService] Starting agent: ${modelName}`);

		// Run agent with phase indicators
		const agentPromise = (async () => {
			const thinkingId = generateToolId();
			const thinkingStart = Date.now();

			try {
				// Phase 1: Thinking
				channel.push({
					type: 'tool-start',
					id: thinkingId,
					toolName: 'Thinking...',
					timestamp: thinkingStart,
				});

				let hasToolCalls = false;

				const agent = new ToolLoopAgent({
					model: modelName,
					instructions,
					tools,
					onStepFinish: (event) => {
						// Tool calls detected - update thinking status
						if (event.toolCalls?.length && !hasToolCalls) {
							hasToolCalls = true;
							channel.push({
								type: 'tool-end',
								id: thinkingId,
								toolName: 'Thinking...',
								duration: Date.now() - thinkingStart,
								success: true,
							});
						}

						// Step 로그 제거 (과도한 출력 방지)
					}
				});

				const result = await agent.generate({ prompt: userInput });

				// If no tool calls, end thinking phase
				if (!hasToolCalls) {
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: true,
					});
				}

				// Phase 2: Writing response (if we had tool calls)
				if (hasToolCalls && result.text) {
					const writingId = generateToolId();
					channel.push({
						type: 'tool-start',
						id: writingId,
						toolName: 'Writing response...',
						timestamp: Date.now(),
					});
					// Small delay to show the phase
					await new Promise(r => setTimeout(r, 100));
					channel.push({
						type: 'tool-end',
						id: writingId,
						toolName: 'Writing response...',
						duration: 100,
						success: true,
					});
				}

				if (result.text) {
					channel.push({ type: 'text', content: result.text });
				}
			} catch (error) {
				console.error('[gitbbon-chat][aiService] Agent failed:', error);
				channel.push({
					type: 'tool-end',
					id: thinkingId,
					toolName: 'Thinking...',
					duration: Date.now() - thinkingStart,
					success: false,
				});
				channel.push({ type: 'text', content: 'An error occurred.' });
			} finally {
				channel.finish();
			}
		})();

		for await (const event of channel) {
			yield event;
		}

		await agentPromise;
	}

	public async *streamChat(messages: ModelMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
		yield* this.streamAgentChat(messages);
	}
}
