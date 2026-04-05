/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { FrontmatterParser } from './frontmatterParser';
import { getNonce } from './util';
import { logService } from './services/logService';

/**
 * Gitbbon Custom Editor Provider
 * VS Code의 CustomEditorProvider를 구현하여 .md 파일을 Milkdown으로 편집
 */
// Similar Article Interface
interface SimilarArticle {
	title: string;
	path: string;
	score: number;
}

export class GitbbonEditorProvider implements vscode.CustomTextEditorProvider {

	// 활성 webviewPanel 추적 (선택 텍스트/콘텐츠 요청을 위해)
	private static activeWebviewPanel: vscode.WebviewPanel | null = null;
	private static activeDocument: vscode.TextDocument | null = null;
	private static pendingSelectionResolve: ((value: string | null) => void) | null = null;
	private static pendingDetailResolve: ((value: any | null) => void) | null = null;

	// gitbbon custom: Issue #109 - URI → Panel 맵 (activeWebviewPanel 타이밍 문제 해결)
	private static panelByUri = new Map<string, vscode.WebviewPanel>();

	// Webview 준비 상태 추적 (WeakMap으로 패널별 상태 관리)
	private static webviewReadyMap = new WeakMap<vscode.WebviewPanel, boolean>();

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
	 * 현재 활성화된 Gitbbon Editor에서 선택된 텍스트와 문맥 가져오기
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public static async getSelectionDetail(): Promise<{ text: string; before: string; after: string } | null> {
		if (!this.activeWebviewPanel) {
			return null;
		}

		return new Promise((resolve) => {
			this.pendingDetailResolve = resolve;
			this.activeWebviewPanel!.webview.postMessage({ type: 'getSelectionDetail' });
			// 1초 타임아웃
			setTimeout(() => {
				if (this.pendingDetailResolve === resolve) {
					this.pendingDetailResolve = null;
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
	 * 현재 활성화된 Gitbbon Editor에 상태 업데이트 전송
	 */
	public static sendStatusUpdate(status: 'unsaved' | 'autoSaved' | 'committed'): void {
		if (!this.activeWebviewPanel) {
			return;
		}
		this.activeWebviewPanel.webview.postMessage({
			type: 'statusUpdate',
			status
		});

	}

	/**
	 * 현재 활성화된 Editor에 AI 수정 사항 제안 적용
	 * gitbbon custom: Issue #109 - URI로 패널을 직접 조회 (activeWebviewPanel 타이밍 문제 해결)
	 */
	public static async applySuggestions(uriString: string, changes: any[]): Promise<void> {
		const fromMap = this.panelByUri.get(uriString);
		const panel = fromMap ?? this.activeWebviewPanel;

		if (!panel) {
			throw new Error('No active Gitbbon editor panel. Please open the file in Gitbbon Editor first.');
		}

		// Webview가 준비될 때까지 대기 (최대 5초)
		let retries = 0;
		while (!this.webviewReadyMap.get(panel) && retries < 25) {
			await new Promise(resolve => setTimeout(resolve, 200));
			retries++;
		}

		if (!this.webviewReadyMap.get(panel)) {
			vscode.window.showWarningMessage('Editor is not fully loaded yet. Please try again.');
			return;
		}

		panel.webview.postMessage({
			type: 'applySuggestions',
			changes
		});
	}

	/**
	 * 현재 활성화된 Editor에 변경사항 바로 적용 (제안 없이)
	 */
	/**
	 * 현재 활성화된 Editor에 변경사항 바로 적용 (제안 없이)
	 * Extension Host에서 직접 텍스트를 수정합니다.
	 */
	public static async directApply(changes: any[]): Promise<void> {
		if (!this.activeDocument) {
			vscode.window.showErrorMessage("No active document found for direct edit.");
			throw new Error("No active document found.");
		}

		logService.info('Direct Apply started');

		const document = this.activeDocument;
		const fullText = document.getText();
		const workspaceEdit = new vscode.WorkspaceEdit();
		let hasChanges = false;

		// We need to apply changes carefully.
		// To avoid index shifting issues, we should probably sort changes or apply them one by one?
		// But WorkspaceEdit handles overlapping edits gracefully if ranges are correct based on ORIGINAL document.
		// However, if we have multiple changes, we need to find their positions in the ORIGINAL text.

		// For simplicity, let's assume changes are independent or we process them.
		// EditorTools sends { oldText, newText }.

		for (const change of changes) {
			const { oldText, newText } = change;

			if (!oldText && newText) {
				// Append case
				const lastLine = document.lineAt(document.lineCount - 1);
				const range = new vscode.Range(lastLine.range.end, lastLine.range.end);
				// Add newline if needed?
				const textToInsert = (fullText.endsWith('\n') ? '' : '\n') + newText;
				workspaceEdit.insert(document.uri, range.start, textToInsert);
				hasChanges = true;
				continue;
			}

			if (oldText) {
				const index = fullText.indexOf(oldText);
				if (index !== -1) {
					const startPos = document.positionAt(index);
					const endPos = document.positionAt(index + oldText.length);
					const range = new vscode.Range(startPos, endPos);
					workspaceEdit.replace(document.uri, range, newText || '');
					hasChanges = true;
				} else {
					logService.warn(`Could not find oldText: "${oldText.substring(0, 20)}..."`);
					// We could throw here to trigger self-correction, but let's try to apply other changes
					// Actually, throwing is better for the AI to know it failed.
					// BUT if we applied SOME changes, we shouldn't fail completely?
					// Let's rely on the AI checking the result or let it fail if CRITICAL text is missing.
					// Given the loop issue, throwing might just repeat the loop if not handled well.
					// The updated EditorTools returns content on error.
					// So throwing is GOOD.
					throw new Error(`Could not find text to replace: "${oldText.substring(0, 50)}..."`);
				}
			}
		}

		if (hasChanges) {
			const success = await vscode.workspace.applyEdit(workspaceEdit);
			if (!success) {
				throw new Error("Failed to apply WorkspaceEdit.");
			}
			logService.info('Direct Apply success');
		}
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
	 * Webview에서 상세 선택 응답 처리
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static handleDetailResponse(detail: any | null): void {
		if (this.pendingDetailResolve) {
			this.pendingDetailResolve(detail);
			this.pendingDetailResolve = null;
		}
	}



	/**
	 * 유사한 글 검색 및 업데이트
	 */
	private async updateSimilarArticles(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
		try {
			const searchExtension = vscode.extensions.getExtension('gitbbon.gitbbon-search');
			if (!searchExtension) {
				logService.info('gitbbon-search extension not found');
				return;
			}

			if (!searchExtension.isActive) {
				await searchExtension.activate();
			}

			const api = searchExtension.exports;
			if (!api || typeof api.search !== 'function') {
				logService.info('gitbbon-search API not available');
				return;
			}

			const text = document.getText();
			const parsed = FrontmatterParser.parse(text);
			const query = parsed.frontmatter.title || text.substring(0, 100).replace(/\n/g, ' ');

			if (!query) {
				return;
			}

			logService.info(`Searching for similar articles for: "${query}"`);

			// Current document's workspace folder path
			const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			const filePathPrefix = wsFolder ? wsFolder.uri.fsPath : undefined;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const results = await api.search(query, 20, { filePathPrefix }); // Increase limit for deduplication

			const currentUriStr = document.uri.toString();
			const seenUris = new Set<string>();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const uniqueResults: any[] = [];

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const r of (results as any[])) {
				const rUriStr = vscode.Uri.file(r.filePath).toString();

				if (rUriStr === currentUriStr) {
					continue;
				}
				if (seenUris.has(rUriStr)) {
					continue;
				}
				seenUris.add(rUriStr);
				uniqueResults.push(r);
				if (uniqueResults.length >= 5) {
					break;
				}
			}

			const articles = await Promise.all(
				uniqueResults.map(async (r) => {
					let title = path.basename(r.filePath);
					try {
						const uri = vscode.Uri.file(r.filePath);
						const contentUint8 = await vscode.workspace.fs.readFile(uri);
						const content = new TextDecoder().decode(contentUint8);
						const fm = FrontmatterParser.parse(content);
						if (fm.frontmatter.title) {
							title = fm.frontmatter.title;
						}
					} catch (e) {
						// Ignore file read error
					}
					return {
						title,
						path: r.filePath,
						score: r.score
					};
				})
			);

			// Sort by score desc just in case
			articles.sort((a, b) => b.score - a.score);

			webviewPanel.webview.postMessage({
				type: 'similarArticles',
				articles: articles
			});
		} catch (error) {
			logService.error('Failed to update similar articles:', error);
		}
	}

	/**
	 * gitbbon custom: 선택 텍스트 기반 비슷한 글 검색
	 */
	private async searchSimilarForSelection(
		selectedText: string,
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel
	): Promise<void> {
		try {
			const searchExtension = vscode.extensions.getExtension('gitbbon.gitbbon-search');
			if (!searchExtension) {
				logService.info('gitbbon-search extension not found (SelectionSimilar)');
				return;
			}

			if (!searchExtension.isActive) {
				await searchExtension.activate();
			}

			const api = searchExtension.exports;
			if (!api || typeof api.search !== 'function') {
				logService.info('gitbbon-search API not available (SelectionSimilar)');
				return;
			}

			// Query는 선택된 텍스트 (최대 200자)
			const query = selectedText.substring(0, 200).trim();

			if (!query || query.length < 5) {
				return;
			}

			logService.info(`Searching for: "${query.substring(0, 50)}..." (SelectionSimilar)`);

			// Current document's workspace folder path
			const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			const filePathPrefix = wsFolder ? wsFolder.uri.fsPath : undefined;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const results = await api.search(query, 15, { filePathPrefix }); // Increase limit for deduplication

			const currentUriStr = document.uri.toString();
			const seenUris = new Set<string>();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const uniqueResults: any[] = [];

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const r of (results as any[])) {
				// 최소 30% 유사도 체크
				if (r.score < 0.3) {
					continue;
				}

				const rUriStr = vscode.Uri.file(r.filePath).toString();

				if (rUriStr === currentUriStr) {
					continue;
				}
				if (seenUris.has(rUriStr)) {
					continue;
				}
				seenUris.add(rUriStr);
				uniqueResults.push(r);
				if (uniqueResults.length >= 3) {
					break;
				}
			}

			const articles = await Promise.all(
				uniqueResults.map(async (r) => {
					let title = path.basename(r.filePath);
					try {
						const uri = vscode.Uri.file(r.filePath);
						const contentUint8 = await vscode.workspace.fs.readFile(uri);
						const content = new TextDecoder().decode(contentUint8);
						const fm = FrontmatterParser.parse(content);
						if (fm.frontmatter.title) {
							title = fm.frontmatter.title;
						}
					} catch (e) {
						// Ignore file read error
					}
					return {
						title,
						path: r.filePath,
						score: r.score
					};
				})
			);

			// Sort by score desc
			articles.sort((a, b) => b.score - a.score);

			logService.info(`Found ${articles.length} similar articles (SelectionSimilar)`);

			webviewPanel.webview.postMessage({
				type: 'selectionSimilarArticles',
				articles: articles
			});
		} catch (error) {
			logService.error('Failed to search similar articles (SelectionSimilar):', error);
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
		// Non-markdown files should not be opened with Gitbbon Editor
		const isMarkdown = document.uri.scheme === 'untitled' || document.uri.fsPath.toLowerCase().endsWith('.md');
		if (!isMarkdown) {
			webviewPanel.dispose();
			await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
			return;
		}

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

		// 초기 준비 상태 false
		GitbbonEditorProvider.webviewReadyMap.set(webviewPanel, false);

		// 활성 패널/문서 추적 (선택 텍스트/콘텐츠 요청을 위해)
		GitbbonEditorProvider.activeWebviewPanel = webviewPanel;
		GitbbonEditorProvider.activeDocument = document;

		// gitbbon custom: Issue #109 - URI → Panel 맵 등록
		GitbbonEditorProvider.panelByUri.set(document.uri.toString(), webviewPanel);

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

		// [Gitbbon] YAML frontmatter의 title이 있으면 탭 제목으로 설정
		if (frontmatter.title && typeof frontmatter.title === 'string') {
			webviewPanel.title = frontmatter.title;
		}

		// Check for pending auto-save (Draft)
		let hasDraft = false;
		try {
			hasDraft = await vscode.commands.executeCommand('gitbbon.manager.hasPendingAutoSave') as boolean;
		} catch (e) {
			logService.warn('Failed to check pending auto-save:', e);
		}


		// Webview로 초기 데이터 전송
		webviewPanel.webview.postMessage({
			type: 'init',
			frontmatter,
			content,
			initialStatus: hasDraft ? 'unsaved' : 'committed'
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
				// Untitled 문서는 자동 저장하지 않음 (저장 대화상자 방지)
				if (document.isUntitled) {
					return;
				}
				try {
					await document.save();
					// Auto save 로그 제거 (너무 빈번함)
				} catch (error) {
					logService.error('Auto save failed:', error);
				}
			}, AUTO_SAVE_DELAY_MS);

			// 2. Auto Commit Timer Reset (MVP: 3s fixed)
			if (autoCommitTimer) {
				clearTimeout(autoCommitTimer);
			}

			// MVP: 복잡한 로직 대신 3초 고정 디바운스 사용
			const delay = 500;

			autoCommitTimer = setTimeout(async () => {
				// Untitled 문서는 자동 커밋하지 않음
				if (document.isUntitled) {
					return;
				}
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
						// Auto Saved 상태에서는 플로팅 위젯을 업데이트하지 않음
						// (사용자 요청: "auto saved는 버튼에 상태를 표시할 필요 없음")

					}
				} catch (error) {
					logService.error('Auto commit failed:', error);
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
						// gitbbon custom: 저장 후 실제 문서 내용으로 업데이트 (메타데이터 포함)
						// 아직 저장 전이므로 임시로 fullText 저장

						isWebviewUpdating = true;
						try {
							await this.updateDocument(document, message.frontmatter, message.content);
							// 저장 후 실제 문서 내용 (메타데이터 포함)으로 업데이트
							lastWebviewText = document.getText();
						} finally {
							isWebviewUpdating = false;
						}
						// 문서 업데이트 후 타이머 리셋 (Auto Save & Auto Commit)
						resetTimers();
						// 플로팅 위젯 업데이트는 saveStatusChanged 핸들러에서 처리
						break;
					case 'ready':
						// Webview 준비 완료 시 초기 데이터 재전송 및 상태 업데이트
						GitbbonEditorProvider.webviewReadyMap.set(webviewPanel, true);
						logService.info('Webview ready');

						const initialText = document.getText();
						lastWebviewText = initialText;
						const { frontmatter: initFm, content: initContent } = FrontmatterParser.parse(initialText);
						// Check for pending auto-save (Draft)
						let hasDraftReady = false;
						try {
							hasDraftReady = await vscode.commands.executeCommand('gitbbon.manager.hasPendingAutoSave') as boolean;
						} catch (e) {
							logService.warn('Failed to check pending auto-save (ready):', e);
						}


						webviewPanel.webview.postMessage({
							type: 'init',
							frontmatter: initFm,
							content: initContent,
							initialStatus: hasDraftReady ? 'unsaved' : 'committed'
						});

						// Update similar articles
						this.updateSimilarArticles(document, webviewPanel);
						break;
					case 'log':
						if (message.level === 'error') {
							logService.error(message.message, ...(message.args || []));
						} else if (message.level === 'warn') {
							logService.warn(message.message, ...(message.args || []));
						} else {
							logService.info(message.message, ...(message.args || []));
						}
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
								// 플로팅 위젯 업데이트는 saveStatusChanged 핸들러에서 처리

								// Update similar articles (content might have changed significantly)
								this.updateSimilarArticles(document, webviewPanel);
							}
						} catch (error) {
							logService.error('Really Final failed:', error);
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
					// [New] gitbbon-chat에서 요청하는 상세 선택 응답
					case 'selectionDetailResponse':
						GitbbonEditorProvider.handleDetailResponse(message.detail || null);
						break;
					// [New] Webview에서 saveStatus 변경 알림
					case 'saveStatusChanged':
						if (message.status === 'unsaved') {
							// gitbbon custom: 버튼 텍스트 변경 (Issue #59): Save → Commit
							// Commit 버튼 진하게 표시
							vscode.commands.executeCommand('_gitbbon.upsertFloatingWidget', {
								id: 'gitbbon-main',
								type: 'button',
								// gitbbon custom: 아이콘 제거, label lowercase 변경 (Issue #59 추가 요구사항)
								label: 'Commit',
								tooltip: 'Unsaved changes - click to commit',
								command: 'gitbbon.manager.reallyFinal',
								priority: 10,
								dimmed: false
							});
						} else if (message.status === 'committed') {
							// gitbbon custom: 버튼 텍스트 변경 (Issue #59): Saved → Committed
							// Committed 버튼 흐리게 표시
							vscode.commands.executeCommand('_gitbbon.upsertFloatingWidget', {
								id: 'gitbbon-main',
								type: 'button',
								// gitbbon custom: 아이콘 제거, label lowercase 변경 (Issue #59 추가 요구사항)
								label: 'Committed',
								icon: '',  // gitbbon custom: 로딩 아이콘 클리어 (Issue #59 - 커밋 후 스피너 미제거 버그)
								tooltip: 'All changes committed',
								priority: 10,
								dimmed: true
							});
						}
						// autoSaved 상태에서는 위젯 상태를 변경하지 않음
						break;
					case 'openSimilarArticle':
						if (message.path) {
							const uri = vscode.Uri.file(message.path);
							vscode.commands.executeCommand('vscode.open', uri);
						}
						break;
					case 'searchSimilarForSelection':
						if (message.text) {
							this.searchSimilarForSelection(message.text, document, webviewPanel);
						}
						break;
					case 'requestRelativeLink':
						if (message.path) {
							const targetPath = message.path;
							const currentPath = document.uri.fsPath;
							const currentDir = path.dirname(currentPath);
							let relativePath = path.relative(currentDir, targetPath);
							// Add relative prefix if needed (e.g. "foo.md" -> "./foo.md" might be preferred but standard relative path is fine)
							// VS Code/Markdown usually works fine with "foo.md" if in same dir.
							// But to be safe and explicit, standard path.relative is good.
							// Replace backslashes for Windows
							relativePath = relativePath.split(path.sep).join('/');

							webviewPanel.webview.postMessage({
								type: 'insertLink',
								path: relativePath
							});
						}
						break;
					case 'openLink':
						if (message.href) {
							// Check if it's an external link or relative path
							const href = message.href;
							if (href.startsWith('http://') || href.startsWith('https://')) {
								vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(href));
							} else {
								// Relative path logic
								const currentDir = path.dirname(document.uri.fsPath);
								const targetPath = path.resolve(currentDir, href);
								vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
							}
						}
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
			// gitbbon custom: Issue #109 - 패널 닫힐 때 맵에서 제거
			GitbbonEditorProvider.panelByUri.delete(document.uri.toString());
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
		// 현재 문서에서 메타데이터 추출 (보존을 위해)
		const currentText = document.getText();
		const { metadata } = FrontmatterParser.parse(currentText);

		// 메타데이터를 포함하여 전체 텍스트 생성
		const fullText = FrontmatterParser.stringify(frontmatter, content, metadata);

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
