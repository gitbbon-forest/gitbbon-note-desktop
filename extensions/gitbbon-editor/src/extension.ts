/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitbbonEditorProvider } from './editorProvider';

/**
 * Extension activation
 * Gitbbon Editor extension의 진입점
 */
export function activate(context: vscode.ExtensionContext) {
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
		async (changes: any[]) => {
			await GitbbonEditorProvider.applySuggestions(changes);
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

	console.log('[gitbbon-editor][extension] Activated');
}

/**
 * Extension deactivation
 */
export function deactivate() {
	console.log('[gitbbon-editor][extension] Deactivated');
}
