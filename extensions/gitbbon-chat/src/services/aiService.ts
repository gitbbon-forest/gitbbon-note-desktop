import * as vscode from 'vscode';
import { streamText, stepCountIs, type ModelMessage, type LanguageModel, type ToolSet, type TypedToolCall, type TypedToolResult } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
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
	/**
	 * Check if an error is a GatewayAuthenticationError (API key missing/invalid)
	 */
	private isGatewayAuthError(error: any): boolean {
		return (
			error?.name === 'GatewayAuthenticationError' ||
			error?.constructor?.name === 'GatewayAuthenticationError' ||
			(typeof error?.message === 'string' && error.message.includes('Unauthenticated request to AI Gateway'))
		);
	}

	/**
	 * Reset API key state and prompt user for re-entry
	 */
	private async handleApiKeyFailure(): Promise<boolean> {
		logService.warn('[gitbbon-chat][aiService] API key invalid or missing, prompting user...');
		this.apiKey = undefined;
		this.initialized = false;
		process.env.AI_GATEWAY_API_KEY = '';

		vscode.window.showWarningMessage(
			'API 키가 유효하지 않습니다. 새 API 키를 입력해주세요.'
		);

		const success = await this.promptForApiKey();
		if (success) {
			this.initialized = true;
		}
		return success;
	}

	public async *streamAgentChat(messages: ModelMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
		const backend = await this.getBackend();
		if (backend !== 'ollama') {
			await this.ensureInitialized();
			if (!this.apiKey) {
				const keyProvided = await this.promptForApiKey();
				if (!keyProvided || !this.apiKey) {
					yield { type: 'text', content: 'API 키가 설정되지 않았습니다. 채팅을 시작하려면 API 키를 입력해주세요.\n\n명령 팔레트에서 `Gitbbon Chat: Set API Key`를 실행하거나 다시 메시지를 보내주세요.' };
					return;
				}
			}
		}

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

		// Resolve model: Ollama returns a LanguageModel object; API backend uses a gateway string ID
		let model: LanguageModel | string;
		if (backend === 'ollama') {
			const ollamaModelName = await ollamaService.getSelectedModel();
			logService.info(`[gitbbon-chat][aiService] Ollama backend: model=${ollamaModelName}`);
			const ollamaProvider = createOpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' });
			model = ollamaProvider.chat(ollamaModelName);
		} else {
			model = 'google/gemini-3-pro';
		}

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
		logService.info(`[gitbbon-chat][aiService] Starting streamText: ${typeof model === 'string' ? model : (typeof model === 'object' && model !== null && 'modelId' in model ? (model as { modelId: string }).modelId : 'ollama')}`);

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
					model,
					system: instructions,
					messages: messages as ModelMessage[],
					tools,
					stopWhen: stepCountIs(10),
					abortSignal: abortController.signal,
					onStepFinish: (event) => {
						logService.info('[gitbbon-chat][Agent Step] Step Finished', {
							text: event.text ? event.text.slice(0, 100) + '...' : undefined,
							tools: event.toolCalls?.map((t: TypedToolCall<ToolSet>) => t.toolName).join(', ') || 'None'
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

							event.toolCalls.forEach((call: TypedToolCall<ToolSet>) => {
								logService.info(`[gitbbon-chat][Tool Call] ${call.toolName}`, call.input);
							});

							if (event.toolResults) {
								event.toolResults.forEach((toolResult: TypedToolResult<ToolSet>) => {
									logService.info(`[gitbbon-chat][Tool Result] ${toolResult.toolName}`, toolResult.output);
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
			} catch (error: unknown) {
				if ((error as Error)?.name === 'AbortError' || abortController.signal.aborted) {
					logService.info('[gitbbon-chat][aiService] Stream cancelled');
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: true,
					});
				} else if (this.isGatewayAuthError(error)) {
					logService.warn('[gitbbon-chat][aiService] GatewayAuthenticationError detected:', (error as Error).message);
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: false,
					});

					const keyUpdated = await this.handleApiKeyFailure();
					if (keyUpdated) {
						channel.push({ type: 'text', content: 'API 키가 업데이트되었습니다. 메시지를 다시 보내주세요.' });
					} else {
						channel.push({ type: 'text', content: 'API 키가 설정되지 않았습니다. 채팅을 사용하려면 유효한 API 키를 입력해주세요.' });
					}
				} else {
					logService.error('[gitbbon-chat][aiService] streamText failed:', error);
					channel.push({
						type: 'tool-end',
						id: thinkingId,
						toolName: 'Thinking...',
						duration: Date.now() - thinkingStart,
						success: false,
					});
					channel.push({ type: 'text', content: `오류가 발생했습니다: ${(error as Error)?.message || 'Unknown error'}` });
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

}
