/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type ModelMessage } from 'ai';
import { AIService } from './services/aiService';

class GitbbonChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.chat';
	private _webviewView?: vscode.WebviewView;
	private aiService: AIService;
	private _pendingText?: string;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this.aiService = new AIService();
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
			console.log('[GitbbonChat] Received message from webview:', message.type);
			if (message.type === 'chat-request') {
				console.log('[GitbbonChat] Handling chat-request with messages:', message.messages.length);
				await this._handleChatMessage(message.messages);
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

	private async _handleChatMessage(messages: ModelMessage[]): Promise<void> {
		if (!this._webviewView) {
			return;
		}

		console.log('[GitbbonChat] _handleChatMessage called.');

		if (!this.aiService.hasApiKey()) {
			console.warn('[GitbbonChat] Missing API Key');
			this._webviewView.webview.postMessage({ type: 'chat-done' });
			this._webviewView.webview.postMessage({
				type: 'chat-chunk',
				chunk: '데모 모드입니다. .env 파일에 AI_GATEWAY_API_KEY를 설정해주세요.'
			});
			this._webviewView.webview.postMessage({ type: 'chat-done' });
			return;
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
			console.error('[GitbbonChat] Chat failed:', error);
			this._webviewView.webview.postMessage({
				type: 'chat-chunk',
				chunk: '모든 AI 모델 호출에 실패했습니다.'
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

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function activate(context: vscode.ExtensionContext): void {
	const provider = new GitbbonChatViewProvider(context.extensionUri);

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

	console.log('Gitbbon Chat extension is now active');
}

export function deactivate(): void { }
