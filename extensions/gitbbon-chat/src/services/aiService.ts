import { streamText, ToolLoopAgent, type ModelMessage } from 'ai';
import { createEditorTools } from '../tools/editorTools';
import { ContextService } from './ContextService';
import { MANAGER_SYSTEM_PROMPT, WORKER_BASE_PROMPT } from '../constants/prompts';

export class AIService {
	private apiKey: string | undefined;

	constructor() {
		this.initializeApiKey();
	}

	private initializeApiKey(): void {
		// [WARNING] TEMPORARY HARDCODED API KEY
		// This key is paid via credit and is intended for internal testing only.
		// TODO: Remove this before public release or when env loading is fixed.
		const HARDCODED_KEY = 'vck_4XdyhTvmnGMqyMBjZSTfGjgTTw0OfkKanAuoABTT2mJhFd49bt4YtYL5';

		// 우선순위: VERCEL_AI_GATE_API_KEY -> AI_GATEWAY_API_KEY -> Hardcoded
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY || HARDCODED_KEY;

		if (this.apiKey) {
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			console.log('[GitbbonChat] Initialized with API Key (Hardcoded fallback active)');
		} else {
			console.warn('[GitbbonChat] No API key found. Chat will use demo mode.');
		}
	}

	public hasApiKey(): boolean {
		return !!this.apiKey;
	}

