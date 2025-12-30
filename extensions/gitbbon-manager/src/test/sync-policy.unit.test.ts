/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SyncEngine } from '../sync/syncEngine';
import { ILocalProjectService, IRemoteRepositoryService, ProjectConfig, RepoInfo } from '../sync/interfaces';

class MockRemoteService implements IRemoteRepositoryService {
	private repos: Map<string, RepoInfo> = new Map();
	private createdRepoCount = 0;

	setRepo(name: string, info: RepoInfo) {
		this.repos.set(name, info);
	}

	getCreatedRepoCount(): number {
		return this.createdRepoCount;
	}

	async getRepository(name: string): Promise<RepoInfo | null> {
		return this.repos.get(name) || null;
	}

	async createRepository(name: string): Promise<RepoInfo> {
		this.createdRepoCount++;
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
		return Array.from(this.repos.values());
	}

	async deleteRepository(repoName: string): Promise<boolean> {
		if (this.repos.has(repoName)) {
			this.repos.delete(repoName);
			return true;
		}
		return false;
	}
}

class MockLocalService implements ILocalProjectService {
	public trashedPaths: string[] = [];
	public pushedPaths: string[] = [];
	public renamedProjects: { oldPath: string; newName: string; newPath: string }[] = [];
	public clonedProjects: { cloneUrl: string; targetPath: string }[] = [];

	async moveToTrash(path: string): Promise<void> {
		this.trashedPaths.push(path);
	}

	async pushProject(path: string): Promise<void> {
		this.pushedPaths.push(path);
	}

	async renameProject(oldPath: string, newName: string): Promise<string> {
		const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
		const newPath = `${parentDir}/${newName}`;
		this.renamedProjects.push({ oldPath, newName, newPath });
		return newPath;
	}

	async cloneProject(cloneUrl: string, targetPath: string): Promise<void> {
		this.clonedProjects.push({ cloneUrl, targetPath });
	}
}

