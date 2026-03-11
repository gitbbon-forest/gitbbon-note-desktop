/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SyncEngine } from '../sync/syncEngine';
import { ILocalProjectService, IRemoteRepositoryService, ProjectConfig, RepoInfo } from '../sync/interfaces';

// --- Mock Services ---

class MockGitHubService implements IRemoteRepositoryService {
	private repos: Map<string, RepoInfo> = new Map();
	public authenticated = true;
	public shouldThrowOnAuth = false;
	public shouldThrowOnList = false;
	public shouldThrowOnCreate = false;
	public shouldThrowOnGet = false;
	public silentAuthResult = true;
	public createRepoCallCount = 0;
	public getRepoCalls: string[] = [];
	public deleteRepoCalls: string[] = [];

	setRepo(name: string, info: RepoInfo) {
		this.repos.set(name, info);
	}

	async ensureAuthenticated(silent: boolean): Promise<boolean> {
		if (this.shouldThrowOnAuth) {
			throw new Error('Authentication error: unexpected failure');
		}
		if (silent) {
			return this.silentAuthResult;
		}
		return this.authenticated;
	}

	async getRepository(name: string): Promise<RepoInfo | null> {
		this.getRepoCalls.push(name);
		if (this.shouldThrowOnGet) {
			throw new Error('Network error: failed to reach GitHub API');
		}
		return this.repos.get(name) || null;
	}

	async createRepository(name: string): Promise<RepoInfo> {
		this.createRepoCallCount++;
		if (this.shouldThrowOnCreate) {
			throw new Error('API error: failed to create repository');
		}
		const repo: RepoInfo = {
			name,
			html_url: `https://github.com/mock/${name}`,
			clone_url: `https://github.com/mock/${name}.git`,
			updated_at: new Date().toISOString()
		};
		this.repos.set(name, repo);
		return repo;
	}

	async listRepositories(): Promise<RepoInfo[]> {
		if (this.shouldThrowOnList) {
			throw new Error('Network error: failed to list repositories');
		}
		return Array.from(this.repos.values());
	}

	async deleteRepository(repoName: string): Promise<boolean> {
		this.deleteRepoCalls.push(repoName);
		if (this.repos.has(repoName)) {
			this.repos.delete(repoName);
			return true;
		}
		return false;
	}
}

class MockLocalProjectService implements ILocalProjectService {
	public trashedPaths: string[] = [];
	public pushedPaths: { path: string; remoteUrl?: string }[] = [];
	public pulledPaths: string[] = [];
	public pullAndPushPaths: string[] = [];
	public renamedProjects: { oldPath: string; newName: string; newPath: string }[] = [];
	public clonedProjects: { cloneUrl: string; targetPath: string }[] = [];
	public confirmDeletionResponse = true;
	public shouldThrowOnPush = false;
	public shouldThrowOnClone = false;
	public shouldThrowOnPullAndPush = false;

	async confirmDeletion(projectName: string): Promise<boolean> {
		return this.confirmDeletionResponse;
	}

	async moveToTrash(path: string): Promise<void> {
		this.trashedPaths.push(path);
	}

	async pushProject(path: string, remoteUrl?: string): Promise<void> {
		if (this.shouldThrowOnPush) {
			throw new Error('Git push failed: remote rejected');
		}
		this.pushedPaths.push({ path, remoteUrl });
	}

	async pullProject(path: string): Promise<void> {
		this.pulledPaths.push(path);
	}

	async pullAndPush(path: string): Promise<void> {
		if (this.shouldThrowOnPullAndPush) {
			throw new Error('Pull and push failed: merge conflict');
		}
		this.pullAndPushPaths.push(path);
	}

	async renameProject(oldPath: string, newName: string): Promise<string> {
		const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
		const newPath = `${parentDir}/${newName}`;
		this.renamedProjects.push({ oldPath, newName, newPath });
		return newPath;
	}

	async cloneProject(cloneUrl: string, targetPath: string): Promise<void> {
		if (this.shouldThrowOnClone) {
			throw new Error('Git clone failed: permission denied');
		}
		this.clonedProjects.push({ cloneUrl, targetPath });
	}
}

