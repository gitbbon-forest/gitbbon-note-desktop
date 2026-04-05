/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import 'source-map-support/register';
import * as vscode from 'vscode';
import { GitbbonEditorProvider } from './editorProvider';
import { logService } from './services/logService';

/**
 * Extension activation
 * Gitbbon Editor extension의 진입점
 */
export function activate(context: vscode.ExtensionContext) {
	logService.init();
	// Custom Editor Provider 등록
	const provider = new GitbbonEditorProvider(context);
	const registration = vscode.window.registerCustomEditorProvider(
		'gitbbon.editor',
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
				enableFindWidget: true
			},
			supportsMultipleEditorsPerDocument: false
		}
	);

	context.subscriptions.push(registration);

	// Command: Open with Gitbbon Editor
	const openEditorCommand = vscode.commands.registerCommand(
		'gitbbon.editor.openEditor',
		async (uri?: vscode.Uri) => {
			if (!uri) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					uri = editor.document.uri;
				}
			}

			if (uri) {
				// Only open .md files (and untitled) with Gitbbon Editor
				const isMarkdown = uri.scheme === 'untitled' || uri.fsPath.toLowerCase().endsWith('.md');
				if (!isMarkdown) {
					vscode.window.showWarningMessage('Gitbbon Editor only supports Markdown (.md) files.');
					await vscode.commands.executeCommand('vscode.open', uri);
					return;
				}
				await vscode.commands.executeCommand('vscode.openWith', uri, 'gitbbon.editor');
			}
		}
	);

	context.subscriptions.push(openEditorCommand);

	// Command: Get selection from Gitbbon Editor (for gitbbon-chat)
	const getSelectionCommand = vscode.commands.registerCommand(
		'gitbbon.editor.getSelection',
		async () => {
			return await GitbbonEditorProvider.getSelection();
		}
	);
	context.subscriptions.push(getSelectionCommand);

	// Command: Get content from Gitbbon Editor (for gitbbon-chat)
	const getContentCommand = vscode.commands.registerCommand(
		'gitbbon.editor.getContent',
		() => {
			return GitbbonEditorProvider.getContent();
		}
	);
	context.subscriptions.push(getContentCommand);

	// Command: Get selection detail from Gitbbon Editor (for gitbbon-chat)
	const getSelectionDetailCommand = vscode.commands.registerCommand(
		'gitbbon.editor.getSelectionDetail',
		async () => {
			return await GitbbonEditorProvider.getSelectionDetail();
		}
	);
	context.subscriptions.push(getSelectionDetailCommand);

	// Command: Get cursor context from Gitbbon Editor (for gitbbon-chat)
	const getCursorContextCommand = vscode.commands.registerCommand(
		'gitbbon.editor.getCursorContext',
		async () => {
			return await GitbbonEditorProvider.getCursorContext();
		}
	);
	context.subscriptions.push(getCursorContextCommand);

	// Command: Apply suggestions to Gitbbon Editor (for gitbbon-chat)
	const applySuggestionsCommand = vscode.commands.registerCommand(
		'gitbbon.editor.applySuggestions',
		// gitbbon custom: Issue #109 - URI 인자 추가 (URI→Panel 맵 조회용)
		async (uriString: string, changes: any[]) => {
			await GitbbonEditorProvider.applySuggestions(uriString, changes);
		}
	);
	context.subscriptions.push(applySuggestionsCommand);

	// Command: Apply direct edits to Gitbbon Editor (for gitbbon-chat)
	const directApplyCommand = vscode.commands.registerCommand(
		'gitbbon.editor.directApply',
		async (changes: any[]) => {
			await GitbbonEditorProvider.directApply(changes);
		}
	);
	context.subscriptions.push(directApplyCommand);

	// Command: Send status update to Gitbbon Editor (for gitbbon-manager)
	const sendStatusUpdateCommand = vscode.commands.registerCommand(
		'gitbbon.editor.sendStatusUpdate',
		(status: 'unsaved' | 'autoSaved' | 'committed') => {
			GitbbonEditorProvider.sendStatusUpdate(status);
		}
	);
	context.subscriptions.push(sendStatusUpdateCommand);

	logService.info('Activated');
}

/**
 * Extension deactivation
 */
export function deactivate() {
	logService.info('Deactivated');
}
