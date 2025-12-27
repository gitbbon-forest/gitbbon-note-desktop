/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { ProjectManager } from './projectManager';

interface GitHubRepository {
	name: string;
	clone_url: string;
	default_branch: string;
}

export class GitHubSyncManager {
	private readonly projectManager: ProjectManager;
	private session: vscode.AuthenticationSession | undefined;

	constructor(projectManager: ProjectManager) {
		this.projectManager = projectManager;
	}

	/**
	 * Main Sync Method
	 * @param silent If true, sync will only proceed if already authenticated. Will not prompt for login.
	 */
	public async sync(silent: boolean = false): Promise<void> {
		console.log(`\n========== [GitHubSyncManager] SYNC START (silent: ${silent}) ==========`);

		// 1. Authentication
		await this.ensureAuthenticated(silent);

		if (!this.session) {
			if (!silent) {
				console.log('[GitHubSyncManager] ❌ Authentication failed or cancelled (interactive mode)');
			} else {
				console.log('[GitHubSyncManager] ⏭️  Not authenticated, skipping silent sync');
			}
			console.log(`========== [GitHubSyncManager] SYNC END (early return) ==========\n`);
			return;
		}

		console.log(`[GitHubSyncManager] ✅ Authenticated, proceeding with sync`);

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
		console.log(`========== [GitHubSyncManager] SYNC END (success) ==========\n`);
	}

	private async ensureAuthenticated(silent: boolean): Promise<void> {
		console.log(`[GitHubSyncManager] ensureAuthenticated called (silent: ${silent})`);

		if (this.session) {
			console.log(`[GitHubSyncManager] ✅ Session already exists: ${this.session.account.label}`);
			return;
		}

		console.log(`[GitHubSyncManager] No existing session, calling getSession (createIfNone: ${!silent})`);

		try {
			// Using 'repo' scope to create private repositories
			// createIfNone: !silent -> explicit prompt only if not silent
			this.session = await vscode.authentication.getSession('github', ['repo', 'user:email'], { createIfNone: !silent });

			if (this.session) {
				console.log(`[GitHubSyncManager] ✅ Authentication successful: ${this.session.account.label}`);
			} else {
				console.log(`[GitHubSyncManager] ⚠️ getSession returned undefined (silent: ${silent})`);
			}
		} catch (e) {
			if (!silent) {
				console.error('[GitHubSyncManager] ❌ Authentication failed:', e);
				vscode.window.showErrorMessage('GitHub login failed: Login is required for synchronization.');
			} else {
				console.log(`[GitHubSyncManager] ⚠️ Authentication failed in silent mode (expected):`, e);
			}
		}
	}

	/**
	 * Up Sync: Sync current workspace to GitHub
	 */
	private async syncUp(): Promise<void> {
		// Get current workspace folder
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			console.log('[GitHubSyncManager] No workspace folder open');
			return;
		}

		const cwd = workspaceFolder.uri.fsPath;

		// Read .gitbbon.json for project name
		let projectName = path.basename(cwd);
		try {
			const gitbbonConfigPath = path.join(cwd, '.gitbbon.json');
			if (fs.existsSync(gitbbonConfigPath)) {
				const configContent = await fs.promises.readFile(gitbbonConfigPath, 'utf-8');
				const config = JSON.parse(configContent);
				if (config.name) {
					projectName = config.name;
				}
			}
		} catch (e) {
			console.warn('[GitHubSyncManager] Failed to read .gitbbon.json:', e);
		}

		console.log(`[GitHubSyncManager] Syncing current workspace: ${projectName} (${cwd})`);

