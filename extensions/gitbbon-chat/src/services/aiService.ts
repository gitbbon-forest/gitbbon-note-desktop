import * as vscode from 'vscode';
import { streamText, stepCountIs, type ModelMessage, type LanguageModel, type ToolSet, type TypedToolCall, type TypedToolResult } from 'ai';
import { ollama } from 'ollama-ai-provider-v2';
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

	// gitbbon custom: Issue #129 - CHAT_BACKEND SecretStorage → VS Code Configuration 마이그레이션
	public async getBackend(): Promise<'api' | 'ollama'> {
		const config = vscode.workspace.getConfiguration('gitbbon');
		const stored = config.get<string>('ai.backend');
		return (stored === 'ollama') ? 'ollama' : 'api';
	}

	// gitbbon custom: Issue #129 - backend를 VS Code Configuration에 저장
	public async setBackend(backend: 'api' | 'ollama'): Promise<void> {
		const config = vscode.workspace.getConfiguration('gitbbon');
		await config.update('ai.backend', backend, vscode.ConfigurationTarget.Global);
	}

	// gitbbon custom: Issue #129 - 선택된 Ollama 모델을 Configuration에서 읽기
	public getOllamaModelFromConfig(): string {
		const config = vscode.workspace.getConfiguration('gitbbon');
		return config.get<string>('ai.ollamaModel') || '';
	}

	// gitbbon custom: Issue #129 - 선택된 Ollama 모델을 Configuration에 저장
	public async setOllamaModel(model: string): Promise<void> {
		const config = vscode.workspace.getConfiguration('gitbbon');
		await config.update('ai.ollamaModel', model, vscode.ConfigurationTarget.Global);
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

	// Issue #119: API backend 모델에 대한 기본 capabilities 정의
	private getApiModelCapabilities(): { thinking: boolean; tools: boolean; completion: boolean } {
		// openai/o4-mini는 tool calling을 지원하지만 thinking은 providerOptions(reasoningSummary)로 처리됨
		return { thinking: false, tools: true, completion: true };
	}

	public async *streamAgentChat(messages: ModelMessage[], selectedModel?: string, modelCapabilities?: { thinking: boolean; tools: boolean; completion: boolean }): AsyncGenerator<StreamEvent, void, unknown> {
		const backend = await this.getBackend();
		// gitbbon custom: GatewayAuthenticationError 진단용 상태 로그 (#127)
		logService.info('[gitbbon-chat][aiService] streamAgentChat 진입', {
			backend,
			initialized: this.initialized,
			hasApiKey: !!this.apiKey,
			hasEnvKey: !!process.env.AI_GATEWAY_API_KEY,
			selectedModel: selectedModel || 'none',
		});
		if (backend !== 'ollama') {
			await this.ensureInitialized();
			// gitbbon custom: ensureInitialized 완료 후 상태 확인 (#127)
			logService.info('[gitbbon-chat][aiService] ensureInitialized 완료', {
				initialized: this.initialized,
				hasApiKey: !!this.apiKey,
				hasEnvKey: !!process.env.AI_GATEWAY_API_KEY,
			});
			if (!this.apiKey) {
				const keyProvided = await this.promptForApiKey();
				if (!keyProvided || !this.apiKey) {
					yield { type: 'text', content: 'API 키가 설정되지 않았습니다. 채팅을 시작하려면 API 키를 입력해주세요.\n\n명령 팔레트에서 `Gitbbon Chat: Set API Key`를 실행하거나 다시 메시지를 보내주세요.' };
					return;
				}
			}
			// Issue #119: API backend인 경우 modelCapabilities가 undefined면 기본값 적용
			if (!modelCapabilities) {
				modelCapabilities = this.getApiModelCapabilities();
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

		// gitbbon custom: Issue #99 - experimental_context로 tool 컨텍스트 전달 (closure 의존성 제거)
		const tools = createEditorTools();

		// Resolve model: Ollama returns a LanguageModel object; API backend uses a gateway string ID
		let model: LanguageModel | string;
		if (backend === 'ollama') {
			// gitbbon custom: UI에서 선택한 모델을 우선 사용, 없으면 설치된 첫 번째 모델 또는 하드웨어 기반 선택
			const ollamaModelName = selectedModel || await ollamaService.getSelectedModel();
			logService.info(`[gitbbon-chat][aiService] Ollama backend: model=${ollamaModelName} (selectedModel=${selectedModel || 'none'})`);
			model = ollama(ollamaModelName);
		} else {
			model = 'openai/o4-mini';
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

				// Issue #64: 백엔드별 reasoning providerOptions 설정
				logService.info(`[gitbbon-chat][aiService] streamText 시작, backend=${backend}`);

				// Issue #74: useThink 파라미터로 think 옵션 조건부 제어
				const buildProviderOptions = (useThink: boolean) => {
					if (backend === 'ollama') {
						return useThink ? { ollama: { think: true } } : {};
					}
					return { openai: { reasoningSummary: 'detailed' } };
				};


				// gitbbon custom: Issue #98 - 편집 요청 감지 함수
				const detectEditRequest = (msgs: ModelMessage[]): boolean => {
					const lastMsg = msgs[msgs.length - 1];
					const text = typeof lastMsg?.content === 'string'
						? lastMsg.content
						: JSON.stringify(lastMsg?.content ?? '');
					const editKeywords = [
						'수정', '편집', '고쳐', '변경', '업데이트', '작성해', '만들어', '삭제',
						'create', 'update', 'edit', 'modify', 'fix', 'delete', 'write', 'add'
					];
					return editKeywords.some(kw => text.toLowerCase().includes(kw));
				};

				// gitbbon custom: Issue #98 - 편집 요청 시 toolChoice required 적용
				const isEditRequest = detectEditRequest(messages);

				// Issue #100: prepareStep으로 단계별 tool 접근 제어 (읽기 → 편집 순서 강제)
				// 읽기 tool을 사용하기 전까지 초반 스텝(stepNumber <= 3)에서 edit_note 비활성화
				const READ_TOOLS = ['search_in_workspace', 'read_file', 'get_current_file', 'get_selection', 'get_chat_history'] as const;
				type ReadToolName = typeof READ_TOOLS[number];
				const ALL_TOOLS = [...READ_TOOLS, 'edit_note'] as const;

				const prepareStepFn = async ({ stepNumber, steps }: { stepNumber: number; steps: Array<{ toolCalls?: Array<{ toolName: string }> }> }) => {
					const hasReadStep = steps.some(s =>
						s.toolCalls?.some(t => READ_TOOLS.includes(t.toolName as ReadToolName))
					);
					if (!hasReadStep && stepNumber <= 3) {
						return { activeTools: [...READ_TOOLS] };
					}
					return {};
				};

				// Issue #74: tool 미지원 모델 fallback을 위한 헬퍼 함수 (think 옵션도 제어)
				// Issue #97: tool 단위 실행 추적을 위한 Map (toolCallId -> {toolName, startTime, channelId})
				// editorTools의 emitter와 중복을 피하기 위해 SDK 훅에서는 별도 channelId로 tracking
				const activeToolCalls = new Map<string, { toolName: string; channelId: string }>();

				const callStreamText = (useTools: boolean, useThink: boolean = true) => {
					const providerOptions = buildProviderOptions(useThink) as any;
					// gitbbon custom: Issue #98 - 편집 요청 시 toolChoice required 설정으로 텍스트 응답 방지
					const toolChoice = (useTools && isEditRequest) ? 'required' : 'auto';
					// gitbbon custom: Issue #99 - experimental_context로 tool에 messages/emitter 전달
					const toolContext = { messages, emitter };
					return streamText({
						model,
						system: instructions,
						messages: messages as ModelMessage[],
						...(useTools ? { tools, toolChoice, stopWhen: stepCountIs(10), prepareStep: prepareStepFn } : {}),
						abortSignal: abortController.signal,
						providerOptions,
						// Issue #97: tool 단위 시작 훅
						// editorTools emitter가 처리하지 못한 tool을 위한 fallback으로도 동작
						experimental_onToolCallStart: ({ toolCall }) => {
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
							const channelId = generateToolId();
							activeToolCalls.set(toolCall.toolCallId, {
								toolName: toolCall.toolName,
								channelId,
							});
							// editorTools emitter가 tool-start를 보내지 않을 때만 별도 이벤트 전송
							// (editorTools에 등록된 tool은 withProgress에서 처리)
						},
						// Issue #97: tool 단위 완료 훅 - SDK 제공 durationMs 사용
						experimental_onToolCallFinish: ({ toolCall, durationMs, success, error }) => {
							const info = activeToolCalls.get(toolCall.toolCallId);
							if (info) {
								activeToolCalls.delete(toolCall.toolCallId);
							}
						},
						experimental_context: toolContext,
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
										// gitbbon custom: Issue #109 - edit_note 루프 방지
										if (toolResult.toolName === 'edit_note' && typeof toolResult.output === 'string') {
											// suggestion 성공 후 재호출 루프 방지
											if (toolResult.output.startsWith('Suggestion applied')) {
												logService.info('[gitbbon-chat][Loop Guard] Suggestion applied — aborting stream');
												abortController.abort();
											}
											// 패널 못 찾음 — 재시도해도 해결 불가능한 에러이므로 즉시 중단 후 사용자에게 안내
											if (toolResult.output.includes('No active Gitbbon editor panel')) {
												logService.info('[gitbbon-chat][Loop Guard] Panel not found — aborting stream');
												channel.push({ type: 'text', content: '⚠️ Gitbbon 에디터 패널을 찾을 수 없습니다. 파일이 Gitbbon 에디터로 열려 있는지 확인해주세요.' });
												abortController.abort();
											}
										}
									});
								}
							}
						},
						onAbort: () => {
							logService.info('[gitbbon-chat][aiService] Stream aborted');
						},
					});
				};

				// Issue #74: tool 미지원 에러 감지 함수
				const isToolNotSupportedError = (error: unknown): boolean => {
					const message = (error as Error)?.message || '';
					return message.includes('does not support tools') || message.includes('tool use is not supported');
				};

				// Issue #74: Ollama Bad Request 에러 감지 함수 (think 미지원 등)
				const isOllamaBadRequestError = (error: unknown): boolean => {
					const message = (error as Error)?.message || '';
					const name = (error as Error)?.name || '';
					return message.includes('Bad Request') || message.includes('400') || name === 'AI_APICallError';
				};

				// Issue #74: fullStream 소비 함수 - 콘텐츠 수신 여부를 반환
				const consumeStream = async (result: { fullStream: AsyncIterable<any> }): Promise<boolean> => {
					let hasContent = false;
					for await (const part of result.fullStream) {
						if (abortController.signal.aborted) break;

						if (part.type === 'reasoning-start') {
							hasContent = true;
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
						} else if (part.type === 'reasoning-delta') {
							const reasoningText = (part as any).text || (part as any).delta || '';
							if (reasoningText) {
								hasContent = true;
								channel.push({ type: 'reasoning', content: reasoningText });
							}
						} else if (part.type === 'reasoning-end') {
							// reasoning 종료
						} else if (part.type === 'text-delta') {
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
							if (part.text) {
								hasContent = true;
								channel.push({ type: 'text', content: part.text });
							}
						} else if (part.type === 'tool-call') {
							hasContent = true;
						}
					}
										return hasContent;
				};

				// Issue #77: capabilities 기반 초기 옵션 결정
				// capabilities가 있으면 사전 감지된 정보로 불필요한 fallback을 건너뜀
				const initialUseThink = modelCapabilities ? modelCapabilities.thinking : true;
				const initialUseTools = modelCapabilities ? modelCapabilities.tools : true;

				// Issue #74/#77: fallback 전략 (capabilities로 사전 결정 + 에러/빈 응답 시 fallback)
				const tryStreamWithFallback = async () => {
					// Issue #77: capabilities 정보가 있으면 지원하지 않는 옵션은 처음부터 비활성화
					const strategies: Array<{ useTools: boolean; useThink: boolean; label: string }> = [];
					if (initialUseTools && initialUseThink) {
						strategies.push({ useTools: true, useThink: true, label: '1차 (tools+think)' });
					}
					if (initialUseTools && !initialUseThink) {
						strategies.push({ useTools: true, useThink: false, label: '1차 (tools only)' });
					}
					if (!initialUseTools && initialUseThink) {
						strategies.push({ useTools: false, useThink: true, label: '1차 (think only)' });
					}
					// safety net: fallback 전략 추가 (capabilities 정보가 부정확할 경우 대비)
					if (initialUseThink) {
						strategies.push({ useTools: initialUseTools, useThink: false, label: 'fallback (think 비활성화)' });
					}
					if (initialUseTools) {
						strategies.push({ useTools: false, useThink: false, label: 'fallback (tools+think 비활성화)' });
					}
					// 최종 fallback: 모두 비활성화
					if (!strategies.some(s => !s.useTools && !s.useThink)) {
						strategies.push({ useTools: false, useThink: false, label: 'fallback (기본)' });
					}

					for (let i = 0; i < strategies.length; i++) {
						const { useTools, useThink, label } = strategies[i];

						hasToolCalls = false;

						try {
							const result = callStreamText(useTools, useThink);
							const hasContent = await consumeStream(result);

							if (hasContent) {
								return; // 성공 시 종료
							}

							// 빈 응답: 다음 전략 시도
							if (i < strategies.length - 1) {
								if (useThink && !strategies[i + 1].useThink) {
									channel.push({ type: 'text', content: '⚠️ 이 모델은 추론(think) 기능을 지원하지 않습니다. 기본 모드로 전환합니다.\n\n' });
								}
								if (useTools && !strategies[i + 1].useTools) {
									channel.push({ type: 'text', content: '⚠️ 이 모델은 tool calling을 지원하지 않아 일부 기능(파일 편집 등)이 제한됩니다.\n\n' });
								}
								continue;
							}
							// 마지막 전략도 빈 응답이면 그냥 종료
							return;
						} catch (streamError: unknown) {
							// Issue #119: GatewayAuthenticationError는 fallback 없이 즉시 전파
							if (this.isGatewayAuthError(streamError)) {
									throw streamError;
							}
							if (i < strategies.length - 1 && (isToolNotSupportedError(streamError) || isOllamaBadRequestError(streamError))) {
									if (useTools && !strategies[i + 1].useTools) {
									channel.push({ type: 'text', content: '⚠️ 이 모델은 tool calling을 지원하지 않아 일부 기능(파일 편집 등)이 제한됩니다.\n\n' });
								}
								if (useThink && !strategies[i + 1].useThink) {
									channel.push({ type: 'text', content: '⚠️ 이 모델은 추론(think) 기능을 지원하지 않습니다. 기본 모드로 전환합니다.\n\n' });
								}
								continue;
							}
							throw streamError; // 알 수 없는 에러는 전파
						}
					}
				};
				await tryStreamWithFallback();
				logService.info('[gitbbon-chat][AI Response] Streaming complete');

				// 스트리밍 완료 후에도 Thinking 단계가 끝나지 않았다면 종료 처리
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
					// gitbbon custom: GatewayAuthenticationError 진단 로그 — 실제 원인 파악용 (#127)
					// 앱 리로드 시 문제 해결 → API 키 자체는 유효, 상태/인스턴스 문제 가능성
					logService.warn('[gitbbon-chat][aiService] GatewayAuthenticationError 발생 — 진단 정보:', {
						errorName: (error as Error)?.name,
						errorMessage: (error as Error)?.message,
						errorStack: (error as Error)?.stack?.split('\n').slice(0, 5).join(' | '),
						initialized: this.initialized,
						hasApiKey: !!this.apiKey,
						hasEnvKey: !!process.env.AI_GATEWAY_API_KEY,
						model: typeof model === 'string' ? model : 'ollama-object',
						backend,
					});
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

	public async *streamChat(messages: ModelMessage[], selectedModel?: string): AsyncGenerator<StreamEvent, void, unknown> {
		yield* this.streamAgentChat(messages, selectedModel);
	}

}
