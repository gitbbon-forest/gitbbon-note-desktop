/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IRemoteRepositoryService, RepoInfo } from '../interfaces';
import { logService } from '../../services/logService';

interface GitHubApiResponse {
	name: string;
	html_url: string;
	clone_url: string;
	updated_at: string;
	[key: string]: unknown;
}

export class GitHubService implements IRemoteRepositoryService {
	private session: vscode.AuthenticationSession | undefined;

	constructor() { }

	private async getSession(): Promise<vscode.AuthenticationSession | undefined> {
		if (this.session) {
			return this.session;
		}
		try {
			// Try silent first and ONLY silent. Prompting is now explicit in ensureAuthenticated.
			this.session = await vscode.authentication.getSession('github', ['repo', 'user:email', 'delete_repo'], { createIfNone: false });
			return this.session;
		} catch (e) {
			logService.error('[gitbbon-manager][githubService] Authentication failed:', e);
			return undefined;
		}
	}

	async ensureAuthenticated(silent: boolean): Promise<boolean> {
		// 1. Try to get existing session (silent)
		const session = await this.getSession();
		if (session) {
			return true;
		}

		// 2. If silent mode, stop here.
		if (silent) {
			logService.info('[gitbbon-manager][githubService] ensureAuthenticated: Not authenticated, silent mode -> returning false');
			return false;
		}

		// 3. Interactive mode: Request login
		try {
			logService.info('[gitbbon-manager][githubService] ensureAuthenticated: Not authenticated, requesting login...');
			this.session = await vscode.authentication.getSession('github', ['repo', 'user:email', 'delete_repo'], { createIfNone: true });
			return !!this.session;
		} catch (e) {
			logService.error('[gitbbon-manager][githubService] ensureAuthenticated failed:', e);
			return false;
		}
	}

	async getRepository(name: string): Promise<RepoInfo | null> {
		const session = await this.getSession();
		if (!session) {
			throw new Error('Authentication required');
		}

		try {
			const response = await this.fetch(`https://api.github.com/repos/${session.account.label}/${name}`);

			if (response.status === 404) {
				return null;
			}

			if (!response.ok) {
				throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
			}

			const repo = await response.json() as GitHubApiResponse;
			return this.mapToRepoInfo(repo);
		} catch (e) {
			logService.error('[gitbbon-manager][githubService] getRepository error:', e);
			// Network error or other issues -> rethrow or return null?
			// SyncEngine expects null only if repo is missing. Error should propogate.
			throw e;
		}
	}

	async createRepository(name: string): Promise<RepoInfo> {
		const session = await this.getSession();
		if (!session) {
			throw new Error('Authentication required');
		}

		try {
			const response = await this.fetch('https://api.github.com/user/repos', {
				method: 'POST',
				body: JSON.stringify({
					name: name,
					private: true, // Default to private
					description: 'Created by Gitbbon'
				})
			});

			if (response.ok || response.status === 201) {
				const repo = await response.json() as GitHubApiResponse;
				return this.mapToRepoInfo(repo);
			}

			// Handle specific errors
			const errorText = await response.text();
			logService.error(`[gitbbon-manager][githubService] createRepository failed: ${response.status} ${errorText}`);
			throw new Error(`Failed to create repository: ${response.status} ${errorText}`);

		} catch (e) {
			logService.error('[gitbbon-manager][githubService] createRepository error:', e);
			throw e;
		}
	}

	async listRepositories(): Promise<RepoInfo[]> {
		const session = await this.getSession();
		if (!session) {
			return [];
		}

		try {
			const response = await this.fetch(`https://api.github.com/user/repos?per_page=100&type=owner`);

			if (response.ok) {
				const repos = await response.json() as GitHubApiResponse[];
				return repos
					.filter((r) => /^gitbbon-note-.+$/.test(r.name))
					.map((r) => this.mapToRepoInfo(r));
			}

			if (response.status === 401) {
				this.session = undefined;
				throw new Error('Authentication failed (401) during listRepositories');
			}

			if (!response.ok) {
				throw new Error(`Failed to list repositories: ${response.status} ${response.statusText}`);
			}

			return []; // Should be unreachable given response.ok check above, but for safety if logic changes
		} catch (e) {
			logService.error('[gitbbon-manager][githubService] listRepositories error:', e);
			throw e;
		}
	}

	async deleteRepository(repoName: string): Promise<boolean> {
		const session = await this.getSession();
		if (!session) {
			return false;
		}

		try {
			const response = await this.fetch(
				`https://api.github.com/repos/${session.account.label}/${repoName}`,
				{ method: 'DELETE' }
			);

			if (response.status === 204) {
				return true;
			} else if (response.status === 404) {
				return true; // Already deleted
			}
			return false;
		} catch (e) {
			logService.error('[gitbbon-manager][githubService] deleteRepository error:', e);
			return false;
		}
	}

	private mapToRepoInfo(repo: GitHubApiResponse): RepoInfo {
		return {
			name: repo.name,
			html_url: repo.html_url,
			clone_url: repo.clone_url,
			updated_at: repo.updated_at
		};
	}

	private async fetch(url: string, options: any = {}): Promise<Response> {
		const session = await this.getSession();
		if (!session) throw new Error('Not authenticated');

		const headers = {
			'Authorization': `Bearer ${session.accessToken}`,
			'Accept': 'application/vnd.github.v3+json',
			'User-Agent': 'Gitbbon-Note-App',
			...options.headers
		};

		// VS Code environment fetch
		return fetch(url, { ...options, headers });
	}
}
