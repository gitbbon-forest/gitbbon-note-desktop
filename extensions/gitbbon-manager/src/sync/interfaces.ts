/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface RepoInfo {
	name: string;
	html_url: string;
	updated_at: string; // ISO string
}

export interface ProjectConfig {
	name: string;
	path: string;
	syncedAt?: string; // ISO string
	modifiedAt?: string; // ISO string
}

export interface IRemoteRepositoryService {
	getRepository(name: string): Promise<RepoInfo | null>;
	createRepository(name: string): Promise<RepoInfo>;
}

export interface ILocalProjectService {
	moveToTrash(path: string): Promise<void>;
}
