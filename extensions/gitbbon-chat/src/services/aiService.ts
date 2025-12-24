import { generateText, streamText, type ModelMessage } from 'ai';
import { createEditorTools } from '../tools/editorTools';

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

		console.log(`[GitbbonChat] Phase 1: Manager (${managerModelName}) starting...`);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let toolResults: any[] = [];
		// Manager가 직접 답변 가능 여부 판단
		let managerDirectAnswer: string | undefined;

		try {
			const { toolResults: results, text: managerText } = await generateText({
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				model: managerModelName,
				system: `당신은 에디터 문맥 수집가이자 간단한 질문 응답자입니다.

[역할]
1. 에디터 컨텍스트가 필요한 요청 → 도구 호출
2. 컨텍스트 없이 답변 가능한 요청 → 직접 텍스트로 답변

[도구 선택 기준]
1. get_selection() - 현재 선택된 텍스트가 필요할 때
   - 대상: 선택 영역, 이 코드, 이거, 여기, 해당 부분 등 지시어 사용 시
   - 작업: 수정, 리팩터링, 설명, 리뷰, 번역, 디버깅, 최적화 요청 시

2. get_current_file() - 파일 전체 맥락이 필요할 때
   - 대상: 전체, 파일, 문서, 구조, 흐름 언급 시
   - 작업: 전체 분석, 구조 파악, 아키텍처 질문 시

3. get_chat_history(count, query) - 이전 대화 참조가 필요할 때
   - 대상: 아까, 이전에, 방금, 다시, 그거 등 과거 참조 시

[직접 답변 가능한 경우 - 도구 호출 없이 텍스트로 응답]
- 인사: 안녕, 고마워, 잘가 등
- 일반 질문: 개념 설명, 문법 질문, 일반 지식
- 간단한 대화: 잡담, 확인, 칭찬

[규칙]
- 복합 요청 시 여러 도구 호출 가능
- 불확실하면 도구 호출하지 않고 직접 답변
- 직접 답변 시 친절하고 자연스럽게 응답
`,
				prompt: userInput,
				tools: tools,
			});
			toolResults = results;

			// 도구 호출 없이 Manager가 직접 답변한 경우
			if (toolResults.length === 0 && managerText && managerText.trim().length > 0) {
				managerDirectAnswer = managerText;
				console.log(`[GitbbonChat] Phase 1: Manager answered directly (no tools needed)`);
			} else {
				console.log(`[GitbbonChat] Phase 1: Manager finished. Tools called: ${toolResults.length}`);
			}
		} catch (e) {
			console.warn(`[GitbbonChat] Manager phase failed (possibly model missing).`, e);
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

		const contextInfo = `
[Context Info]
- Selection: ${selectionResult ? JSON.stringify(selectionResult).slice(0, 5000) : 'None'}
- File Content: ${fileResult ? 'Provided' : 'None'}
- Chat History: ${historyResult ? 'Provided' : 'None'}
		`.trim();

		console.log(`[GitbbonChat] Context gathered: selection=${!!selectionResult}, file=${!!fileResult}, history=${!!historyResult}`);

		// --- Phase 2: Worker (Execution) ---
		// 워커에게는 전체 messages 대신 시스템 프롬프트에 컨텍스트를 포함하여 전달
		// 이로써 토큰 절약 및 레이턴시 감소
		const workerModelName = 'openai/gpt-5';

		console.log(`[GitbbonChat] Phase 2: Worker (${workerModelName}) starting...`);

		const systemPrompt = `
당신은 글쓰기 도우미 AI입니다.
Manager가 수집한 컨텍스트를 바탕으로 요청을 처리하세요.

${contextInfo}

${selectionResult ? `\n[Selected Text]\n${selectionResult}\n` : ''}
${fileResult ? `\n[File Content]\n${fileResult}\n` : ''}
${historyResult ? `\n[Chat History]\n${historyResult}\n` : ''}
		`.trim();

		try {
			// 워커에게는 현재 사용자 메시지만 전달 (컨텍스트는 systemPrompt에 포함)
			const workerMessages: ModelMessage[] = [
				{ role: 'user', content: userInput }
			];

			const result = await streamText({
				model: workerModelName as string,
				system: systemPrompt,
				messages: workerMessages,
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
