import * as vscode from 'vscode';
import { ToolLoopAgent, type ModelMessage } from 'ai';
import { createEditorTools } from '../tools/editorTools';
import { ContextService } from './ContextService';
import { SYSTEM_PROMPT } from '../constants/prompts';

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
	 * Single-Model Architecture
	 * 고성능 모델 하나로 도구 호출 + 응답 생성을 모두 처리
	 */
	public async *streamAgentChat(messages: ModelMessage[]): AsyncGenerator<string, void, unknown> {
		if (!this.apiKey) throw new Error('No API Key');
		const lastMessage = messages[messages.length - 1];
		const userInput = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

		// 도구 설정
		const tools = createEditorTools(messages);
		const modelName = 'google/gemini-3-pro'; // 단일 고성능 모델 (2025.11 latest)

		// 환경 컨텍스트 수집
		const activeFile = ContextService.getActiveFileName();
		let selectionPreview = 'None';
		const selectionDetail = await ContextService.getSelection();
		const SELECTION_LIMIT = 1000;

		if (selectionDetail) {
			const { text, before, after } = selectionDetail;
			const isTruncated = text.length > SELECTION_LIMIT;
			const truncatedText = text.slice(0, SELECTION_LIMIT) + (isTruncated ? '... (truncated)' : '');
			selectionPreview = `[Context Before]\n${before}\n\n[Selected Text]\n${truncatedText}\n\n[Context After]\n${after}`;
		}

		let cursorContext = 'None';
		if (!selectionDetail) {
			const context = await ContextService.getCursorContext();
			if (context) cursorContext = context;
		}

		const olderMessageCount = Math.max(0, messages.length - 5);
		const openTabs = ContextService.getOpenTabs();

		// 환경 컨텍스트 구성
		const contextParts: string[] = ['[Current Environment Context]'];

		// 프로젝트 제목 주입
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			try {
				const gitbbonConfigUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.gitbbon.json');
				const configData = await vscode.workspace.fs.readFile(gitbbonConfigUri);
				const config = JSON.parse(Buffer.from(configData).toString('utf-8'));
				if (config.title && config.title.trim()) {
					contextParts.push(`- Project: ${config.title}`);
				}
			} catch {
				// .gitbbon.json not found or invalid, skip
			}
		}

		if (activeFile && activeFile !== 'None') {
			contextParts.push(`- Active File: ${activeFile}`);
		}

		if (selectionPreview !== 'None') {
			contextParts.push(`\n- Selection Preview:\n"""\n${selectionPreview}\n"""\n  (If truncated, call 'get_selection' for full content)`);
		}

		if (cursorContext !== 'None' && selectionPreview === 'None') {
			contextParts.push(`\n- Cursor Context:\n"""\n${cursorContext}\n"""`);
		}

		if (olderMessageCount > 0) {
			contextParts.push(`\n- Older Chat History: ${olderMessageCount} messages (call 'get_chat_history' if needed)`);
		}

		if (openTabs.length > 0) {
			contextParts.push(`\n- Open Files:\n${openTabs.map(label => `  - ${label}`).join('\n')}`);
		}

		// 최근 대화 히스토리 (마지막 4개 메시지)
		const previousMessages = messages.slice(0, -1);
		const recentHistory = previousMessages.slice(-4);
		if (recentHistory.length > 0) {
			const historyText = recentHistory.map(m =>
				`[${m.role}]: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`
			).join('\n\n');
			contextParts.push(`\n- Recent History:\n${historyText}`);
		}

		const environmentContext = contextParts.join('\n');
		const instructions = SYSTEM_PROMPT + '\n\n' + environmentContext;

		console.log(`[GitbbonChat] Single-Model(${modelName}) starting...`);
		console.log(`[GitbbonChat] Active File: ${activeFile}, Selection: ${selectionPreview !== 'None'}, Tabs: ${openTabs.length}`);

		try {
			const agent = new ToolLoopAgent({
				model: modelName,
				instructions,
				tools,
				onStepFinish: (event) => {
					console.log('[GitbbonChat] Step:', JSON.stringify({
						text: event.text?.slice(0, 200),
						toolCalls: event.toolCalls?.map(t => t.toolName),
						finishReason: event.finishReason
					}));
				}
			});

			const result = await agent.generate({
				prompt: userInput,
			});

			// 응답 전체를 한 번에 yield
			if (result.text) {
				yield result.text;
			}

		} catch (error) {
			console.error('[GitbbonChat] Agent failed:', error);
			throw error;
		}
	}

	// Legacy method
	public async *streamChat(messages: ModelMessage[]): AsyncGenerator<string, void, unknown> {
		yield* this.streamAgentChat(messages);
	}
}
