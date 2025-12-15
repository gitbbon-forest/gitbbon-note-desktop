/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { GitGraphViewProvider } from './gitGraphViewProvider';
import { GitHubSyncManager } from './githubSyncManager';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Gitbbon Manager extension activating...');
	const projectManager = new ProjectManager();
	const githubSyncManager = new GitHubSyncManager(projectManager);

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

	// Register Sync Command
	const syncCommand = vscode.commands.registerCommand(
		'gitbbon.manager.sync',
		async () => {
			await githubSyncManager.sync(false); // Interactive mode
			await gitGraphProvider.refresh();
		}
	);
	context.subscriptions.push(syncCommand);

	// Status Bar Item for Sync
	const syncStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	syncStatusBarItem.text = `$(sync) Sync`;
	syncStatusBarItem.command = 'gitbbon.manager.sync';
	syncStatusBarItem.tooltip = 'GitHub와 동기화';
	syncStatusBarItem.show();
	context.subscriptions.push(syncStatusBarItem);

	// Register autoCommit command
	const autoCommitCommand = vscode.commands.registerCommand(
		'gitbbon.manager.autoCommit',
		async () => {
			const result = await projectManager.autoCommit();
			console.log('Auto Commit Result:', result);
			if (result.success) {
				await gitGraphProvider.refresh();
			}
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
			if (result.success) {
				await gitGraphProvider.refresh();
				// Trigger Sync after really final commit (Silent mode)
				console.log('[Extension] Triggering Sync after Really Final Commit (Silent)...');
				githubSyncManager.sync(true).catch(e => console.error('Post-commit sync failed:', e));
			}
			return result;
		}
	);
	context.subscriptions.push(reallyFinalCommand);

	// 30-minute Periodic Sync (Silent mode)
	const syncInterval = setInterval(() => {
		console.log('[Extension] Triggering periodic sync (30m, Silent)...');
		githubSyncManager.sync(true).catch(e => console.error('Periodic sync failed:', e));
	}, 30 * 60 * 1000); // 30 minutes
	context.subscriptions.push({ dispose: () => clearInterval(syncInterval) });


	// Startup logic
	// We run this slightly deferred to let VS Code settle, though 'activate' is already part of startup.
	// We don't want to block extension activation too long, so we run async.
	projectManager.startup().then(() => {
		// Attempt initial sync in SILENT mode.
		// If user never authenticated, this will do nothing.
		console.log('[Extension] Triggering startup sync (Silent)...');
		githubSyncManager.sync(true).catch(e => console.error('Startup sync failed:', e));
	}).catch(err => {
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
