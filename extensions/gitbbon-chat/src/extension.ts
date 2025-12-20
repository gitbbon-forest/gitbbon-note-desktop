/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 프로젝트 루트의 .env 파일 로드
// __dirname = .../extensions/gitbbon-chat/out
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

class GitbbonChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.chat';
	private _webviewView?: vscode.WebviewView;
	private anthropic: ReturnType<typeof createAnthropic> | null = null;
	private apiKey: string | undefined;

	constructor(private readonly _extensionUri: vscode.Uri) {
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY;
		if (this.apiKey) {
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			this.anthropic = createAnthropic();
			console.log('[GitbbonChat] Initialized with Vercel AI Gateway');
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
			if (message.type === 'chat') {
				await this._handleChatMessage(message.text);
			}
		});
	}

	private async _handleChatMessage(userMessage: string): Promise<void> {
		if (!this._webviewView) {
			return;
		}

		if (!this.anthropic || !this.apiKey) {
			// API 키가 없으면 데모 응답
			this._webviewView.webview.postMessage({
				type: 'response',
				text: `데모 모드입니다. API 키를 설정하면 실제 AI 응답을 받을 수 있습니다.\n\n받은 메시지: "${userMessage}"`
			});
			return;
		}

		try {
			const modelsToTry = [
				'claude-sonnet-4-20250514',
				'claude-3-5-sonnet-20241022',
				'claude-3-opus-20240229'
			];

			for (const modelName of modelsToTry) {
				try {
					console.log(`[GitbbonChat] Trying model: ${modelName}`);

					const { text } = await generateText({
						model: this.anthropic(modelName),
						maxTokens: 1000,
						temperature: 0.7,
						prompt: userMessage,
					});

					if (text) {
						this._webviewView.webview.postMessage({
							type: 'response',
							text: text.trim()
						});
						return;
					}
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} catch (error: any) {
					console.warn(`[GitbbonChat] Failed with model ${modelName}:`, error.message);
					continue;
				}
			}

			// 모든 모델 실패
			this._webviewView.webview.postMessage({
				type: 'response',
				error: '모든 AI 모델 호출에 실패했습니다.'
			});
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			console.error('[GitbbonChat] Error:', error);
			this._webviewView.webview.postMessage({
				type: 'response',
				error: `오류가 발생했습니다: ${error.message}`
			});
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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${_webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${_webview.cspSource};">
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
