/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { GitGraphViewProvider } from './gitGraphViewProvider';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Gitbbon Manager extension activating...');
	const projectManager = new ProjectManager();

	// Register Git Graph View Provider
	const gitGraphProvider = new GitGraphViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(GitGraphViewProvider.viewType, gitGraphProvider)
	);

	// Register initialize command (manual trigger)
	const initializeCommand = vscode.commands.registerCommand(
		'gitbbon.manager.initialize',
		async () => {
			await projectManager.startup();
		}
	);
	context.subscriptions.push(initializeCommand);

	// Register autoCommit command
	const autoCommitCommand = vscode.commands.registerCommand(
		'gitbbon.manager.autoCommit',
		async () => {
			const result = await projectManager.autoCommit();
			console.log('Auto Commit Result:', result);
			return result;
		}
	);
	context.subscriptions.push(autoCommitCommand);

	// Register reallyFinal command
	const reallyFinalCommand = vscode.commands.registerCommand(
		'gitbbon.manager.reallyFinal',
		async () => {
			const result = await projectManager.reallyFinalCommit();
			console.log('Really Final Result:', result);
			return result;
		}
	);
	context.subscriptions.push(reallyFinalCommand);

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
