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
				vscode.window.showErrorMessage('GitHub 로그인 실패: 동기화를 위해 로그인이 필요합니다.');
			} else {
				console.log(`[GitHubSyncManager] ⚠️ Authentication failed in silent mode (expected):`, e);
			}
		}
	}

	/**
	 * Up Sync: Sync local projects to GitHub
	 */
	private async syncUp(): Promise<void> {
		const manifest = await this.projectManager.getManifest();
		if (!manifest) return;

		for (const project of manifest.projects) {
			const cwd = project.path;
			if (!fs.existsSync(cwd)) continue;

			try {
				const hasRemote = await this.projectManager.hasRemote(cwd);

				if (hasRemote) {
					// Case 1: Remote exists -> Simple Pull & Push
					await this.handleExistingRemote(cwd, project.name);
				} else {
					// Case 2: No Remote -> Initialize Remote (Check Conflict, Create, Link)
					await this.handleNoRemote(cwd, project);
				}
			} catch (e) {
				console.error(`[GitHubSyncManager] Failed to sync project ${project.name}:`, e);
				vscode.window.showErrorMessage(`"${project.name}" 동기화 실패: ${e}`);
			}
		}
	}

	/**
	 * Handle existing remote: Pull and Push
	 */
	private async handleExistingRemote(cwd: string, projectName: string): Promise<void> {
		console.log(`[GitHubSyncManager] Syncing existing remote for ${projectName}`);

		// 1. Pull
		try {
			// Using git pull (fetching and merging)
			// If conflict occurs, it will throw an error and we notify the user.
			await this.execGit(['pull', 'origin', 'main'], cwd); // Assuming main branch
			// Also push refs/heads/* if needed, but simple pull/push usually targets current branch
		} catch (e: any) {
			if (e.message && e.message.includes('CONFLICT')) {
				vscode.window.showWarningMessage(`"${projectName}"에서 병합 충돌이 발생했습니다. 수동으로 해결해 주세요.`);
				return; // Stop push if pull failed
			}
			// Other errors (e.g. up to date, unrelated histories allowed?)
			// Continue to push if it's just "up to date" or minor fetch issue?
			// Ideally we want to be safe.
			console.warn(`[GitHubSyncManager] Pull issue (could be fine if no remote changes):`, e);
		}

		// 2. Push
		try {
			await this.execGit(['push', 'origin', 'main'], cwd);
			console.log(`[GitHubSyncManager] Pushed ${projectName}`);
		} catch (e) {
			console.error(`[GitHubSyncManager] Push failed for ${projectName}:`, e);
			// Usually rejected if remote has changes we didn't pull.
		}
	}

	/**
	 * Handle no remote: Create and Link
	 */
	private async handleNoRemote(cwd: string, project: any): Promise<void> {
		console.log(`[GitHubSyncManager] Initializing remote for ${project.name}`);

		let targetRepoName = project.name.startsWith('gitbbon-note-') ? project.name : `gitbbon-note-${project.name}`;
		let finalRepoName = targetRepoName;

		// 1. Check if repo exists on GitHub
		const existingRepo = await this.getGitHubRepo(targetRepoName);

		if (existingRepo) {
			console.log(`[GitHubSyncManager] Repository ${targetRepoName} already exists on GitHub`);

			// 2. Check if local is "fresh" (lastModified is null/undefined)
			if (!project.lastModified) {
				console.log('[GitHubSyncManager] Local project is fresh/empty. Overwriting from remote.');
				// Strategy: Clone from remote to a temp folder, then move .git or contents?
				// Easier: Move local out of the way (backup), Clone fresh.
				// But we are in the project folder.
				// Maybe allow "git pull" with "origin" add?
				// If we add remote origin and pull, git might complain about unrelated histories or refuse if local dir not empty.
				// Since we decided on "Overwrite", we basically want the remote state.
				// Let's try: git remote add -> git fetch -> git reset --hard origin/main

				await this.execGit(['remote', 'add', 'origin', existingRepo.clone_url], cwd);
				await this.execGit(['fetch', 'origin'], cwd);
				try {
					await this.execGit(['reset', '--hard', 'origin/main'], cwd); // Force overwriting local
					console.log('[GitHubSyncManager] Overwrote local with remote content');
					// Update lastModified is tricky if we don't know when last commit was.
					// We can just leave it or set to now.
					await this.projectManager.updateLastModified(cwd);
					return;
				} catch (e) {
					console.error('Failed to reset hard:', e);
					// Fallback to name conflict handling if this fails
				}
			}

			// 3. Name Conflict -> Rename Strategy
			console.log('[GitHubSyncManager] Local content exists. Resolving name conflict.');
			let suffix = 1;
			while (true) {
				finalRepoName = `${targetRepoName}-${suffix}`;
				const check = await this.getGitHubRepo(finalRepoName);
				if (!check) break; // Found available name
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
		console.log(`[GitHubSyncManager] Remote initialized and pushed: ${finalRepoName}`);
	}

	/**
	 * Down Sync: Discovery missing repos
	 */
	private async syncDown(): Promise<void> {
		console.log('[GitHubSyncManager] Starting Down Sync (Discovery)...');

		// 1. Get all gitbbon-* repos
		const allRepos = await this.listGitbbonRepos();
		const manifest = await this.projectManager.getManifest();
		if (!manifest) return;

		for (const repo of allRepos) {
			// Check if we have this repo locally
			// We check by name matching 'repo.name'
			// Local projects usually named 'gitbbon-default', 'gitbbon-work', etc.
			// Or maybe 'default' mapped to 'gitbbon-default' remote.
			// We iterate manifest projects and check their remote URLs maybe?
			// Simpler: Check if any project name matches repo name OR if any project has this remote URL.

			// Let's assume 1:1 naming for now for simplicity of discovery.
			// Note: gitbbon-note-{name} pattern
			const exists = manifest.projects.some(p => p.name === repo.name || `gitbbon-note-${p.name}` === repo.name);

			if (!exists) {
				console.log(`[GitHubSyncManager] Found new remote repo: ${repo.name}`);

				// 2. Clone
				// Where to clone? Root path.
				// We need projectManager to expose root path or just use sensible default.
				// projectManager.rootPath is private. We can ask projectManager to "addProjectFromUrl"?
				// Or we construct path here: ~/Documents/Gitbbon_Notes/{repo.name}

				// HACK: Re-using logic or assumption about paths.
				// Ideally ProjectManager handles creation.
				// Let's assume we can calculate path.
				const documentsPath = path.join(fs.realpathSync(require('os').homedir()), 'Documents', 'Gitbbon_Notes');
				const targetPath = path.join(documentsPath, repo.name);

				if (!fs.existsSync(targetPath)) {
					console.log(`[GitHubSyncManager] Cloning ${repo.name} to ${targetPath}`);
					try {
						await this.execGit(['clone', repo.clone_url, targetPath], documentsPath); // Run in parent dir
						await this.projectManager.addProject(repo.name, targetPath);
						// update lastModified? yes.
						await this.projectManager.updateLastModified(targetPath);
						vscode.window.showInformationMessage(`새 노트 "${repo.name}"를 다운로드했습니다.`);
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
		if (!this.session) return null;
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
				const match = repos.find(r => r.name === name);
				if (match) {
					return {
						name: match.name,
						clone_url: match.clone_url,
						default_branch: match.default_branch
					};
				}
			}
			return null;
		} catch (e) {
			console.error('[GitHubSyncManager] API Error:', e);
			return null;
		}
	}

	private async listGitbbonRepos(): Promise<GitHubRepository[]> {
		if (!this.session) return [];
		try {
			const response = await this.fetch(`https://api.github.com/user/repos?per_page=100&type=owner`);
			if (response.ok) {
				const repos = await response.json() as any[];
				// Filter: gitbbon-note-* with something after the last hyphen
				// e.g. gitbbon-note-default ✓, gitbbon-note ✗
				return repos
					.filter(r => /^gitbbon-note-.+$/.test(r.name))
					.map(r => ({
						name: r.name,
						clone_url: r.clone_url,
						default_branch: r.default_branch
					}));
			}
			return [];
		} catch (e) {
			console.error('[GitHubSyncManager] API Error:', e);
			return [];
		}
	}

	private async createGitHubRepo(name: string): Promise<GitHubRepository | null> {
		if (!this.session) return null;
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
			console.error('[GitHubSyncManager] Create Failed:', await response.text());
			return null;
		} catch (e) {
			console.error('[GitHubSyncManager] Create Error:', e);
			return null;
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
}