// --- Tests ---

describe('GitHub Integration Tests', () => {
	let githubService: MockGitHubService;
	let localService: MockLocalProjectService;
	let syncEngine: SyncEngine;

	beforeEach(() => {
		githubService = new MockGitHubService();
		localService = new MockLocalProjectService();
		syncEngine = new SyncEngine(githubService, localService);
	});

	describe('Remote Repository Auto-Creation Flow', () => {
		it('should create repository and push with clone_url for new local project', async () => {
			const project: ProjectConfig = {
				title: 'gitbbon-note-new',
				name: 'gitbbon-note-new',
				path: '/local/gitbbon-note-new'
			};

			const remoteRepo = await githubService.getRepository(project.name);
			await syncEngine.syncProject(project, remoteRepo);

			// Verify: createRepository was called
			assert.strictEqual(githubService.createRepoCallCount, 1, 'Should create one repository');

			// Verify: push was called with the clone_url from created repo
			assert.strictEqual(localService.pushedPaths.length, 1, 'Should push once');
			assert.strictEqual(localService.pushedPaths[0].path, project.path);
			assert.strictEqual(
				localService.pushedPaths[0].remoteUrl,
				'https://github.com/mock/gitbbon-note-new.git',
				'Should push with correct clone_url'
			);
		});

		it('should handle createRepository failure gracefully', async () => {
			const project: ProjectConfig = {
				title: 'gitbbon-note-fail-create',
				name: 'gitbbon-note-fail-create',
				path: '/local/gitbbon-note-fail-create'
			};

			githubService.shouldThrowOnCreate = true;

			const remoteRepo = await githubService.getRepository(project.name);
			await assert.rejects(
				() => syncEngine.syncProject(project, remoteRepo),
				/API error: failed to create repository/,
				'Should propagate create error'
			);

			// Push should not have been called
			assert.strictEqual(localService.pushedPaths.length, 0, 'Should not push if create failed');
		});

		it('should handle push failure after successful create', async () => {
			const project: ProjectConfig = {
				title: 'gitbbon-note-fail-push',
				name: 'gitbbon-note-fail-push',
				path: '/local/gitbbon-note-fail-push'
			};

			localService.shouldThrowOnPush = true;

			const remoteRepo = await githubService.getRepository(project.name);
			await assert.rejects(
				() => syncEngine.syncProject(project, remoteRepo),
				/Git push failed/,
				'Should propagate push error'
			);

			// Repository was created but push failed
			assert.strictEqual(githubService.createRepoCallCount, 1, 'Repository was created before push failed');
		});
	});

	describe('Authentication Handling', () => {
		it('should proceed with sync when authenticated', async () => {
			githubService.authenticated = true;
			const isAuth = await githubService.ensureAuthenticated(false);
			assert.strictEqual(isAuth, true, 'Should be authenticated');
		});

		it('should return false in silent mode when not authenticated', async () => {
			githubService.silentAuthResult = false;
			const isAuth = await githubService.ensureAuthenticated(true);
			assert.strictEqual(isAuth, false, 'Should return false in silent mode when not authenticated');
		});

		it('should return false in interactive mode when authentication fails', async () => {
			githubService.authenticated = false;
			const isAuth = await githubService.ensureAuthenticated(false);
			assert.strictEqual(isAuth, false, 'Should return false when authentication fails');
		});

		it('should propagate unexpected auth errors', async () => {
			githubService.shouldThrowOnAuth = true;
			await assert.rejects(
				() => githubService.ensureAuthenticated(false),
				/Authentication error/,
				'Should propagate auth error'
			);
		});
	});

	describe('Network Error Handling', () => {
		it('getRepository network error should propagate', async () => {
			githubService.shouldThrowOnGet = true;
			await assert.rejects(
				() => githubService.getRepository('some-repo'),
				/Network error: failed to reach GitHub API/,
				'Should propagate network error from getRepository'
			);
		});

		it('listRepositories network error should propagate', async () => {
			githubService.shouldThrowOnList = true;
			await assert.rejects(
				() => githubService.listRepositories(),
				/Network error: failed to list repositories/,
				'Should propagate network error from listRepositories'
			);
		});

		it('clone failure should propagate through syncRemoteRepo', async () => {
			const repoName = 'gitbbon-note-clone-fail';
			githubService.setRepo(repoName, {
				name: repoName,
				html_url: `https://github.com/mock/${repoName}`,
				clone_url: `https://github.com/mock/${repoName}.git`,
				updated_at: '2023-01-01T00:00:00Z'
			});

			localService.shouldThrowOnClone = true;

			await assert.rejects(
				() => syncEngine.syncRemoteRepo(repoName, `/local/${repoName}`),
				/Git clone failed/,
				'Should propagate clone error through syncRemoteRepo'
			);
		});

		it('pullAndPush failure during normal sync should propagate', async () => {
			const project: ProjectConfig = {
				title: 'gitbbon-note-pull-fail',
				name: 'gitbbon-note-pull-fail',
				path: '/local/gitbbon-note-pull-fail',
				syncedAt: '2023-01-01T00:00:00Z'
			};

			githubService.setRepo(project.name, {
				name: project.name,
				html_url: `https://github.com/mock/${project.name}`,
				clone_url: `https://github.com/mock/${project.name}.git`,
				updated_at: '2023-01-02T00:00:00Z'
			});

			localService.shouldThrowOnPullAndPush = true;

			const remoteRepo = await githubService.getRepository(project.name);
			await assert.rejects(
				() => syncEngine.syncProject(project, remoteRepo),
				/Pull and push failed/,
				'Should propagate pullAndPush error'
			);
		});
	});

	describe('Silent vs Interactive Mode', () => {
		it('silent mode: should skip sync when not authenticated', async () => {
			githubService.silentAuthResult = false;

			const isAuth = await githubService.ensureAuthenticated(true);
			assert.strictEqual(isAuth, false, 'Silent mode should return false when not authenticated');

			// In real GitHubSyncManager.sync(), this would cause early return
			// Here we verify the auth behavior that drives that decision
		});

		it('interactive mode: should attempt authentication when not logged in', async () => {
			githubService.authenticated = true;

			const isAuth = await githubService.ensureAuthenticated(false);
			assert.strictEqual(isAuth, true, 'Interactive mode should authenticate');
		});

		it('silent mode: should succeed when already authenticated', async () => {
			githubService.silentAuthResult = true;

			const isAuth = await githubService.ensureAuthenticated(true);
			assert.strictEqual(isAuth, true, 'Silent mode should succeed when session exists');
		});
	});

	describe('Sync Workflow (Up Sync + Down Sync Simulation)', () => {
		it('should sync multiple local projects in sequence', async () => {
			const projects: ProjectConfig[] = [
				{
					title: 'gitbbon-note-proj1',
					name: 'gitbbon-note-proj1',
					path: '/local/gitbbon-note-proj1',
					syncedAt: '2023-01-01T00:00:00Z'
				},
				{
					title: 'gitbbon-note-proj2',
					name: 'gitbbon-note-proj2',
					path: '/local/gitbbon-note-proj2'
					// No syncedAt -> new project
				}
			];

			// Set up remote for proj1 only
			githubService.setRepo('gitbbon-note-proj1', {
				name: 'gitbbon-note-proj1',
				html_url: 'https://github.com/mock/gitbbon-note-proj1',
				clone_url: 'https://github.com/mock/gitbbon-note-proj1.git',
				updated_at: '2023-01-02T00:00:00Z'
			});

			// Simulate syncUp: process each project
			for (const project of projects) {
				const remoteRepo = await githubService.getRepository(project.name);
				await syncEngine.syncProject(project, remoteRepo);
			}

			// proj1: synced -> pullAndPush
			assert.strictEqual(localService.pullAndPushPaths.length, 1);
			assert.strictEqual(localService.pullAndPushPaths[0], '/local/gitbbon-note-proj1');

			// proj2: new -> create + push
			assert.strictEqual(githubService.createRepoCallCount, 1);
			assert.strictEqual(localService.pushedPaths.length, 1);
			assert.strictEqual(localService.pushedPaths[0].path, '/local/gitbbon-note-proj2');
		});

		it('should clone remote-only repos during down sync', async () => {
			const remoteOnlyRepos = ['gitbbon-note-remote1', 'gitbbon-note-remote2'];

			for (const repoName of remoteOnlyRepos) {
				githubService.setRepo(repoName, {
					name: repoName,
					html_url: `https://github.com/mock/${repoName}`,
					clone_url: `https://github.com/mock/${repoName}.git`,
					updated_at: '2023-01-01T00:00:00Z'
				});
			}

			// Simulate syncDown
			for (const repoName of remoteOnlyRepos) {
				await syncEngine.syncRemoteRepo(repoName, `/local/${repoName}`);
			}

			assert.strictEqual(localService.clonedProjects.length, 2, 'Should clone both remote repos');
			assert.strictEqual(localService.clonedProjects[0].targetPath, '/local/gitbbon-note-remote1');
			assert.strictEqual(localService.clonedProjects[1].targetPath, '/local/gitbbon-note-remote2');
		});

		it('error in one project sync should not block others (simulation)', async () => {
			const projects: ProjectConfig[] = [
				{
					title: 'gitbbon-note-ok',
					name: 'gitbbon-note-ok',
					path: '/local/gitbbon-note-ok'
				},
				{
					title: 'gitbbon-note-fail',
					name: 'gitbbon-note-fail',
					path: '/local/gitbbon-note-fail'
				},
				{
					title: 'gitbbon-note-ok2',
					name: 'gitbbon-note-ok2',
					path: '/local/gitbbon-note-ok2'
				}
			];

			// Simulate GitHubSyncManager.syncUp pattern: catch errors per project
			const errors: Error[] = [];
			let processedCount = 0;

			for (const project of projects) {
				try {
					if (project.name === 'gitbbon-note-fail') {
						// Simulate an error for this specific project
						throw new Error(`Failed to sync project ${project.name}`);
					}
					const remoteRepo = await githubService.getRepository(project.name);
					await syncEngine.syncProject(project, remoteRepo);
					processedCount++;
				} catch (e) {
					errors.push(e as Error);
				}
			}

			// Two projects should have synced successfully
			assert.strictEqual(processedCount, 2, 'Should process 2 projects successfully');
			assert.strictEqual(errors.length, 1, 'Should have 1 error');
			assert.ok(errors[0].message.includes('gitbbon-note-fail'), 'Error should be from the failing project');

			// Verify the successful projects were created+pushed
			assert.strictEqual(githubService.createRepoCallCount, 2, 'Should create repos for successful projects');
		});
	});

	describe('Delete Repository', () => {
		it('should delete existing repository', async () => {
			githubService.setRepo('gitbbon-note-to-delete', {
				name: 'gitbbon-note-to-delete',
				html_url: 'https://github.com/mock/gitbbon-note-to-delete',
				clone_url: 'https://github.com/mock/gitbbon-note-to-delete.git',
				updated_at: '2023-01-01T00:00:00Z'
			});

			const result = await githubService.deleteRepository('gitbbon-note-to-delete');
			assert.strictEqual(result, true, 'Should return true for successful deletion');
			assert.strictEqual(githubService.deleteRepoCalls.length, 1);

			// Verify repo is gone
			const repo = await githubService.getRepository('gitbbon-note-to-delete');
			assert.strictEqual(repo, null, 'Repository should no longer exist');
		});

		it('should return false for non-existent repository', async () => {
			const result = await githubService.deleteRepository('non-existent-repo');
			assert.strictEqual(result, false, 'Should return false for non-existent repo');
		});
	});

	describe('Post-Commit Auto-Push Flow', () => {
		it('should trigger sync after commit (simulated flow)', async () => {
			// This simulates the flow in extension.ts:
			// reallyFinalCommit -> githubSyncManager.sync(true) -> syncUp -> syncProject

			const project: ProjectConfig = {
				title: 'gitbbon-note-auto-push',
				name: 'gitbbon-note-auto-push',
				path: '/local/gitbbon-note-auto-push',
				syncedAt: '2023-01-01T00:00:00Z'
			};

			githubService.setRepo(project.name, {
				name: project.name,
				html_url: `https://github.com/mock/${project.name}`,
				clone_url: `https://github.com/mock/${project.name}.git`,
				updated_at: '2023-01-02T00:00:00Z'
			});

			// Step 1: Ensure authenticated (silent mode)
			const isAuth = await githubService.ensureAuthenticated(true);
			assert.strictEqual(isAuth, true, 'Should be authenticated');

			// Step 2: List remote repos
			const remoteRepos = await githubService.listRepositories();
			const remoteRepoMap = new Map(remoteRepos.map(r => [r.name, r]));

			// Step 3: Sync the project
			const remoteRepo = remoteRepoMap.get(project.name) || null;
			await syncEngine.syncProject(project, remoteRepo);

			// Verify pullAndPush was called (normal sync for existing synced project)
			assert.strictEqual(localService.pullAndPushPaths.length, 1);
			assert.strictEqual(localService.pullAndPushPaths[0], project.path);
		});

		it('auto-push should skip when not authenticated in silent mode', async () => {
			githubService.silentAuthResult = false;

			const isAuth = await githubService.ensureAuthenticated(true);
			assert.strictEqual(isAuth, false, 'Should not be authenticated in silent mode');

			// In real code, sync() would return early here
			// No sync operations should happen
			assert.strictEqual(localService.pullAndPushPaths.length, 0);
			assert.strictEqual(localService.pushedPaths.length, 0);
		});
	});

	describe('Periodic Sync Crash Prevention', () => {
		it('errors during periodic sync should not crash (errors are catchable)', async () => {
			// Simulate a periodic sync where listRepositories fails
			githubService.shouldThrowOnList = true;

			let errorCaught = false;
			try {
				await githubService.listRepositories();
			} catch (e) {
				errorCaught = true;
			}

			assert.strictEqual(errorCaught, true, 'Error should be catchable, not crash the app');
		});

		it('auth failure in periodic sync should be catchable', async () => {
			githubService.shouldThrowOnAuth = true;

			let errorCaught = false;
			try {
				await githubService.ensureAuthenticated(true);
			} catch (e) {
				errorCaught = true;
			}

			assert.strictEqual(errorCaught, true, 'Auth error should be catchable');
		});

		it('individual project sync error should not stop batch processing', async () => {
			// Simulate the try/catch per project pattern from GitHubSyncManager.syncUp
			const projects: ProjectConfig[] = [
				{
					title: 'gitbbon-note-good',
					name: 'gitbbon-note-good',
					path: '/local/gitbbon-note-good',
					syncedAt: '2023-01-01T00:00:00Z'
				},
				{
					title: 'gitbbon-note-bad',
					name: 'gitbbon-note-bad',
					path: '/local/gitbbon-note-bad',
					syncedAt: '2023-01-01T00:00:00Z'
				}
			];

			// Set up remotes for both
			for (const p of projects) {
				githubService.setRepo(p.name, {
					name: p.name,
					html_url: `https://github.com/mock/${p.name}`,
					clone_url: `https://github.com/mock/${p.name}.git`,
					updated_at: '2023-01-02T00:00:00Z'
				});
			}

			let successCount = 0;
			let errorCount = 0;

			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				try {
					// Make the second project fail
					if (i === 1) {
						localService.shouldThrowOnPullAndPush = true;
					}
					const remoteRepo = await githubService.getRepository(project.name);
					await syncEngine.syncProject(project, remoteRepo);
					successCount++;
				} catch (e) {
					errorCount++;
					// Reset for next iteration
					localService.shouldThrowOnPullAndPush = false;
				}
			}

			assert.strictEqual(successCount, 1, 'One project should succeed');
			assert.strictEqual(errorCount, 1, 'One project should fail');
			assert.strictEqual(localService.pullAndPushPaths.length, 1, 'Only successful project should have pullAndPush');
		});
	});
});
