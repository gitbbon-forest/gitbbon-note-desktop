import { streamText, ToolLoopAgent, type ModelMessage } from 'ai';
import { createEditorTools, isGitbbonEditorActive } from '../tools/editorTools';
import * as vscode from 'vscode';

// --- CONSTANT: Manager System Prompt (Base) ---
// This prompt guides the Manager to collect context or answer directly.
// It is designed to be appended with [Current Environment Context] dynamically.
const MANAGER_SYSTEM_PROMPT = `You are an intelligent "Editor Context Manager" and a simple Q&A assistant.

[Role]
1. If editor context is needed for the request: Call the appropriate tools to gather it.
2. If the request can be answered without context (e.g., greetings, general knowledge): Answer directly via text.

[Tool Descriptions & Selection Criteria]
1. get_selection()
   - Use when: The user refers to "selected text", "this code", "this part", "here".
   - Actions: Refactoring, explaining, translating, or debugging the *specific* selection.

2. get_current_file()
   - Use when: The user needs context of the *entire* file (structure, patterns, full scope).
   - triggers: "current file", "whole file", "this document", "structure".

3. get_chat_history(count, query)
   - Use when: The user refers to previous turns.
   - triggers: "before", "previously", "last time", "what we discussed", "again".

4. search_in_workspace(query, isRegex?, filePattern?, context?, maxResults?)
   - Use when: The user asks to find something across the project.
   - triggers: "where is", "find usage", "search for", "who calls this".
   - Note: Use sensible 'context' (default 100) and 'maxResults' (default 3) unless user asks for more.

5. read_file(filePath)
   - Use when: The user asks to read a specific file OTHER than the active one.
   - triggers: "read that file", "check utils.ts", "look at the second tab".
   - Note: Pick 'filePath' from the [Open Files] list or valid project paths.

[General Rules]
- You can call multiple tools if needed.
- If unsure, prefer answering directly or asking for clarification (but try to be helpful first).
- BE PRECISE. Do not call tools purely for guessing.

[Dynamic Context Rules - STRICTLY FOLLOW]
The user will provide [Current Environment Context].
1. If 'Has Selection' is 'No': DO NOT call get_selection().
2. If 'Chat History Count' is 0: DO NOT call get_chat_history().
3. If 'Active File' is 'None': DO NOT call get_current_file() or get_selection().
4. Consult 'Open Files' list to understand references to "that file" or "the other tab".
`;



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
		const activeEditor = vscode.window.activeTextEditor;
		const isMilkdown = isGitbbonEditorActive();

		let selectionPreview = 'None';
		let cursorContext = 'None';
		let isTruncated = false;
		let activeFile = 'None';

		const SELECTION_LIMIT = 1000;

		if (activeEditor) {
			// 1. Standard Text Editor
			activeFile = vscode.workspace.asRelativePath(activeEditor.document.uri);

			if (!activeEditor.selection.isEmpty) {
				// Case A: Selection exists -> Capture up to 1000 chars
				const text = activeEditor.document.getText(activeEditor.selection);
				isTruncated = text.length > SELECTION_LIMIT;
				selectionPreview = text.slice(0, SELECTION_LIMIT) + (isTruncated ? '... (truncated)' : '');
			} else {
				// Case B: No Selection -> Capture Cursor Context (10 lines around)
				const cursorLine = activeEditor.selection.active.line;
				const startLine = Math.max(0, cursorLine - 5);
				const endLine = Math.min(activeEditor.document.lineCount - 1, cursorLine + 5);
				const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
				cursorContext = activeEditor.document.getText(range);
			}
		} else if (isMilkdown) {
			// 2. Milkdown Custom Editor
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			activeFile = activeTab?.label || 'Milkdown Doc';
			try {
				// Try getting selection first
				const selection = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getSelection');
				if (selection && selection.length > 0) {
					isTruncated = selection.length > SELECTION_LIMIT;
					selectionPreview = selection.slice(0, SELECTION_LIMIT) + (isTruncated ? '... (truncated)' : '');
				} else {
					// If no selection, try getting cursor context
					const context = await vscode.commands.executeCommand<string | null>('gitbbon.editor.getCursorContext');
					if (context && context.length > 0) {
						cursorContext = context;
					}
				}
			} catch (e) {
				console.warn('[GitbbonChat] Failed to check milkdown context:', e);
			}
		}

		console.log(`[GitbbonChat] Gathered Context: isMilkdown=${isMilkdown}, selectionLen=${selectionPreview.length}, cursorContextLen=${cursorContext.length}, activeFile=${activeFile}`);

		const messageCount = messages.length;

		const openTabs = vscode.window.tabGroups.all
			.flatMap(group => group.tabs)
			.map(tab => tab.label);

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

		const WORKER_BASE_PROMPT = `You are a professional coding assistant and technical writer.
The Manager has already collected the necessary context for you.

[Your Goal]
Answer the user's request based STRICTLY on the provided [Context Info].

[Rules]
- If the Manager provided a file content, use it to answer implementation questions.
- If the Manager provided selection, focus your answer on that snippet.
- Be concise, accurate, and helpful.
`;

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
