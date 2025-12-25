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

	// Command: Get cursor context from Gitbbon Editor (for gitbbon-chat)
	const getCursorContextCommand = vscode.commands.registerCommand(
		'gitbbon.editor.getCursorContext',
		async () => {
			return await GitbbonEditorProvider.getCursorContext();
		}
	);
	context.subscriptions.push(getCursorContextCommand);

	console.log('Gitbbon Editor extension activated!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
	console.log('Gitbbon Editor extension deactivated');
}
