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

		// 1. Authentication Check
		const isAuthenticated = await this.githubService.ensureAuthenticated(silent);
		if (!isAuthenticated) {
			if (silent) {
				console.log('[GitHubSyncManager] Not authenticated in silent mode. Skipping sync.');
				return;
			} else {
				vscode.window.showErrorMessage('GitHub Authentication required to sync.');
				return;
			}
		}

		try {
			// Optimization: Fetch all remote repositories once
			console.log('[GitHubSyncManager] Fetching remote repositories...');
			const remoteRepos = await this.githubService.listRepositories();
			const remoteRepoMap = new Map(remoteRepos.map(r => [r.name, r]));
			console.log(`[GitHubSyncManager] Fetched ${remoteRepos.length} repositories`);

			// 2. Up Sync (Local -> Remote)
			console.log('[GitHubSyncManager] Starting Up Sync...');
			await this.syncUp(remoteRepoMap);

			// 3. Down Sync (Discovery)
			console.log('[GitHubSyncManager] Starting Down Sync...');
			// Note: remoteRepos might be slightly stale if syncUp created new repos.
			// However, this is safe because syncDown only looks for remote repos that happen to be MISSING locally.
			// Any repo created in syncUp would already exist locally, so syncDown would skip it anyway.
			await this.syncDown(remoteRepos);

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

	private async syncUp(remoteRepoMap: Map<string, any>): Promise<void> {
		const projects = await this.projectManager.getProjects();
		const localConfig = await this.projectManager.readLocalConfig();

		for (const project of projects) {
			const projectLocalData = localConfig.projects[path.basename(project.path)];
			const config: ProjectConfig = {
				title: project.name, // Project.name from projectManager comes from .gitbbon.json title or folder name
				name: path.basename(project.path), // Identifier
				path: project.path,
				syncedAt: projectLocalData?.syncedAt ?? undefined,
				modifiedAt: projectLocalData?.lastModified ?? undefined
			};

			console.log(`[GitHubSyncManager] Syncing project: ${config.name}`);
			try {
				const remoteRepo = remoteRepoMap.get(config.name) || null;
				await this.syncEngine.syncProject(config, remoteRepo);
			} catch (e) {
				console.error(`[GitHubSyncManager] Failed to sync project ${config.name}:`, e);
			}
		}
	}

	private async syncDown(remoteRepos: any[]): Promise<void> {
		const localProjects = await this.projectManager.getProjects();

		for (const repo of remoteRepos) {
			// Check if exists locally
			const exists = localProjects.some(p => {
				return path.basename(p.path) === repo.name;
			});
			if (!exists) {
				console.log(`[GitHubSyncManager] Found new remote repo: ${repo.name}`);

				// Target path: ~/Documents/Gitbbon_Notes/{repo.name}
				const documentsPath = path.join(fs.realpathSync(require('os').homedir()), 'Documents', 'Gitbbon_Notes');
				const targetPath = path.join(documentsPath, repo.name);

				// Prevent sync loop: if directory exists and is not empty, skip download
				if (fs.existsSync(targetPath)) {
					try {
						const files = await fs.promises.readdir(targetPath);
						if (files.length > 0) {
							console.warn(`[GitHubSyncManager] Skipped downloading ${repo.name}: Directory exists and is not empty.`);
							continue;
						}
					} catch (e) {
						console.warn(`[GitHubSyncManager] Failed to check directory ${targetPath}:`, e);
						continue; // skip on error too to be safe
					}
				}

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
		return this.githubService.deleteRepository(repoName);
	}
}
