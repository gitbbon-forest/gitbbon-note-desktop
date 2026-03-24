/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type ModelMessage } from 'ai';
import { AIService } from './services/aiService';
import { logService } from './services/logService';
import { ollamaService } from './services/ollamaService';

class GitbbonChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.chat';
	private _webviewView?: vscode.WebviewView;
	private aiService: AIService;
	private _pendingText?: string;

	constructor(private readonly _context: vscode.ExtensionContext) {
		this.aiService = new AIService(_context.secrets);
	}

	public getAIService(): AIService {
		return this.aiService;
	}

	private get _extensionUri(): vscode.Uri {
		return this._context.extensionUri;
	}

	/**
	 * 외부에서 텍스트를 채팅 입력창에 삽입
	 */
	public sendTextToChat(text: string): void {
		if (this._webviewView) {
			this._webviewView.webview.postMessage({
				type: 'insertText',
				text: text
			});
			// 패널 포커스
			this._webviewView.show(true);
		} else {
			// 웹뷰가 아직 준비되지 않은 경우, 대기 텍스트로 저장
			this._pendingText = text;
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext<unknown>,
		_token: vscode.CancellationToken
	): void {
		this._webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// 웹뷰에서 메시지 수신
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'chat-request') {
				await this._handleChatMessage(message.messages);
			} else if (message.type === 'chat-cancel') {
				this.aiService.cancelCurrentStream();
				webviewView.webview.postMessage({ type: 'chat-done' });
			} else if (message.type === 'select-backend') {
				await this._handleSelectBackend(webviewView);
			} else if (message.type === 'setup-ollama') {
				await setupOllama(this.aiService, webviewView);
			}
		});

		// 대기 중인 텍스트가 있으면 삽입
		if (this._pendingText) {
			setTimeout(() => {
				if (this._pendingText) {
					this.sendTextToChat(this._pendingText);
					this._pendingText = undefined;
				}
			}, 500);
		}
	}

	private async _handleSelectBackend(webviewView: vscode.WebviewView): Promise<void> {
		const current = await this.aiService.getBackend();
		const items = [
			{ label: `$(cloud) Vercel AI Gateway (API)`, description: current === 'api' ? '현재 선택됨' : '', value: 'api' as const },
			{ label: `$(server) Ollama (로컬 LLM)`, description: current === 'ollama' ? '현재 선택됨' : '', value: 'ollama' as const },
		];

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: '채팅 백엔드를 선택하세요',
			title: '백엔드 선택',
		});

		if (!picked) return;

		await this.aiService.setBackend(picked.value);
		webviewView.webview.postMessage({ type: 'backend-changed', backend: picked.value });

		if (picked.value === 'ollama') {
			await setupOllama(this.aiService, webviewView);
		}
	}

	private async _handleChatMessage(messages: ModelMessage[]): Promise<void> {
		if (!this._webviewView) {
			return;
		}

		// Check backend - Ollama doesn't need an API key
		const backend = await this.aiService.getBackend();
		if (backend !== 'ollama') {
			// Ensure AI Service is initialized (loads keys)
			await this.aiService.ensureInitialized();

			if (!this.aiService.hasApiKey()) {
				logService.warn('Missing API Key');
				this._webviewView.webview.postMessage({
					type: 'chat-error',
					message: 'API 키가 설정되지 않았습니다. Settings에서 API 키를 설정해주세요.'
				});
				this._webviewView.webview.postMessage({ type: 'chat-done' });
				return;
			}
		}

		try {
			const stream = this.aiService.streamAgentChat(messages);

			for await (const event of stream) {
				switch (event.type) {
					case 'tool-start':
					case 'tool-end':
						// 도구 진행 상황 전송
						this._webviewView.webview.postMessage({
							type: 'chat-tool-status',
							event: event
						});
						break;
					case 'text':
						// AI 응답 텍스트 전송
						this._webviewView.webview.postMessage({
							type: 'chat-chunk',
							chunk: event.content
						});
						break;
				}
			}

			this._webviewView.webview.postMessage({ type: 'chat-done' });

		} catch (error) {
			logService.error('Chat failed:', error);
			this._webviewView.webview.postMessage({
				type: 'chat-error',
				message: 'AI 응답 중 오류가 발생했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.'
			});
			this._webviewView.webview.postMessage({ type: 'chat-done' });
		}
	}

	private _getHtmlForWebview(_webview: vscode.Webview): string {
		const styleUri = _webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.css'));
		const scriptUri = _webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.js'));
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${_webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; connect-src 'self' https:; font-src ${_webview.cspSource};">
	<title>Gitbbon Chat</title>
	<link href="${styleUri}" rel="stylesheet">
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

async function setupOllama(aiService: AIService, webviewView: vscode.WebviewView): Promise<void> {
	const post = (step: string, detail: string, progress?: number) => {
		logService.info(`[gitbbon-chat][setupOllama] step=${step} ${progress !== undefined ? `progress=${progress}%` : ''} ${detail}`);
		webviewView.webview.postMessage({ type: 'ollama-status', step, detail, progress });
	};

	logService.info('[gitbbon-chat][setupOllama] starting');
	post('checking', 'Ollama 확인 중...');

	const running = await ollamaService.isRunning();
	if (!running) {
		logService.info('[gitbbon-chat][setupOllama] Ollama not running, checking install');
		const installed = await ollamaService.isInstalled();
		if (!installed) {
			post('installing', 'Ollama 설치 중...');
			try {
				await ollamaService.install();
				logService.info('[gitbbon-chat][setupOllama] install complete');
			} catch {
				post('error', 'Ollama 자동 설치에 실패했습니다.\n\n• macOS (Homebrew): brew install ollama\n• 공식 설치: https://ollama.com/download\n• 설치 후 터미널에서: ollama serve');
				return;
			}
		}
		try {
			await ollamaService.startServer();
			logService.info('[gitbbon-chat][setupOllama] server started');
		} catch {
			post('error', 'Ollama 서버를 시작하지 못했습니다. 터미널에서 "ollama serve" 를 실행해주세요.');
			return;
		}
	} else {
		logService.info('[gitbbon-chat][setupOllama] Ollama already running');
	}

	const installedModels = await ollamaService.getInstalledModels();

	let model: string;
	if (installedModels.length > 0) {
		model = installedModels[0];
		logService.info(`[gitbbon-chat][setupOllama] using existing model: ${model} (installedModels=[${installedModels.join(', ')}])`);
	} else {
		const hw = await ollamaService.detectHardware();
		model = ollamaService.selectModel(hw);
		logService.info(`[gitbbon-chat][setupOllama] no installed models, will pull: ${model}`);
		post('pulling', `모델 다운로드 중... ${model}`, 0);
		try {
			await ollamaService.pullModel(model, (pct) => {
				post('pulling', `모델 다운로드 중... ${model}`, pct);
			});
			logService.info(`[gitbbon-chat][setupOllama] pull complete: ${model}`);
		} catch {
			post('error', `모델 다운로드에 실패했습니다. 터미널에서 "ollama pull ${model}" 을 실행해주세요.`);
			return;
		}
	}

	post('ready', `준비 완료: ${model}`);
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function activate(context: vscode.ExtensionContext): void {
	logService.init();
	const provider = new GitbbonChatViewProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			GitbbonChatViewProvider.viewType,
			provider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.open', () => {
			vscode.commands.executeCommand('workbench.view.extension.gitbbon-chat-panel');
		})
	);

	// gitbbon custom: AI에게 물어보기 커맨드 - 에디터에서 선택된 텍스트를 채팅창에 삽입
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.sendText', async (arg?: string | { text: string; fileName?: string }) => {
			let text: string | undefined;
			let fileInfo = '';

			// 인자가 객체인 경우 (gitbbon-editor에서 호출)
			if (arg && typeof arg === 'object') {
				text = arg.text;
				if (arg.fileName) {
					fileInfo = arg.fileName;
				}
			} else if (typeof arg === 'string') {
				text = arg;
			}

			// 텍스트가 전달되지 않은 경우, 현재 에디터에서 선택된 텍스트 사용
			const editor = vscode.window.activeTextEditor;
			if (!text && editor && !editor.selection.isEmpty) {
				text = editor.document.getText(editor.selection);
				// 에디터에서 가져온 경우 파일명과 라인 정보 추가
				const fileName = editor.document.fileName.split('/').pop() || 'unknown';
				const startLine = editor.selection.start.line + 1;
				const endLine = editor.selection.end.line + 1;
				fileInfo = startLine === endLine
					? `${fileName}:L${startLine}`
					: `${fileName}:L${startLine}-${endLine}`;
			}

			if (text) {
				// 백틱 코드 블록으로 감싸기 (파일 정보 포함)
				const formattedText = fileInfo
					? `\`\`\`\n${text}\n— ${fileInfo}\n\`\`\`\n\n`
					: `\`\`\`\n${text}\n\`\`\`\n\n`;

				// Secondary Sidebar 열기 (gitbbon-chat 패널)
				await vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
				// 포맷된 텍스트 전송
				provider.sendTextToChat(formattedText);
			}
		})
	);

	// 백엔드 선택 커맨드
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.selectBackend', async () => {
			const webviewView = (provider as any)._webviewView as vscode.WebviewView | undefined;
			if (webviewView) {
				await (provider as any)._handleSelectBackend(webviewView);
			} else {
				vscode.window.showWarningMessage('채팅 패널을 먼저 열어주세요.');
			}
		})
	);

	// API 키 설정 커맨드
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.setApiKey', async () => {
			const aiService = provider.getAIService();
			const success = await aiService.promptForApiKey();

			if (success) {
				vscode.window.showInformationMessage('API 키가 성공적으로 저장되었습니다.');
			} else {
				vscode.window.showWarningMessage('API 키 설정이 취소되었습니다.');
			}
		})
	);

	logService.info('Activated');
}

export function deactivate(): void { }
