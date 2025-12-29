/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SyncEngine } from '../sync/syncEngine';
import { ILocalProjectService, IRemoteRepositoryService, ProjectConfig, RepoInfo } from '../sync/interfaces';

class MockRemoteService implements IRemoteRepositoryService {
	private repos: Map<string, RepoInfo> = new Map();

	setRepo(name: string, info: RepoInfo) {
		this.repos.set(name, info);
	}

	async getRepository(name: string): Promise<RepoInfo | null> {
		return this.repos.get(name) || null;
	}

	async createRepository(name: string): Promise<RepoInfo> {
		const repo: RepoInfo = {
			name,
			html_url: `https://github.com/mock/${name}`,
			updated_at: new Date().toISOString()
		};
		this.repos.set(name, repo);
		return repo;
	}
}

class MockLocalService implements ILocalProjectService {
	public trashedPaths: string[] = [];

	async moveToTrash(path: string): Promise<void> {
		this.trashedPaths.push(path);
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
			name: 'gitbbon-note-project1',
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
});
