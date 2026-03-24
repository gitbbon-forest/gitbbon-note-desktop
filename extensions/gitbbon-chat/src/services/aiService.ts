import * as vscode from 'vscode';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { createEditorTools } from '../tools/editorTools';
import { ContextService } from './ContextService';
import { SYSTEM_PROMPT } from '../constants/prompts';
import { type StreamEvent, type ToolStartEvent, type ToolEndEvent, generateToolId } from '../types';
import { logService } from './logService';
import { ollamaService } from './ollamaService';

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
	private initialized = false;
	private currentAbortController: AbortController | null = null;

	constructor(private readonly secrets: vscode.SecretStorage) { }

	public async getBackend(): Promise<'api' | 'ollama'> {
		const stored = await this.secrets.get('CHAT_BACKEND');
		return (stored === 'ollama') ? 'ollama' : 'api';
	}

	public async setBackend(backend: 'api' | 'ollama'): Promise<void> {
		await this.secrets.store('CHAT_BACKEND', backend);
		logService.info(`[gitbbon-chat][aiService] Backend set to: ${backend}`);
	}

	/**
	 * Cancel the current streaming response
	 */
	public cancelCurrentStream(): void {
		if (this.currentAbortController) {
			this.currentAbortController.abort();
			this.currentAbortController = null;
			logService.info('[gitbbon-chat][aiService] Stream cancelled by user');
		}
	}

	public async ensureInitialized(): Promise<void> {
		if (this.initialized) {
			return;
		}
		await this.initializeApiKey();
		this.initialized = true;
	}

	private async initializeApiKey(): Promise<void> {
		logService.info('[gitbbon-chat][aiService] initializeApiKey started');

		// 1. SecretStorage에서 먼저 확인
		this.apiKey = await this.secrets.get('AI_GATEWAY_API_KEY');
		logService.info('[gitbbon-chat][aiService] SecretStorage check:', this.apiKey ? 'found' : 'not found');

		// 2. SecretStorage에 없으면 시스템 환경변수 확인
		if (!this.apiKey) {
			this.apiKey = process.env.AI_GATE_API_KEY || process.env.VERCEL_AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY;
			logService.info('[gitbbon-chat][aiService] Env var check:', this.apiKey ? 'found' : 'not found');
		}

		// 3. 둘 다 없으면 사용자에게 입력받기
		if (!this.apiKey) {
			logService.info('[gitbbon-chat][aiService] No API key found, prompting user...');
			await this.promptForApiKey();
		}

		if (this.apiKey) {
			// Standardize for other consumers if needed
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			logService.info('[gitbbon-chat][aiService] Initialized with API Key');
		} else {
			logService.warn('[GitbbonChat] No API key found.');
		}
	}

	public hasApiKey(): boolean {
		return !!this.apiKey;
	}

	/**
	 * Prompt user for API key and store in SecretStorage
	 */
	public async promptForApiKey(): Promise<boolean> {
		logService.info('[gitbbon-chat][aiService] Showing input prompt...');

		const userInput = await vscode.window.showInputBox({
			prompt: 'Vercel AI Gateway API 키를 입력해주세요',
			password: true,
			placeHolder: 'API Key',
			ignoreFocusOut: true,
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'API 키를 입력해주세요';
				}
				return null;
			}
		});

		logService.info('[gitbbon-chat][aiService] User input:', userInput ? 'provided' : 'cancelled');

		if (userInput && userInput.trim()) {
			await this.secrets.store('AI_GATEWAY_API_KEY', userInput.trim());
			this.apiKey = userInput.trim();
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			logService.info('[gitbbon-chat][aiService] API Key stored in SecretStorage');
			return true;
		}

		return false;
	}

	/**
	 * Real-time streaming with LLM phase indicators
	 */
	public async *streamAgentChat(messages: ModelMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
		const backend = await this.getBackend();
		if (backend === 'ollama') {
			yield* this._streamOllamaChat(messages);
			return;
		}

		await this.ensureInitialized();
		if (!this.apiKey) throw new Error('No API Key');

		const lastMessage = messages[messages.length - 1];
		const userInput = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
		logService.info('[gitbbon-chat][aiService] User Input:', userInput);

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

		logService.info('[gitbbon-chat][System Prompt]', instructions);
		logService.info(`[gitbbon-chat][aiService] Starting streamText: ${modelName}`);

		// Set up AbortController for cancellation
		const abortController = new AbortController();
		this.currentAbortController = abortController;

		// Run streamText with tool loop
		const agentPromise = (async () => {
			const thinkingId = generateToolId();
			const thinkingStart = Date.now();
			let hasToolCalls = false;

			try {
				// Phase 1: Thinking
				channel.push({
					type: 'tool-start',
					id: thinkingId,
					toolName: 'Thinking...',
					timestamp: thinkingStart,
				});
				logService.info('[gitbbon-chat][Phase] Thinking...');

				const result = streamText({
					model: modelName,
					system: instructions,
					messages: messages as any,
					tools,
					stopWhen: stepCountIs(10),
					abortSignal: abortController.signal,
					onStepFinish: (event) => {
						logService.info('[gitbbon-chat][Agent Step] Step Finished', {
							text: event.text ? event.text.slice(0, 100) + '...' : undefined,
							tools: event.toolCalls?.map((t: any) => t.toolName).join(', ') || 'None'
						});

						if (event.toolCalls?.length) {
							if (!hasToolCalls) {
								hasToolCalls = true;
								channel.push({
									type: 'tool-end',
									id: thinkingId,
									toolName: 'Thinking...',
									duration: Date.now() - thinkingStart,
									success: true,
								});
								logService.info('[gitbbon-chat][Phase] Tool Execution Started');
							}

							event.toolCalls.forEach((call: any) => {
								logService.info(`[gitbbon-chat][Tool Call] ${call.toolName}`, call.args);
							});

							if (event.toolResults) {
								event.toolResults.forEach((toolResult: any) => {
									logService.info(`[gitbbon-chat][Tool Result] ${toolResult.toolName}`, toolResult.result);
								});
							}
						}
					},
					onAbort: () => {
						logService.info('[gitbbon-chat][aiService] Stream aborted');
					},
				});

				// Stream text token by token
				for await (const textChunk of result.textStream) {
					if (abortController.signal.aborted) break;

					// End thinking phase on first text chunk
					if (!hasToolCalls) {
						hasToolCalls = true;
						channel.push({
							type: 'tool-end',
							id: thinkingId,
							toolName: 'Thinking...',
							duration: Date.now() - thinkingStart,
							success: true,
						});
					}

					if (textChunk) {
						channel.push({ type: 'text', content: textChunk });
					}
				}

				logService.info('[gitbbon-chat][AI Response] Streaming complete');

				// If no text was ever streamed, end thinking phase
				if (!hasToolCalls) {
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: true,
					});
				}
			} catch (error: any) {
				if (error?.name === 'AbortError' || abortController.signal.aborted) {
					logService.info('[gitbbon-chat][aiService] Stream cancelled');
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: true,
					});
				} else {
					logService.error('[gitbbon-chat][aiService] streamText failed:', error);
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: false,
					});
					channel.push({ type: 'text', content: 'An error occurred.' });
				}
			} finally {
				this.currentAbortController = null;
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

	private async *_streamOllamaChat(messages: ModelMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
		const thinkingId = generateToolId();
		const thinkingStart = Date.now();
		logService.info(`[gitbbon-chat][aiService] _streamOllamaChat: start, messages=${messages.length}`);

		yield { type: 'tool-start', id: thinkingId, toolName: 'Thinking...', timestamp: thinkingStart };

		const msgList = messages.map(m => ({
			role: m.role as string,
			content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
		}));

		let first = true;
		let chunkCount = 0;
		try {
			for await (const chunk of ollamaService.streamChat(msgList)) {
				if (first) {
					first = false;
					logService.info(`[gitbbon-chat][aiService] _streamOllamaChat: first chunk received (${Date.now() - thinkingStart}ms)`);
					yield { type: 'tool-end', id: thinkingId, toolName: 'Thinking...', duration: Date.now() - thinkingStart, success: true };
				}
				if (chunk) {
					chunkCount++;
					yield { type: 'text', content: chunk };
				}
			}
			if (first) {
				logService.warn('[gitbbon-chat][aiService] _streamOllamaChat: no chunks received');
				yield { type: 'tool-end', id: thinkingId, toolName: 'Thinking...', duration: Date.now() - thinkingStart, success: true };
			} else {
				logService.info(`[gitbbon-chat][aiService] _streamOllamaChat: complete, chunks=${chunkCount}, duration=${Date.now() - thinkingStart}ms`);
			}
		} catch (error) {
			logService.error('[gitbbon-chat][aiService] _streamOllamaChat: failed', error);
			yield { type: 'tool-end', id: thinkingId, toolName: 'Thinking...', duration: Date.now() - thinkingStart, success: false };
			yield { type: 'text', content: 'Ollama 연결에 실패했습니다. Ollama가 실행 중인지 확인해주세요.' };
		}
	}
}
