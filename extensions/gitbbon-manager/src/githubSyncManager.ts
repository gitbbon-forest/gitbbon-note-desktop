/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectManager } from './projectManager';
import { SyncEngine } from './sync/syncEngine';
import { GitHubService } from './sync/adapters/githubService';
import { LocalProjectService } from './sync/adapters/localProjectService';
import { ProjectConfig } from './sync/interfaces';

export class GitHubSyncManager {
	private readonly projectManager: ProjectManager;
	private syncEngine: SyncEngine;
	// Expose services if needed, or keep private.
	// extension.ts calls deleteGitHubRepo which we need to implement/delegate.
	private githubService: GitHubService;
	private localService: LocalProjectService;

	constructor(projectManager: ProjectManager) {
		this.projectManager = projectManager;
		this.githubService = new GitHubService();
		this.localService = new LocalProjectService(projectManager);
		this.syncEngine = new SyncEngine(this.githubService, this.localService);
	}

	/**
	 * Main Sync Method
	 */
	public async sync(silent: boolean = false): Promise<void> {
		console.log(`\n========== [GitHubSyncManager] SYNC START (silent: ${silent}) ==========`);

		// Authentication (Verification only, services handle their own auth usually but we ensure it here)
		// GitHubService handles auth internally but we can trigger it.
		// If silent=true, we might want to avoid a prompt if not logged in.
		// GitHubService.getSession trying silent first.

		// For now, we trust services to fail if not auth.

		try {
			// 2. Up Sync (Local -> Remote)
			console.log('[GitHubSyncManager] Starting Up Sync...');
			await this.syncUp();

			// 3. Down Sync (Discovery)
			console.log('[GitHubSyncManager] Starting Down Sync...');
			await this.syncDown();

			console.log('[GitHubSyncManager] ✅ Sync completed successfully');
			if (!silent) {
				vscode.window.setStatusBarMessage('$(check) Gitbbon Sync 완', 3000);
			}
		} catch (e) {
			console.error('[GitHubSyncManager] Sync failed:', e);
			if (!silent) {
				vscode.window.showErrorMessage(`Sync failed: ${e}`);
			}
		}

		console.log(`========== [GitHubSyncManager] SYNC END ==========\n`);
	}

	private async syncUp(): Promise<void> {
		const projects = await this.projectManager.getProjects();
		const localConfig = await this.projectManager.readLocalConfig();

		for (const project of projects) {
			const projectLocalData = localConfig.projects[path.basename(project.path)];
			const config: ProjectConfig = {
				name: project.name,
				path: project.path,
				syncedAt: projectLocalData?.syncedAt ?? undefined,
				modifiedAt: projectLocalData?.lastModified ?? undefined
			};

			console.log(`[GitHubSyncManager] Syncing project: ${config.name}`);
			try {
				await this.syncEngine.syncProject(config);
			} catch (e) {
				console.error(`[GitHubSyncManager] Failed to sync project ${config.name}:`, e);
			}
		}
	}

	private async syncDown(): Promise<void> {
		const remoteRepos = await this.githubService.listRepositories();
		const localProjects = await this.projectManager.getProjects();

		for (const repo of remoteRepos) {
			// Check if exists locally
			const exists = localProjects.some(p => path.basename(p.path) === repo.name || p.name === repo.name);
			if (!exists) {
				console.log(`[GitHubSyncManager] Found new remote repo: ${repo.name}`);

				// Target path: ~/Documents/Gitbbon_Notes/{repo.name}
				const documentsPath = path.join(fs.realpathSync(require('os').homedir()), 'Documents', 'Gitbbon_Notes');
				const targetPath = path.join(documentsPath, repo.name);

				try {
					await this.syncEngine.syncRemoteRepo(repo.name, targetPath);
					vscode.window.showInformationMessage(`New note "${repo.name}" has been downloaded.`);
				} catch (e) {
					console.error(`[GitHubSyncManager] Failed to download ${repo.name}:`, e);
				}
			}
		}
	}

	// Helper for extension.ts compatibility
	public async deleteGitHubRepo(repoName: string): Promise<boolean> {
		// GitHubService doesn't have deleteRepo in interface, but we implement it in class?
		// Or we implement logic here using fetch?
		// Better to put it in GitHubService. I'll add it to GitHubService.
		// Since I cast/use logic.
		// But GitHubService.ts defined earlier did NOT have deleteRepository.
		// I need to add it to GitHubService.ts
		return (this.githubService as any).deleteRepository ? (this.githubService as any).deleteRepository(repoName) : false;
	}
}