describe('SyncEngine Policy Tests', () => {
	let remoteService: MockRemoteService;
	let localService: MockLocalService;
	let syncEngine: SyncEngine;

	beforeEach(() => {
		remoteService = new MockRemoteService();
		localService = new MockLocalService();
		syncEngine = new SyncEngine(remoteService, localService);
	});

	it('Scenario 1: Local(syncedAt) + Remote(Missing) -> Should delete local project', async () => {
		// Given
		const project: ProjectConfig = {
			title: 'gitbbon-note-project1',
			name: 'gitbbon-note-project1', // Added
			path: '/local/path/to/project1',
			syncedAt: '2023-01-01T00:00:00Z' // Previously synced
		};

		// Remote has NO repository for this project (simulating remote deletion)

		// When
		await syncEngine.syncProject(project);

		// Then
		assert.strictEqual(localService.trashedPaths.length, 1, 'Should have moved one path to trash');
		assert.strictEqual(localService.trashedPaths[0], project.path, 'Should have moved the correct project path to trash');
	});

	it('Scenario 2: Local(syncedAt) + Remote(Exists) -> Should do nothing', async () => {
		// Given
		const project: ProjectConfig = {
			title: 'gitbbon-note-project2',
			name: 'gitbbon-note-project2', // Added
			path: '/local/path/to/project2',
			syncedAt: '2023-01-01T00:00:00Z' // Previously synced
		};

		// Remote HAS the repository
		remoteService.setRepo(project.name, {
			name: project.name,
			html_url: `https://github.com/mock/${project.name}`,
			clone_url: `https://github.com/mock/${project.name}.git`,
			updated_at: '2023-01-02T00:00:00Z'
		});

		// When
		await syncEngine.syncProject(project);

		// Then - No side effects should have occurred
		assert.strictEqual(localService.trashedPaths.length, 0, 'Should NOT have moved anything to trash');
		assert.strictEqual(remoteService.getCreatedRepoCount(), 0, 'Should NOT have created any repository');
	});

	it('Scenario 3: Local(no syncedAt) + Remote(Missing) -> Should create remote and push', async () => {
		// Given - Local project exists but has never been synced (no syncedAt)
		const project: ProjectConfig = {
			title: 'gitbbon-note-new-project',
			name: 'gitbbon-note-new-project', // Added
			path: '/local/path/to/new-project'
			// No syncedAt means this is a local-only project
		};

		// Remote has NO repository for this project

		// When
		await syncEngine.syncProject(project);

		// Then - Should have created remote repository and pushed
		assert.strictEqual(remoteService.getCreatedRepoCount(), 1, 'Should have created one repository');
		assert.strictEqual(localService.pushedPaths.length, 1, 'Should have pushed one project');
		assert.strictEqual(localService.pushedPaths[0], project.path, 'Should have pushed the correct project');
		assert.strictEqual(localService.trashedPaths.length, 0, 'Should NOT have moved anything to trash');
	});

	it('Scenario 4: Local(no syncedAt, has modifiedAt) + Remote(Exists with same name) -> Should rename local and create new remote', async () => {
		// Given - Local project with local modifications but never synced
		const project: ProjectConfig = {
			title: 'gitbbon-note-conflict',
			name: 'gitbbon-note-conflict', // Added
			path: '/local/path/to/gitbbon-note-conflict',
			modifiedAt: '2023-12-01T00:00:00Z' // Has local modifications
			// No syncedAt - never synced
		};

		// Remote already has a repository with the same name (conflict!)
		remoteService.setRepo(project.name, {
			name: project.name,
			html_url: `https://github.com/mock/${project.name}`,
			clone_url: `https://github.com/mock/${project.name}.git`,
			updated_at: '2023-01-01T00:00:00Z'
		});

		// When
		await syncEngine.syncProject(project);

		// Then - Should rename local project and create new remote for it
		assert.strictEqual(localService.renamedProjects.length, 1, 'Should have renamed one project');
		assert.ok(/^gitbbon-note-conflict-\d{4}-\d{2}-\d{2}T/.test(localService.renamedProjects[0].newName), 'New name should include original name + timestamp');
		assert.strictEqual(remoteService.getCreatedRepoCount(), 1, 'Should have created one new repository');
		assert.strictEqual(localService.pushedPaths.length, 1, 'Should have pushed the renamed project');
		assert.strictEqual(localService.trashedPaths.length, 0, 'Should NOT have moved anything to trash');
	});

	it('Scenario 5: Local(no syncedAt, no modifiedAt) + Remote(Exists with same name) -> Should delete local and clone remote', async () => {
		// Given - Local project with NO local modifications and never synced
		const project: ProjectConfig = {
			title: 'gitbbon-note-empty',
			name: 'gitbbon-note-empty',
			path: '/local/path/to/gitbbon-note-empty'
			// No syncedAt - never synced
			// No modifiedAt - no local changes (valueless local)
		};

		// Remote already has a repository with the same name
		remoteService.setRepo(project.name, {
			name: project.name,
			html_url: `https://github.com/mock/${project.name}`,
			clone_url: `https://github.com/mock/${project.name}.git`,
			updated_at: '2023-01-01T00:00:00Z'
		});

		// When
		await syncEngine.syncProject(project);

		// Then - Should delete local (valueless) and clone remote
		assert.strictEqual(localService.trashedPaths.length, 1, 'Should have moved local to trash');
		assert.strictEqual(localService.trashedPaths[0], project.path, 'Should have trashed the correct path');
		assert.strictEqual(localService.clonedProjects.length, 1, 'Should have cloned one project');
		assert.strictEqual(localService.clonedProjects[0].cloneUrl, `https://github.com/mock/${project.name}.git`, 'Should clone from correct URL');
		assert.strictEqual(localService.clonedProjects[0].targetPath, project.path, 'Should clone to original path');
		assert.strictEqual(remoteService.getCreatedRepoCount(), 0, 'Should NOT have created any repository');
	});

	it('Scenario 6: Remote(Exists) + Local(Missing) -> Should clone remote', async () => {
		// Given - Remote repository exists, but local project does not exist yet
		const repoName = 'gitbbon-note-remote-only';
		const expectedPath = '/local/path/to/gitbbon-note-remote-only';

		remoteService.setRepo(repoName, {
			name: repoName,
			html_url: `https://github.com/mock/${repoName}`,
			clone_url: `https://github.com/mock/${repoName}.git`,
			updated_at: '2023-01-01T00:00:00Z'
		});

		// When - Sync is called for a remote-only repository
		await syncEngine.syncRemoteRepo(repoName, expectedPath);

		// Then - Should clone the remote repository
		assert.strictEqual(localService.clonedProjects.length, 1, 'Should have cloned one project');
		assert.strictEqual(localService.clonedProjects[0].cloneUrl, `https://github.com/mock/${repoName}.git`, 'Should clone from correct URL');
		assert.strictEqual(localService.clonedProjects[0].targetPath, expectedPath, 'Should clone to expected path');
		assert.strictEqual(localService.trashedPaths.length, 0, 'Should NOT have moved anything to trash');
		assert.strictEqual(remoteService.getCreatedRepoCount(), 0, 'Should NOT have created any repository');
	});
});


