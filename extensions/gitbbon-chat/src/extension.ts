/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { streamText, type CoreMessage } from 'ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 프로젝트 루트의 .env 파일 로드
// __dirname = .../extensions/gitbbon-chat/out
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

class GitbbonChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.chat';
	private _webviewView?: vscode.WebviewView;
	// private anthropic property is removed as we use string models
	private apiKey: string | undefined;

	constructor(private readonly _extensionUri: vscode.Uri) {
		// 우선순위: VERCEL_AI_GATE_API_KEY -> AI_GATEWAY_API_KEY
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY;

		if (this.apiKey) {
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			console.log('[GitbbonChat] Initialized with API Key');
		} else {
			console.warn('[GitbbonChat] No API key found. Chat will use demo mode.');
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
	}

	private async _handleChatMessage(messages: CoreMessage[]): Promise<void> {
		if (!this._webviewView) {
			return;
		}

		console.log('[GitbbonChat] _handleChatMessage called. API Key present:', !!this.apiKey);

		if (!this.apiKey) {
			console.warn('[GitbbonChat] Missing API Key');
			this._webviewView.webview.postMessage({
				type: 'chat-done',
			});
			this._webviewView.webview.postMessage({
				type: 'chat-chunk',
				chunk: '데모 모드입니다. .env 파일에 AI_GATEWAY_API_KEY를 설정해주세요.'
			});
			this._webviewView.webview.postMessage({
				type: 'chat-done',
			});
			return;
		}

		const modelsToTry = [
			'claude-sonnet-4-20250514',
			'claude-3-5-sonnet-20241022',
			'claude-3-opus-20240229'
		];

		for (const modelName of modelsToTry) {
			try {
				console.log(`[GitbbonChat] Trying model: ${modelName}`);

				// Note: Passing string model requires ai sdk to resolve it (e.g. via registry or default provider)
				// This follows the pattern in commitMessageGenerator.ts
				const result = await streamText({
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					model: modelName as any, // Cast to any to bypass typing if SDK expects object
					messages: messages,
				});

				let chunkCount = 0;
				for await (const textPart of result.textStream) {
					chunkCount++;
					// if (chunkCount % 10 === 0) console.log(`[GitbbonChat] Sending chunk #${chunkCount}`);

					console.log(`[GitbbonChat] Sending chunk #${chunkCount}`);
					this._webviewView.webview.postMessage({
						type: 'chat-chunk',
						chunk: textPart
					});
				}
				console.log(`[GitbbonChat] Stream finished with ${modelName}. Total chunks: ${chunkCount}`);

				this._webviewView.webview.postMessage({
					type: 'chat-done'
				});
				return; // Success, exit loop

			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.warn(`[GitbbonChat] Failed with model ${modelName}:`, errorMessage);
				// Continue to next model
			}
		}

		// If all failed
		console.error('[GitbbonChat] All models failed');
		this._webviewView.webview.postMessage({
			type: 'chat-chunk',
			chunk: '모든 AI 모델 호출에 실패했습니다.'
		});
		this._webviewView.webview.postMessage({
			type: 'chat-done'
		});
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
