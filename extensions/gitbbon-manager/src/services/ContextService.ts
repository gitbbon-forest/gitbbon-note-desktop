/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logService } from './logService';

/**
 * Issue #90: 에디터 활성 파일·선택 영역을 in-memory로 유지하고
 * debounce 300ms로 .gitbbon/state/context.json에 기록한다.
 *
 * (A) ExtensionAPI: exports.getContext() → gitbbon-chat이 직접 호출
 * (B) 파일 쓰기: .gitbbon/state/context.json → MCP 서버 전용
 */

export interface ContextSnapshot {
	activeFile: string;
	openFiles: string[];
	selection: {
		start: { line: number; character: number };
		end: { line: number; character: number };
		text: string;
	} | null;
	cursorContext: string | null;
	updatedAt: string;
}

export class ContextService {
	private static _snapshot: ContextSnapshot | null = null;
	private static _debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private static readonly DEBOUNCE_MS = 300;

	/**
	 * VS Code 이벤트 구독을 등록하고 초기 스냅샷을 수집한다.
	 */
	public static register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor(() => {
				logService.info('[debug:#90][manager] onDidChangeActiveTextEditor → 컨텍스트 갱신');
				ContextService._scheduleUpdate();
			})
		);

		context.subscriptions.push(
			vscode.window.onDidChangeTextEditorSelection(() => {
				logService.info('[debug:#90][manager] onDidChangeTextEditorSelection → 컨텍스트 갱신');
				ContextService._scheduleUpdate();
			})
		);

		// 초기 스냅샷 수집
		ContextService._scheduleUpdate();
		logService.info('[debug:#90][manager] ContextService 등록 완료');
	}

	/**
	 * (A) ExtensionAPI: gitbbon-chat에서 직접 호출한다.
	 */
	public static getContext(): ContextSnapshot | null {
		return ContextService._snapshot;
	}

	/**
	 * debounce 타이머를 세팅한다.
	 */
	private static _scheduleUpdate(): void {
		if (ContextService._debounceTimer) {
			clearTimeout(ContextService._debounceTimer);
		}
		ContextService._debounceTimer = setTimeout(() => {
			ContextService._debounceTimer = null;
			ContextService._update();
		}, ContextService.DEBOUNCE_MS);
	}

	/**
	 * 실제 스냅샷 수집 및 파일 쓰기.
	 */
	private static _update(): void {
		const snapshot = ContextService._collectSnapshot();
		ContextService._snapshot = snapshot;
		ContextService._writeContextFile(snapshot);
	}

	/**
	 * 현재 에디터 상태에서 스냅샷을 수집한다.
	 */
	private static _collectSnapshot(): ContextSnapshot {
		// 활성 파일
		let activeFile = 'None';
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			activeFile = vscode.workspace.asRelativePath(activeEditor.document.uri);
		} else {
			const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
			if (activeTab?.input instanceof vscode.TabInputCustom) {
				activeFile = vscode.workspace.asRelativePath(activeTab.input.uri);
			} else if (activeTab?.input instanceof vscode.TabInputText) {
				activeFile = vscode.workspace.asRelativePath(activeTab.input.uri);
			}
		}

		// 열린 탭 목록
		const openFiles = vscode.window.tabGroups.all
			.flatMap(g => g.tabs)
			.map(tab => {
				if (tab.input instanceof vscode.TabInputText) {
					return vscode.workspace.asRelativePath(tab.input.uri);
				}
				if (tab.input instanceof vscode.TabInputCustom) {
					return vscode.workspace.asRelativePath(tab.input.uri);
				}
				return tab.label;
			});

		// 선택 영역
		let selection: ContextSnapshot['selection'] = null;
		if (activeEditor && !activeEditor.selection.isEmpty) {
			const sel = activeEditor.selection;
			const text = activeEditor.document.getText(sel).slice(0, 1000);
			selection = {
				start: { line: sel.start.line, character: sel.start.character },
				end: { line: sel.end.line, character: sel.end.character },
				text,
			};
		}

		// 커서 컨텍스트 (선택 없을 때)
		let cursorContext: string | null = null;
		if (!selection && activeEditor) {
			const cursorLine = activeEditor.selection.active.line;
			const startLine = Math.max(0, cursorLine - 5);
			const endLine = Math.min(activeEditor.document.lineCount - 1, cursorLine + 5);
			const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
			cursorContext = activeEditor.document.getText(range);
		}

		return {
			activeFile,
			openFiles,
			selection,
			cursorContext,
			updatedAt: new Date().toISOString(),
		};
	}

	/**
	 * (B) .gitbbon/state/context.json에 스냅샷을 기록한다. MCP 서버 전용.
	 */
	private static _writeContextFile(snapshot: ContextSnapshot): void {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const wsRoot = workspaceFolders[0].uri.fsPath;
		const stateDir = path.join(wsRoot, '.gitbbon', 'state');
		const contextPath = path.join(stateDir, 'context.json');

		try {
			fs.mkdirSync(stateDir, { recursive: true });
			fs.writeFileSync(contextPath, JSON.stringify(snapshot, null, 2), 'utf-8');
			logService.info('[debug:#90][manager] context.json 갱신 완료', JSON.stringify({
				activeFile: snapshot.activeFile,
				hasSelection: !!snapshot.selection,
			}));
		} catch (e) {
			logService.warn('[debug:#90][manager] context.json 쓰기 실패:', e);
		}
	}
}
