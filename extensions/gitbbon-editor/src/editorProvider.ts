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

	// 활성 webviewPanel 추적 (선택 텍스트/콘텐츠 요청을 위해)
	private static activeWebviewPanel: vscode.WebviewPanel | null = null;
	private static activeDocument: vscode.TextDocument | null = null;
	private static pendingSelectionResolve: ((value: string | null) => void) | null = null;

	constructor(private readonly context: vscode.ExtensionContext) { }

	/**
	 * 현재 활성화된 Gitbbon Editor에서 선택된 텍스트 가져오기
	 */
	public static async getSelection(): Promise<string | null> {
		if (!this.activeWebviewPanel) {
			return null;
		}

		return new Promise((resolve) => {
			this.pendingSelectionResolve = resolve;
			this.activeWebviewPanel!.webview.postMessage({ type: 'getSelection' });
			// 1초 타임아웃
			setTimeout(() => {
				if (this.pendingSelectionResolve === resolve) {
					this.pendingSelectionResolve = null;
					resolve(null);
				}
			}, 1000);
		});
	}

	/**
	 * 현재 활성화된 Gitbbon Editor에서 커서 주변 문맥 가져오기
	 */
	public static async getCursorContext(): Promise<string | null> {
		if (!this.activeWebviewPanel) {
			return null;
		}

		return new Promise((resolve) => {
			this.pendingSelectionResolve = resolve;
			this.activeWebviewPanel!.webview.postMessage({ type: 'getCursorContext' });
			// 1초 타임아웃
			setTimeout(() => {
				if (this.pendingSelectionResolve === resolve) {
					this.pendingSelectionResolve = null;
					resolve(null);
				}
			}, 1000);
		});
	}

	/**
	 * 현재 활성화된 Gitbbon Editor의 전체 콘텐츠 가져오기
	 */
	public static getContent(): string | null {
		if (!this.activeDocument) {
			return null;
		}
		return this.activeDocument.getText();
	}

	/**
	 * Webview에서 선택 응답 처리
	 */
	private static handleSelectionResponse(text: string | null): void {
		if (this.pendingSelectionResolve) {
			this.pendingSelectionResolve(text);
			this.pendingSelectionResolve = null;
		}
	}

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

		// 활성 패널/문서 추적 (선택 텍스트/콘텐츠 요청을 위해)
		GitbbonEditorProvider.activeWebviewPanel = webviewPanel;
		GitbbonEditorProvider.activeDocument = document;

		// 패널 활성 상태 변경 감지
		webviewPanel.onDidChangeViewState((e) => {
			if (e.webviewPanel.active) {
				GitbbonEditorProvider.activeWebviewPanel = webviewPanel;
				GitbbonEditorProvider.activeDocument = document;
			}
		});

		// 문서 내용 파싱
		const { frontmatter, content } = FrontmatterParser.parse(document.getText());
		let lastCommittedText = document.getText(); // 스마트 오토 커밋을 위한 기준 텍스트

		// Webview로 초기 데이터 전송
		webviewPanel.webview.postMessage({
			type: 'init',
			frontmatter,
			content
		});

		// =====================================================
		// 3-Layer Save System: Auto Commit Timer (3초 유휴)
		// =====================================================
		// =====================================================
		// 3-Layer Save System: Auto Save (1s) & Smart Auto Commit
		// =====================================================
		let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
		let autoCommitTimer: ReturnType<typeof setTimeout> | null = null;

		const AUTO_SAVE_DELAY_MS = 1000; // 1초 (저장은 빠르게)

		const resetTimers = () => {
			// 1. Auto Save Timer Reset
			if (autoSaveTimer) {
				clearTimeout(autoSaveTimer);
			}
			autoSaveTimer = setTimeout(async () => {
				try {
					await document.save();
					console.log('Auto save triggered (1s debounced)');
				} catch (error) {
					console.error('Auto save failed:', error);
				}
			}, AUTO_SAVE_DELAY_MS);

			// 2. Auto Commit Timer Reset (MVP: 3s fixed)
			if (autoCommitTimer) {
				clearTimeout(autoCommitTimer);
			}

			// MVP: 복잡한 로직 대신 3초 고정 디바운스 사용
			const delay = 500;

			autoCommitTimer = setTimeout(async () => {
				try {
					// 커밋 전 혹시 모르니 한번 더 저장 보장 (이미 저장되었겠지만)
					await document.save();

					// 자동 커밋 실행
					const result = await vscode.commands.executeCommand('gitbbon.manager.autoCommit') as { success: boolean; message: string } | undefined;
					if (result?.success) {
						// 커밋 성공 시 기준 텍스트 갱신
						lastCommittedText = document.getText();

						// 상태 업데이트를 webview로 전송
						webviewPanel.webview.postMessage({
							type: 'statusUpdate',
							status: 'autoSaved'
						});
						console.log(`Auto commit triggered (${delay}ms debounced):`, result.message);
					}
				} catch (error) {
					console.error('Auto commit failed:', error);
				}
			}, delay);
		};

		let isWebviewUpdating = false;

		// 마지막으로 웹뷰에서 받은 내용을 추적하여 불필요한 역업데이트 방지
		let lastWebviewText = document.getText();

		// Webview에서 메시지 수신
		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'update':
						const fullText = FrontmatterParser.stringify(message.frontmatter, message.content);
						if (fullText === lastWebviewText) {
							return; // 내용이 같으면 무시
						}
						lastWebviewText = fullText;

						isWebviewUpdating = true;
						try {
							await this.updateDocument(document, message.frontmatter, message.content);
						} finally {
							isWebviewUpdating = false;
						}
						// 문서 업데이트 후 타이머 리셋 (Auto Save & Auto Commit)
						resetTimers();
						break;
					case 'ready':
						// Webview 준비 완료 시 초기 데이터 재전송
						const initialText = document.getText();
						lastWebviewText = initialText;
						const { frontmatter: initFm, content: initContent } = FrontmatterParser.parse(initialText);
						webviewPanel.webview.postMessage({
							type: 'init',
							frontmatter: initFm,
							content: initContent
						});
						break;
					case 'reallyFinal':
						// 진짜최종 버튼 클릭 시
						try {
							// 먼저 문서 저장 보장
							await document.save();

							// 진행 중인 타이머 모두 취소
							if (autoSaveTimer) {
								clearTimeout(autoSaveTimer);
								autoSaveTimer = null;
							}
							if (autoCommitTimer) {
								clearTimeout(autoCommitTimer);
								autoCommitTimer = null;
							}

							// 진짜최종 커밋 실행
							const result = await vscode.commands.executeCommand('gitbbon.manager.reallyFinal') as { success: boolean; message: string } | undefined;
							if (result?.success) {
								// 성공하면 기준 텍스트 갱신
								lastCommittedText = document.getText();
								lastWebviewText = lastCommittedText;

								webviewPanel.webview.postMessage({
									type: 'statusUpdate',
									status: 'committed'
								});
							}
						} catch (error) {
							console.error('Really Final failed:', error);
							vscode.window.showErrorMessage(`진짜최종 실패: ${error}`);
						}
						break;
					// gitbbon custom: AI에게 물어보기 - 선택된 텍스트를 채팅으로 전송
					case 'askAI':
						if (message.text) {
							const fileName = document.fileName.split('/').pop() || 'unknown';
							await vscode.commands.executeCommand('gitbbon.chat.sendText', {
								text: message.text,
								fileName: fileName,
								// Milkdown에서는 정확한 라인 정보를 알 수 없으므로 생략
							});
						}
						break;
					// gitbbon-chat에서 요청하는 선택 텍스트 응답
					case 'selectionResponse':
						GitbbonEditorProvider.handleSelectionResponse(message.text || null);
						break;
				}
			}
		);

		// 문서 변경 감지 (외부에서 변경된 경우)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				if (isWebviewUpdating) {
					return;
				}

				const currentText = e.document.getText();
				// 웹뷰에서 전달받은 내용과 현재 문서 내용이 같으면 업데이트를 보내지 않음
				// (주로 document.save() 시 발생하는 이벤트 필터링)
				if (currentText === lastWebviewText) {
					return;
				}
				lastWebviewText = currentText;

				const { frontmatter, content } = FrontmatterParser.parse(currentText);
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
			if (autoSaveTimer) {
				clearTimeout(autoSaveTimer);
			}
			if (autoCommitTimer) {
				clearTimeout(autoCommitTimer);
			}
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
		const fullText = FrontmatterParser.stringify(frontmatter, content);

		// TextEditor를 찾아서 직접 수정 (버전 충돌 방지)
		const editors = vscode.window.visibleTextEditors.filter(
			editor => editor.document.uri.toString() === document.uri.toString()
		);

		if (editors.length > 0) {
			// TextEditor가 있으면 직접 수정
			const editor = editors[0];
			await editor.edit(editBuilder => {
				const fullRange = new vscode.Range(
					0, 0,
					document.lineCount, 0
				);
				editBuilder.replace(fullRange, fullText);
			}, {
				undoStopBefore: false,
				undoStopAfter: false
			});
		} else {
			// TextEditor가 없으면 WorkspaceEdit 사용 (fallback)
			const edit = new vscode.WorkspaceEdit();
			edit.replace(
				document.uri,
				new vscode.Range(0, 0, document.lineCount, 0),
				fullText
			);
			await vscode.workspace.applyEdit(edit);
		}
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
