import { generateText, streamText, type ModelMessage } from 'ai';
import { editorTools } from '../tools/editorTools';
// import { ToolResultPart } from 'ai';

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
	 * Phase 1: Manager collects context from editor
	 * Phase 2: Worker executes task with context
	 */
	public async *streamAgentChat(messages: ModelMessage[]): AsyncGenerator<string, void, unknown> {
		if (!this.apiKey) throw new Error('No API Key');
		const lastMessage = messages[messages.length - 1];
		const userInput = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

		// --- Phase 1: Manager (Context Gathering) ---
		// Cheap/Fast model to decide what tools to use
		// Fallback to gpt-4o-mini if gpt-5-nano is not available/supported
		const managerModelName = 'openai/gpt-5-nano';

		console.log(`[GitbbonChat] Phase 1: Manager (${managerModelName}) starting...`);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let toolResults: any[] = [];
		try {
			const { toolResults: results } = await generateText({
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				model: managerModelName,
				system: `
					당신은 에디터 문맥 수집가입니다. 사용자의 요청을 듣고 필요한 도구를 실행하세요.
					- "이거 고쳐줘", "요약해줘" -> get_selection()
					- "문서 전체 흐름 봐줘" -> get_current_file()
					- "안녕", "질문" -> 도구 실행 없음
				`,
				prompt: userInput,
				tools: editorTools,
				// maxSteps: 3, // Not supported in this version/type
			});
			toolResults = results;
			console.log(`[GitbbonChat] Phase 1: Manager finished. Tools called: ${toolResults.length}`);
		} catch (e) {
			console.warn(`[GitbbonChat] Manager phase failed (possibly model missing), retrieving selection as fallback.`, e);
			// Fallback: If manager fails, default to get_selection if possible?
			// For now, just proceed without context or try basic fallback
		}

		// Prepare gathered context info
		const selectionResult = toolResults.find(t => t.toolName === 'get_selection')?.result;
		const fileResult = toolResults.find(t => t.toolName === 'get_current_file')?.result;

		const contextInfo = `
[Context Info]
- Selection: ${selectionResult ? JSON.stringify(selectionResult).slice(0, 5000) : 'None'}
- File Content: ${fileResult ? 'Provided (Truncated in logs)' : 'None'}
		`.trim();
		console.log(`[GitbbonChat] contextInfo : ${contextInfo}`);

		if (fileResult) {
			// Append file content separately to avoid cluttering log
		}

		// --- Phase 2: Worker (Execution) ---
		// Strong model to execute the task
		const workerModelName = 'openai/gpt-5'; // Or use MODELS_TO_TRY[0] if preferred? User said gpt-4o.

		console.log(`[GitbbonChat] Phase 2: Worker (${workerModelName}) starting...`);

		const systemPrompt = `
당신은 글쓰기 도우미 AI입니다.
Manager가 수집한 [Context]를 바탕으로 요청을 처리하세요.

${contextInfo}

${fileResult ? `\n\n[File Content]\n${fileResult}` : ''}
		`.trim();

		try {
			const result = await streamText({
				model: workerModelName as string,
				system: systemPrompt,
				messages: messages, // History included
			});

			for await (const textPart of result.textStream) {
				yield textPart;
			}
		} catch (error) {
			// Fallback to original loop if specific model fails?
			// The user specificied gpt-4o, so we stick to it.
			throw error;
		}
	}

	// Legacy method kept for reference or fallback, but we primarily use streamAgentChat now
	public async *streamChat(messages: ModelMessage[]): AsyncGenerator<string, void, unknown> {
		// Just redirect to Agent Chat
		yield* this.streamAgentChat(messages);
	}
}