		try {
			const hasRemote = await this.projectManager.hasRemote(cwd);

			if (hasRemote) {
				// Case 1: Remote exists -> Simple Pull & Push
				await this.handleExistingRemote(cwd, projectName);
			} else {
				// Case 2: No Remote -> Initialize Remote (Check Conflict, Create, Link)
				const project = { name: projectName, path: cwd };
				await this.handleNoRemote(cwd, project);
			}
		} catch (e) {
			console.error(`[GitHubSyncManager] Failed to sync project ${projectName}:`, e);
			vscode.window.showErrorMessage(`Sync failed for "${projectName}": ${e}`);
		}
	}

	/**
	 * Handle existing remote: Pull and Push
	 * Provides choice if remote is deleted.
	 */
	private async handleExistingRemote(cwd: string, projectName: string): Promise<void> {
		console.log(`[GitHubSyncManager] Syncing existing remote for ${projectName}`);

		// 0. Verify remote existence first
		const remoteUrl = await this.projectManager.getRemoteUrl(cwd);
		if (remoteUrl) {
			// Extract repository name from URL (e.g., https://github.com/user/gitbbon-note-xxx.git)
			const repoName = remoteUrl.split('/').pop()?.replace('.git', '');
			if (repoName) {
				const exists = await this.getGitHubRepo(repoName);
				if (!exists) {
					// Remote repository has been deleted - user choice needed
					console.log(`[GitHubSyncManager] Remote repo ${repoName} not found (404)`);
					await this.handleRemoteDeleted(cwd, projectName, repoName);
					return;
				}
			}
		}

		// 1. Pull
		try {
			// Using git pull (fetching and merging)
			// If conflict occurs, it will throw an error and we notify the user.
			await this.execGit(['pull', 'origin', 'main'], cwd); // Assuming main branch
		} catch (e: any) {
			if (e.message && e.message.includes('CONFLICT')) {
				vscode.window.showWarningMessage(`Merge conflict occurred in "${projectName}". Please resolve it manually.`);
				return; // Stop push if pull failed
			}
			// Other errors (e.g. up to date, unrelated histories allowed?)
			console.warn(`[GitHubSyncManager] Pull issue (could be fine if no remote changes):`, e);
		}

		// 2. Push
		try {
			await this.execGit(['push', 'origin', 'main'], cwd);
			// Update syncedAt after successful push
			const remoteUrl = await this.projectManager.getRemoteUrl(cwd);
			if (remoteUrl) {
				const repoName = remoteUrl.split('/').pop()?.replace('.git', '');
				if (repoName) {
					await this.projectManager.updateSyncedAt(repoName);
				}
			}
			console.log(`[GitHubSyncManager] Pushed ${projectName}`);
		} catch (e) {
			console.error(`[GitHubSyncManager] Push failed for ${projectName}:`, e);
			// Usually rejected if remote has changes we didn't pull.
		}
	}

	/**
	 * Handle cases where the remote repository was deleted.
	 * Automatic processing based on syncedAt:
	 * - syncedAt exists: Remote was deleted intentionally → Move local to trash
	 * - syncedAt doesn't exist: Never synced → Create new remote
	 */
	private async handleRemoteDeleted(cwd: string, projectName: string, deletedRepoName: string): Promise<void> {
		console.log(`[GitHubSyncManager] Remote repository ${deletedRepoName} not found (404)`);

		// Check if this project was ever synced
		const syncedAt = await this.projectManager.getSyncedAt(deletedRepoName);

		if (syncedAt) {
			// Previously synced → Remote was intentionally deleted → Move local to trash
			console.log(`[GitHubSyncManager] Project was synced before (${syncedAt}). Moving to trash.`);

			try {
				// Dynamic import for trash (ESM module)
				const trash = await import('trash');
				await trash.default(cwd);

				// Remove from local config
				await this.projectManager.removeFromLocalConfig(deletedRepoName);

				vscode.window.showInformationMessage(`"${projectName}" was removed from cloud. Moved to trash.`);

				// Handle workspace: close or create new project
				const gitbbonNotesPath = path.join(require('os').homedir(), 'Documents', 'Gitbbon_Notes');
				let hasOtherProjects = false;
				try {
					const entries = await fs.promises.readdir(gitbbonNotesPath, { withFileTypes: true });
					hasOtherProjects = entries.some(entry =>
						entry.isDirectory() &&
						entry.name !== path.basename(cwd) &&
						fs.existsSync(path.join(gitbbonNotesPath, entry.name, '.git'))
					);
				} catch { /* ignore */ }

				if (hasOtherProjects) {
					await vscode.commands.executeCommand('workbench.action.closeFolder');
				} else {
					// Create new default project
					const newProjectPath = path.join(gitbbonNotesPath, 'gitbbon-note-default');
					if (!fs.existsSync(newProjectPath)) {
						await fs.promises.mkdir(newProjectPath, { recursive: true });
					}
					const gitbbonConfig = { name: 'default' };
					await fs.promises.writeFile(
						path.join(newProjectPath, '.gitbbon.json'),
						JSON.stringify(gitbbonConfig, null, 2)
					);
					await this.execGit(['init'], newProjectPath);
					await this.execGit(['checkout', '-b', 'main'], newProjectPath);
					await fs.promises.writeFile(
						path.join(newProjectPath, 'README.md'),
						'# default\n\nGitbbon Notes\n'
					);
					await this.execGit(['add', '.'], newProjectPath);
					await this.execGit(['commit', '-m', 'Initial commit'], newProjectPath);
					await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(newProjectPath));
				}
			} catch (e) {
				console.error('[GitHubSyncManager] Failed to move to trash:', e);
				vscode.window.showErrorMessage(`Failed to move "${projectName}" to trash.`);
			}
		} else {
			// Never synced → Create new remote
			console.log(`[GitHubSyncManager] Project was never synced. Creating new remote.`);

			try {
				await this.execGit(['remote', 'remove', 'origin'], cwd, { silent: true });
			} catch { /* ignore */ }

			const project = { name: projectName, path: cwd };
			await this.handleNoRemote(cwd, project);
			vscode.window.showInformationMessage(`Created new cloud storage for "${projectName}".`);
		}
	}

	/**
	 * Handle no remote: Create and Link
	 */
	private async handleNoRemote(cwd: string, project: any): Promise<void> {
		console.log(`[GitHubSyncManager] Initializing remote for ${project.name}`);

		const targetRepoName = project.name.startsWith('gitbbon-note-') ? project.name : `gitbbon-note-${project.name}`;
		let finalRepoName = targetRepoName;

		// 1. Check if repo exists on GitHub
		const existingRepo = await this.getGitHubRepo(targetRepoName);

		if (existingRepo) {
			console.log(`[GitHubSyncManager] Repository ${targetRepoName} already exists on GitHub`);

			// 2. Check if local has modifications
			const isDirty = await this.isLocalDirty(cwd);

			if (!isDirty) {
				// Local has no modifications -> Automatically overwrite from remote
				console.log('[GitHubSyncManager] Local project is fresh/empty. Overwriting from remote.');
				await this.execGit(['remote', 'add', 'origin', existingRepo.clone_url], cwd);
				await this.execGit(['fetch', 'origin'], cwd);
				try {
					await this.execGit(['reset', '--hard', 'origin/main'], cwd);
					console.log('[GitHubSyncManager] Overwrote local with remote content');
					await this.projectManager.updateLastModified(cwd);
					return;
				} catch (e) {
					console.error('Failed to reset hard:', e);
				}
			} else {
				// 3. Local has modifications -> Ask for user choice
				console.log('[GitHubSyncManager] Local has modifications. Asking user for action.');
				const userChoice = await vscode.window.showWarningMessage(
					`A remote repository with the name "${project.name}" already exists on GitHub.`,
					{ modal: true },
					'Overwrite from Remote',
					'Create with New Name',
					'Cancel'
				);

				switch (userChoice) {
					case 'Overwrite from Remote':
						try {
							await this.execGit(['remote', 'add', 'origin', existingRepo.clone_url], cwd);
							await this.execGit(['fetch', 'origin'], cwd);
							await this.execGit(['reset', '--hard', 'origin/main'], cwd);
							vscode.window.showInformationMessage(`"${project.name}" has been synchronized with remote content.`);
							await this.projectManager.updateLastModified(cwd);
							return;
						} catch (e) {
							console.error('Failed to overwrite with remote:', e);
							vscode.window.showErrorMessage('Failed to synchronize with remote content.');
						}
						break;

					case 'Create with New Name':
						// Name Conflict → Proceed with Rename Strategy (Moves to logic below)
						break;

					case 'Cancel':
					default:
						console.log(`[GitHubSyncManager] User cancelled sync for: ${project.name}`);
						return;
				}
			}

			// 3. Name Conflict -> Rename Strategy
			console.log('[GitHubSyncManager] Local content exists. Resolving name conflict.');
			let suffix = 1;
			while (true) {
				finalRepoName = `${targetRepoName}-${suffix}`;
				const check = await this.getGitHubRepo(finalRepoName);
				if (!check) { break; } // Found available name
				suffix++;
			}
			console.log(`[GitHubSyncManager] Selected new name: ${finalRepoName}`);
		}

		// 4. Create Repo (finalRepoName)
		const newRepo = await this.createGitHubRepo(finalRepoName);
		if (!newRepo) {
			throw new Error('Failed to create GitHub repository');
		}

		// 5. Link and Push
		// Remove origin just in case
		try { await this.execGit(['remote', 'remove', 'origin'], cwd, { silent: true }); } catch { }

		await this.execGit(['remote', 'add', 'origin', newRepo.clone_url], cwd);

		// 5.5. Ensure at least one commit exists (create initial commit if needed)
		try {
			await this.execGit(['rev-parse', 'HEAD'], cwd, { silent: true });
			console.log('[GitHubSyncManager] Commits exist, proceeding with push');
		} catch {
			console.log('[GitHubSyncManager] No commits found, creating initial commit');
			// Stage all files (including README.md created by projectManager)
			await this.execGit(['add', '.'], cwd);
			await this.execGit(['commit', '-m', 'Initial commit'], cwd);
			console.log('[GitHubSyncManager] ✅ Initial commit created');
		}

		// If renaming happened (gitbbon-note-default-1), we probably should keep the local folder name as is,
		// but the remote is different. That's fine.

		await this.execGit(['push', '-u', 'origin', 'main'], cwd);
		await this.projectManager.updateSyncedAt(finalRepoName);
		console.log(`[GitHubSyncManager] Remote initialized and pushed: ${finalRepoName}`);
	}

	/**
	 * Down Sync: Discovery missing repos
	 */
	private async syncDown(): Promise<void> {
		console.log('[GitHubSyncManager] Starting Down Sync (Discovery)...');

		// 1. Get all gitbbon-* repos from GitHub
		const allRepos = await this.listGitbbonRepos();
		const localProjects = await this.projectManager.getProjects();

		for (const repo of allRepos) {
			// Check if we have this repo locally by directory name or project name
			const exists = localProjects.some(p => p.name === repo.name || path.basename(p.path) === repo.name);

			if (!exists) {
				console.log(`[GitHubSyncManager] Found new remote repo: ${repo.name}`);

				// Clone to ~/Documents/Gitbbon_Notes/{repo.name}
				const documentsPath = path.join(fs.realpathSync(require('os').homedir()), 'Documents', 'Gitbbon_Notes');
				const targetPath = path.join(documentsPath, repo.name);

				if (!fs.existsSync(targetPath)) {
					console.log(`[GitHubSyncManager] Cloning ${repo.name} to ${targetPath}`);
					try {
						await this.execGit(['clone', repo.clone_url, targetPath], documentsPath);
						await this.projectManager.addProject(repo.name, targetPath);
						await this.projectManager.updateLastModified(targetPath);
						vscode.window.showInformationMessage(`New note "${repo.name}" has been downloaded.`);
					} catch (e) {
						console.error(`[GitHubSyncManager] Failed to clone ${repo.name}:`, e);
					}
				}
			}
		}
	}


	// =====================================================
	// GitHub API Helpers
	// =====================================================

	private async getGitHubRepo(name: string): Promise<GitHubRepository | null> {
		if (!this.session) {
			return null;
		}
		try {
			// GET /user/repos?type=all&per_page=100 causes heavy load if user has many repos.
			// Better: GET /repos/{owner}/{repo}
			const owner = this.session.account.label; // Username usually
			// The label might not be username, need to verify.
			// Actually session.account.label is usually the display name or username.
			// Safer to fetch fetch user info first if needed, but let's try direct search
			// Or just List all and filter.

			// Search API: GET /search/repositories?q=user:{user}+name
			const response = await this.fetch(`https://api.github.com/user/repos?per_page=100&type=owner`); // Listing owned repos
			if (response.ok) {
				const repos = await response.json() as any[];
				const match = repos.find((r: any) => r.name === name);
				if (match) {
					return {
						name: match.name,
						clone_url: match.clone_url,
						default_branch: match.default_branch
					};
				}
			}

			// Handle rate limit and auth errors
			if (response.status === 429 || response.status === 403) {
				console.warn('[GitHubSyncManager] Rate limited or permission denied');
			}

			return null;
		} catch (e) {
			console.error('[GitHubSyncManager] API Error:', e);
			return null;
		}
	}

	private async listGitbbonRepos(): Promise<GitHubRepository[]> {
		if (!this.session) {
			return [];
		}
		try {
			const response = await this.fetch(`https://api.github.com/user/repos?per_page=100&type=owner`);
			if (response.ok) {
				const repos = await response.json() as any[];
				// Filter: gitbbon-note-* with something after the last hyphen
				// e.g. gitbbon-note-default ✓, gitbbon-note ✗
				return repos
					.filter((r: any) => /^gitbbon-note-.+$/.test(r.name))
					.map((r: any) => ({
						name: r.name,
						clone_url: r.clone_url,
						default_branch: r.default_branch
					}));
			}

			// Handle rate limit and auth errors
			if (response.status === 429) {
				console.warn('[GitHubSyncManager] Rate limited during repo list');
			}
			if (response.status === 401) {
				this.session = undefined; // Force re-auth
			}

			return [];
		} catch (e) {
			console.error('[GitHubSyncManager] API Error:', e);
			return [];
		}
	}

	private async createGitHubRepo(name: string): Promise<GitHubRepository | null> {
		if (!this.session) {
			return null;
		}
		try {
			const response = await this.fetch('https://api.github.com/user/repos', {
				method: 'POST',
				body: JSON.stringify({
					name: name,
					private: true, // Default to private for notes
					description: 'Created by Gitbbon'
				})
			});

			if (response.ok || response.status === 201) {
				const repo = await response.json() as any;
				return {
					name: repo.name,
					clone_url: repo.clone_url,
					default_branch: repo.default_branch
				};
			}

			// Handle specific error codes
			if (response.status === 403) {
				const errorBody = await response.json().catch(() => ({})) as { message?: string };
				if (errorBody.message?.includes('rate limit')) {
					vscode.window.showErrorMessage('GitHub API rate limit exceeded. Please try again in a few minutes.');
				} else {
					vscode.window.showErrorMessage('Permission denied. Please check your GitHub token has "repo" scope.');
				}
				return null;
			}

			if (response.status === 401) {
				vscode.window.showErrorMessage('GitHub authentication expired. Please re-authenticate.');
				this.session = undefined; // Clear session to force re-auth
				return null;
			}

			if (response.status === 422) {
				vscode.window.showErrorMessage(`Repository "${name}" already exists or name is invalid.`);
				return null;
			}

			if (response.status === 429) {
				vscode.window.showErrorMessage('Too many requests. Please wait a moment and try again.');
				return null;
			}

			console.error('[GitHubSyncManager] Create Failed:', await response.text());
			vscode.window.showErrorMessage(`Failed to create repository: HTTP ${response.status}`);
			return null;
		} catch (e) {
			console.error('[GitHubSyncManager] Create Error:', e);
			if (e instanceof TypeError && e.message.includes('fetch')) {
				vscode.window.showErrorMessage('Network error. Please check your internet connection.');
			}
			return null;
		}
	}

	/**
	 * Delete GitHub repository
	 * @param repoName repository name (gitbbon-note-xxx format)
	 * @returns success status
	 * @note requires delete_repo scope
	 */
	public async deleteGitHubRepo(repoName: string): Promise<boolean> {
		if (!this.session) {
			console.warn('[GitHubSyncManager] Not authenticated, cannot delete repo');
			return false;
		}

		try {
			console.log(`[GitHubSyncManager] Attempting to delete GitHub repo: ${repoName}`);

			// GitHub API: DELETE /repos/{owner}/{repo}
			const response = await this.fetch(
				`https://api.github.com/repos/${this.session.account.label}/${repoName}`,
				{ method: 'DELETE' }
			);

			if (response.status === 204) {
				console.log(`[GitHubSyncManager] ✅ Deleted GitHub repo: ${repoName}`);
				return true;
			} else if (response.status === 403) {
				console.error('[GitHubSyncManager] ❌ No permission to delete repo (delete_repo scope required)');
				return false;
			} else if (response.status === 404) {
				console.warn(`[GitHubSyncManager] ⚠️ Repo not found on GitHub: ${repoName}`);
				return true; // Consider it success if already deleted
			} else {
				console.error(`[GitHubSyncManager] ❌ Failed to delete repo: ${response.status}`);
				return false;
			}
		} catch (e) {
			console.error('[GitHubSyncManager] Error deleting repo:', e);
			return false;
		}
	}

	private async fetch(url: string, options: any = {}): Promise<Response> {
		if (!this.session) throw new Error('Not authenticated');

		// Use NodeJS fetch (available in VS Code environment, or use global fetch if Node 18+)
		// Or use 'node-fetch' if installed. VS Code extensions have access to global fetch in newer versions.
		// If not, we might need https module.
		// Let's assume generic fetch is available or polyfilled.
		// Actually typical VS Code extension env might need `node-fetch`.
		// However, we can use `vscode.authentication.getSession` access token to use in headers.

		const headers = {
			'Authorization': `Bearer ${this.session.accessToken}`,
			'Accept': 'application/vnd.github.v3+json',
			'User-Agent': 'Gitbbon-Note-App',
			...options.headers
		};

		// Dynamic import or global fetch check
		return fetch(url, { ...options, headers });
	}

	// =====================================================
	// Git Helpers using dugite
	// =====================================================
	private async execGit(args: string[], cwd: string, options: { silent?: boolean } = {}): Promise<string> {
		const dugite = await import('dugite');

		const result = await dugite.exec(args, cwd);

		if (result.exitCode !== 0) {
			throw new Error(result.stderr || `Git command exited with code ${result.exitCode}`);
		}
		return result.stdout.trim();
	}

	/**
	 * Check if local repository has any modifications beyond the initial state.
	 * Returns true if:
	 * - There are uncommitted changes in working tree
	 * - There are more than 1 commit on HEAD
	 * - There are auto-save/* branches (indicating user made edits)
	 */
	private async isLocalDirty(cwd: string): Promise<boolean> {
		try {
			// 1. Check for uncommitted changes in working tree
			const status = await this.execGit(['status', '--porcelain'], cwd, { silent: true });
			if (status.trim().length > 0) {
				console.log('[GitHubSyncManager] Local is dirty: uncommitted changes found');
				return true;
			}

			// 2. Check commit count on HEAD
			try {
				const commitCountStr = await this.execGit(['rev-list', '--count', 'HEAD'], cwd, { silent: true });
				const commitCount = parseInt(commitCountStr.trim(), 10);
				console.log(`[GitHubSyncManager] Local commit count: ${commitCount}`);

				// If more than 1 commit, it's definitely modified (Initial commit is 1)
				if (commitCount > 1) {
					return true;
				}
			} catch {
				// No commits yet, continue checking
			}

			// 3. Check for auto-save/* branches (user has made edits via auto-save)
			try {
				const branches = await this.execGit(['branch', '--list', 'auto-save/*'], cwd, { silent: true });
				if (branches.trim().length > 0) {
					console.log('[GitHubSyncManager] Local is dirty: auto-save branches exist');
					return true;
				}
			} catch {
				// No branches found, that's fine
			}

			return false;
		} catch (e) {
			// If we can't determine state, assume not dirty but be careful.
			console.log('[GitHubSyncManager] Could not determine if local is dirty:', e);
			return false;
		}
	}
}
