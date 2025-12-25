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

		const messageCount = messages.length;
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

- Chat History Count: ${messageCount}
  (Rule: If 0, DO NOT call 'get_chat_history'.)

- Open Files (Tabs):
${openTabs.map(label => `  - ${label}`).join('\n')}
  (Rule: Check this list if user says "that file" or "previous file".)
`.trim();

		console.log(`[GitbbonChat] Phase 1: Manager(${managerModelName}) starting...`);
		console.log(`[GitbbonChat] Env Context: selectionPreview=${selectionPreview}, activeFile=${activeFile}, tabs=${openTabs.length}`);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let toolResults: any[] = [];
		// Manager가 직접 답변 가능 여부 판단
		let managerDirectAnswer: string | undefined;

		const instructions = MANAGER_SYSTEM_PROMPT + '\n\n' + environmentContext;
		console.log(`[GitbbonChat] Instructions: ${instructions}`);

		try {
			// ToolLoopAgent: AI SDK 6의 production-ready tool loop 구현체
			const managerAgent = new ToolLoopAgent({
				model: managerModelName,
				instructions,
				tools
			});

			const result = await managerAgent.generate({
				prompt: userInput,
			});

			toolResults = result.toolResults;
			console.log(`[GitbbonChat] Phase 1: Manager finished. Tools called: ${toolResults.length}`);

			// 도구 호출 없이 Manager가 직접 답변한 경우
			if (toolResults.length === 0 && result.text && result.text.trim().length > 0) {
				managerDirectAnswer = result.text;
				console.log(`[GitbbonChat] Phase 1: Manager answered directly(no tools needed)`);
			}
		} catch (e) {
			console.warn(`[GitbbonChat] Manager phase failed(possibly model missing).`, e);
		}

		// --- Short-circuit: Manager 직접 답변 ---
		if (managerDirectAnswer) {
			console.log(`[GitbbonChat] Skipping Worker - Manager handled directly`);
			yield managerDirectAnswer;
			return;
		}

		// Prepare gathered context info
		const selectionResult = toolResults.find(t => t.toolName === 'get_selection')?.output;
		const fileResult = toolResults.find(t => t.toolName === 'get_current_file')?.output;
		const historyResult = toolResults.find(t => t.toolName === 'get_chat_history')?.output;
		const searchResult = toolResults.find(t => t.toolName === 'search_in_workspace')?.output;

		const contextInfo = `
[Context Info]
- Selection: ${selectionResult ? JSON.stringify(selectionResult).slice(0, 5000) : 'None'}
- File Content: ${fileResult ? 'Provided' : 'None'}
- Chat History: ${historyResult ? 'Provided' : 'None'}
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
${historyResult ? `\n[Chat History]\n${historyResult}\n` : ''}
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
