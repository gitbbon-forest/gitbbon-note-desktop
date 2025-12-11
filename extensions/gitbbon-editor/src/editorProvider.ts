/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FrontmatterParser } from './frontmatterParser';
import { getNonce } from './util';

/**
 * Gitbbon Custom Editor Provider
 * VS Code의 CustomEditorProvider를 구현하여 .md 파일을 Milkdown으로 편집
 */
export class GitbbonEditorProvider implements vscode.CustomTextEditorProvider {

	constructor(private readonly context: vscode.ExtensionContext) { }

	/**
	 * Custom Editor 생성 시 호출
	 */
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Webview 옵션 설정
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
				vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
			]
		};

		// Webview HTML 설정
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// 문서 내용 파싱
		const { frontmatter, content } = FrontmatterParser.parse(document.getText());

		// Webview로 초기 데이터 전송
		webviewPanel.webview.postMessage({
			type: 'init',
			frontmatter,
			content
		});

		// Webview에서 메시지 수신
		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'update':
						await this.updateDocument(document, message.frontmatter, message.content);
						break;
					case 'ready':
						// Webview 준비 완료 시 초기 데이터 재전송
						webviewPanel.webview.postMessage({
							type: 'init',
							frontmatter,
							content
						});
						break;
				}
			}
		);

		// 문서 변경 감지 (외부에서 변경된 경우)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				const { frontmatter, content } = FrontmatterParser.parse(e.document.getText());
				webviewPanel.webview.postMessage({
					type: 'update',
					frontmatter,
					content
				});
			}
		});

		// Cleanup
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});
	}

	/**
	 * 문서 업데이트
	 */
	private async updateDocument(
		document: vscode.TextDocument,
		frontmatter: Record<string, any>,
		content: string
	): Promise<void> {
		const edit = new vscode.WorkspaceEdit();
		const fullText = FrontmatterParser.stringify(frontmatter, content);

		// 전체 문서 교체
		edit.replace(
			document.uri,
			new vscode.Range(0, 0, document.lineCount, 0),
			fullText
		);

		await vscode.workspace.applyEdit(edit);
	}

	/**
	 * Webview HTML 생성
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js')
		);

		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
		);
		const mainStyleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.css')
		);

		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet">
	<link href="${mainStyleUri}" rel="stylesheet">
	<title>Gitbbon Editor</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
