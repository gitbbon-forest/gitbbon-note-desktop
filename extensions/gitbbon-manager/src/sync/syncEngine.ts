/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ILocalProjectService, IRemoteRepositoryService, ProjectConfig, RepoInfo } from './interfaces';

export class SyncEngine {
	constructor(
		private remoteService: IRemoteRepositoryService,
		private localService: ILocalProjectService
	) { }

	async syncProject(config: ProjectConfig, remoteRepo: RepoInfo | null): Promise<void> {

		// Case 1: Local has syncedAt (was synced before) but Remote is missing
		if (config.syncedAt && !remoteRepo) {
			const confirmed = await this.localService.confirmDeletion(config.name);
			if (confirmed) {
				await this.localService.moveToTrash(config.path);
			} else {
				// Keep selected -> Restore remote
				const repoInfo = await this.remoteService.createRepository(config.name);
				await this.localService.pushProject(config.path, repoInfo.clone_url);
			}
			return;
		}

		// Case 2: Local has syncedAt and Remote exists -> Normal Sync (Pull & Push)
		if (config.syncedAt && remoteRepo) {
			await this.localService.pullAndPush(config.path);
			return;
		}

		// Case 3: Local has no syncedAt (never synced) and Remote is missing
		// -> Create remote repository and push
		if (!config.syncedAt && !remoteRepo) {
			const repoInfo = await this.remoteService.createRepository(config.name);
			await this.localService.pushProject(config.path, repoInfo.clone_url);
			return;
		}

		// Case 4: Local has no syncedAt (never synced) but Remote exists with same name
		// AND Local has modifiedAt (has local changes)
		// -> Rename local project with timestamp, then create new remote and push
		if (!config.syncedAt && remoteRepo && config.modifiedAt) {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const newName = `${config.name}-${timestamp}`;
			const newPath = await this.localService.renameProject(config.path, newName);
			const repoInfo = await this.remoteService.createRepository(newName);
			await this.localService.pushProject(newPath, repoInfo.clone_url);
			return;
		}

		// Case 5: Local has no syncedAt (never synced) but Remote exists with same name
		// AND Local has NO modifiedAt (no local changes - valueless)
		// -> Delete local and clone remote
		if (!config.syncedAt && remoteRepo && !config.modifiedAt) {
			await this.localService.moveToTrash(config.path);
			await this.localService.cloneProject(remoteRepo.clone_url, config.path);
			return;
		}
	}

	// Case 6: Remote exists but Local does not exist
	// -> Clone remote repository to local
	async syncRemoteRepo(repoName: string, targetPath: string): Promise<void> {
		const remoteRepo = await this.remoteService.getRepository(repoName);
		if (remoteRepo) {
			await this.localService.cloneProject(remoteRepo.clone_url, targetPath);
		}
	}
}
