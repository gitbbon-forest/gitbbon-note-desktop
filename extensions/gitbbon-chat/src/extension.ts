/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { type CoreMessage } from 'ai';
import { AIService } from './services/aiService';

class GitbbonChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.chat';
	private _webviewView?: vscode.WebviewView;
	private aiService: AIService;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this.aiService = new AIService();
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
	}

	private async _handleChatMessage(messages: CoreMessage[]): Promise<void> {
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
			let chunkCount = 0;
			const stream = this.aiService.streamChat(messages);

			for await (const textPart of stream) {
				chunkCount++;
				console.log(`[GitbbonChat] Sending chunk #${chunkCount}`);
				this._webviewView.webview.postMessage({
					type: 'chat-chunk',
					chunk: textPart
				});
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

	console.log('Gitbbon Chat extension is now active');
}

export function deactivate(): void { }
