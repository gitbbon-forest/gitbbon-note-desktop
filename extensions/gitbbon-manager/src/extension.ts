/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Gitbbon Manager extension activating...');
	const projectManager = new ProjectManager();

	// Register initialize command (manual trigger)
	const initializeCommand = vscode.commands.registerCommand(
		'gitbbon.manager.initialize',
		async () => {
			await projectManager.startup();
		}
	);
	context.subscriptions.push(initializeCommand);

	// Startup logic
	// We run this slightly deferred to let VS Code settle, though 'activate' is already part of startup.
	// We don't want to block extension activation too long, so we run async.
	projectManager.startup().catch(err => {
		console.error('Startup failed:', err);
	});

	console.log('Gitbbon Manager extension activated!');
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
	console.log('Gitbbon Manager extension deactivated');
}