	/**
	 * Relay Pattern (Manager -> Worker)
	 * Phase 1: Manager collects context from editor and chat history
	 * Phase 2: Worker executes task with context (not full messages)
	 */
	public async *streamAgentChat(messages: ModelMessage[]): AsyncGenerator<string, void, unknown> {
		if (!this.apiKey) throw new Error('No API Key');
		const lastMessage = messages[messages.length - 1];
		const userInput = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

		// --- Phase 1: Manager (Context Gathering) ---
		// 대화 내역을 클로저로 주입하여 get_chat_history 사용 가능
		const tools = createEditorTools(messages);
		const managerModelName = 'openai/gpt-5-nano';

		// Gather Environment Context
		const isMilkdown = ContextService.isGitbbonEditor();
		const activeFile = ContextService.getActiveFileName();

		let selectionPreview = 'None';
		const selectionDetail = await ContextService.getSelection();
		const SELECTION_LIMIT = 1000;
		let isTruncated = false;

		if (selectionDetail) {
			const { text, before, after } = selectionDetail;
			isTruncated = text.length > SELECTION_LIMIT;
			const truncatedText = text.slice(0, SELECTION_LIMIT) + (isTruncated ? '... (truncated)' : '');

			selectionPreview = `
[Context Before]
${before}

[Selected Text]
${truncatedText}

[Context After]
${after}
`.trim();
		}

		let cursorContext = 'None';
		if (!selectionDetail) {
			const context = await ContextService.getCursorContext();
			if (context) cursorContext = context;
		}

		console.log(`[GitbbonChat] Gathered Context: isMilkdown=${isMilkdown}, selectionLen=${selectionPreview.length}, cursorContextLen=${cursorContext.length}, activeFile=${activeFile}`);

		// History Count excluding the recent 4 + current (5 total)
		const olderMessageCount = Math.max(0, messages.length - 5);
		const openTabs = ContextService.getOpenTabs();

		const environmentContext = `
[Current Environment Context]
- Active File: ${activeFile}

- Selection Preview (Priority High):
"""
${selectionPreview}
"""
  (Rule: If this is NOT "None", assume user is talking about this code.
   If text ends with "... (truncated)", call 'get_selection' to get full content.
   Otherwise, use this text DIRECTLY.)

- Cursor Context (Priority Medium):
"""
${cursorContext}
"""
  (Rule: Only used when Selection is "None".
   This shows ~10 lines around the cursor. Use this for "fix this", "explain this" when nothing is selected.)

- Older Chat History Count: ${olderMessageCount}
  (Rule: If 0, DO NOT call 'get_chat_history'. Recent context is already handled by Worker.)

- Open Files (Tabs):
${openTabs.map(label => `  - ${label}`).join('\n')}
  (Rule: Check this list if user says "that file" or "previous file".)
`.trim();

		console.log(`[GitbbonChat] Phase 1: Manager(${managerModelName}) starting...`);
		console.log(`[GitbbonChat] Env Context: selectionPreview=${selectionPreview}, activeFile=${activeFile}, tabs=${openTabs.length}`);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let toolResults: any[] = [];

		const instructions = MANAGER_SYSTEM_PROMPT + '\n\n' + environmentContext;
		console.log(`[GitbbonChat] Instructions: ${instructions}`);

		try {
			// ToolLoopAgent: AI SDK 6의 production-ready tool loop 구현체
			const managerAgent = new ToolLoopAgent({
				model: managerModelName,
				instructions,
				tools,
				onStepFinish: (event) => {
					console.log('[GitbbonChat] Manager Step:', JSON.stringify({
						text: event.text,
						toolCalls: event.toolCalls,
						finishReason: event.finishReason
					}, null, 2));
				}
			});

			const result = await managerAgent.generate({
				prompt: userInput,
			});

			toolResults = result.toolResults;
			console.log(`[GitbbonChat] Phase 1: Manager finished. Tools called: ${toolResults.length}`, 'toolResults', toolResults);

			// 도구 호출 없이 Manager가 직접 답변하는 경우라도,
			// 진짜 스트리밍을 위해 Worker 단계로 내용을 넘기도록 함.
		} catch (e) {
			console.warn(`[GitbbonChat] Manager phase failed(possibly model missing).`, e);
		}

		// Prepare gathered context info

		// Prepare gathered context info
		const selectionResult = toolResults.find(t => t.toolName === 'get_selection')?.output;
		const fileResult = toolResults.find(t => t.toolName === 'get_current_file')?.output;
		const historyResult = toolResults.find(t => t.toolName === 'get_chat_history')?.output;
		const searchResult = toolResults.find(t => t.toolName === 'search_in_workspace')?.output;

		// Default History: Last 2 turns (4 messages) excluding the current user message
		// messages array includes the current user message at the end.
		// So we want messages[length-5] to messages[length-2].
		// But wait, 'messages' passed to streamChat includes the NEW user message at the end?
		// Yes, standard AI SDK behavior.
		// So:
		// [ ... old history ..., User(n-1), AI(n-1), User(n) ]
		// We want User(n-1) and AI(n-1) as "recent history".
		// Actually, user said "Last 2 conversations" (turns). So maybe 2 pairs?
		// User(n-2), AI(n-2), User(n-1), AI(n-1).
		// Let's take up to 4 previous messages (excluding the current one).

		const previousMessages = messages.slice(0, -1); // Exclude current user message
		const recentHistoryMessages = previousMessages.slice(-4); // Last 4 messages
		const recentHistoryContext = recentHistoryMessages.map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');

		const contextInfo = `
[Context Info]
- Selection: ${selectionResult ? JSON.stringify(selectionResult).slice(0, 5000) : 'None'}
- File Content: ${fileResult ? 'Provided' : 'None'}
- Chat History (Tool): ${historyResult ? 'Provided' : 'None'}
- Recent History (Default): ${recentHistoryContext ? 'Provided' : 'None'}
- Search Results: ${searchResult ? 'Provided' : 'None'}
`.trim();

		console.log(`[GitbbonChat] Context gathered: selection = ${!!selectionResult}, file = ${!!fileResult}, history = ${!!historyResult} `);

		// --- Phase 2: Worker (Execution) ---
		// 워커에게는 전체 messages 대신 시스템 프롬프트에 컨텍스트를 포함하여 전달
		// 이로써 토큰 절약 및 레이턴시 감소
		const workerModelName = 'openai/gpt-5';

		console.log(`[GitbbonChat] Phase 2: Worker(${workerModelName}) starting...`);

		const dynamicContext = `
${contextInfo}

${selectionResult ? `\n[Selected Text]\n${selectionResult}\n` : ''}
${fileResult ? `\n[File Content]\n${fileResult}\n` : ''}
${historyResult ? `\n[Chat History (Tool)]\n${historyResult}\n` : ''}
${recentHistoryContext ? `\n[Recent History (Default)]\n${recentHistoryContext}\n` : ''}
${searchResult ? `\n[Search Results]\n${searchResult}\n` : ''}
`.trim();

		console.log(`[GitbbonChat] Dynamic context: ${dynamicContext}`);

		try {
			// OpenAI 자동 캐싱: 동일한 prefix(시스템 프롬프트)가 있으면 자동으로 캐시 적용
			const result = await streamText({
				model: workerModelName as string,
				messages: [
					{ role: 'system', content: WORKER_BASE_PROMPT },
					{ role: 'system', content: dynamicContext },
					{ role: 'user', content: userInput }
				],
			});

			for await (const textPart of result.textStream) {
				yield textPart;
			}
		} catch (error) {
			throw error;
		}
	}

	// Legacy method kept for reference or fallback
	public async *streamChat(messages: ModelMessage[]): AsyncGenerator<string, void, unknown> {
		yield* this.streamAgentChat(messages);
	}
}
