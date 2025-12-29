/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ILocalProjectService, IRemoteRepositoryService, ProjectConfig } from './interfaces';

export class SyncEngine {
	constructor(
		private remoteService: IRemoteRepositoryService,
		private localService: ILocalProjectService
	) { }

	async syncProject(config: ProjectConfig): Promise<void> {
		const remoteRepo = await this.remoteService.getRepository(config.name);

		// Case 1: Local has syncedAt (was synced before) but Remote is missing
		if (config.syncedAt && !remoteRepo) {
			await this.localService.moveToTrash(config.path);
			return;
		}
	}
}
