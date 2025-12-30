/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ILocalProjectService } from '../interfaces';
import { ProjectManager } from '../../projectManager';

export class LocalProjectService implements ILocalProjectService {
	constructor(private projectManager: ProjectManager) { }

	async moveToTrash(projectPath: string): Promise<void> {
		try {
			// Check if exists
			if (!fs.existsSync(projectPath)) {
				return;
			}

			const trash = await import('trash');
			await trash.default(projectPath);

			const repoName = path.basename(projectPath);
			await this.projectManager.removeFromLocalConfig(repoName);
		} catch (e) {
			console.error(`[LocalProjectService] moveToTrash failed for ${projectPath}:`, e);
			throw e;
		}
	}

	async pullProject(path: string): Promise<void> {
		try {
			// Pull from origin main
			// Use --rebase to avoid merge commits if possible, or just standard pull
			// Plan didn't specify, but standard pull is safer for now?
			// User prefers standard.
			await this.execGit(['pull', 'origin', 'main'], path);
		} catch (e) {
			console.error(`[LocalProjectService] pullProject failed for ${path}:`, e);
			throw e;
		}
	}

	async pullAndPush(path: string): Promise<void> {
		try {
			await this.pullProject(path);
			await this.pushProject(path);
		} catch (e) {
			console.error(`[LocalProjectService] pullAndPush failed for ${path}:`, e);
			throw e;
		}
	}

	async pushProject(projectPath: string, remoteUrl?: string): Promise<void> {
		try {
			// 1. Link remote if provided
			if (remoteUrl) {
				const currentRemote = await this.execGit(['remote', 'get-url', 'origin'], projectPath).catch(() => null);
				if (currentRemote !== remoteUrl) {
					if (currentRemote) {
						await this.execGit(['remote', 'remove', 'origin'], projectPath);
					}
					await this.execGit(['remote', 'add', 'origin', remoteUrl], projectPath);
				}
			}

			// 2. Ensure we have commits
			try {
				await this.execGit(['rev-parse', 'HEAD'], projectPath);
			} catch {
				// No commits, create initial
				await this.execGit(['add', '.'], projectPath);
				await this.execGit(['commit', '-m', 'Initial commit'], projectPath);
			}

			// 3. Push
			await this.execGit(['push', '-u', 'origin', 'main'], projectPath);

			// 4. Update SyncedAt
			const repoName = path.basename(projectPath);
			await this.projectManager.updateSyncedAt(repoName);

		} catch (e) {
			console.error(`[LocalProjectService] pushProject failed for ${projectPath}:`, e);
			throw e;
		}
	}

	async renameProject(oldPath: string, newName: string): Promise<string> {
		const parentDir = path.dirname(oldPath);
		const newPath = path.join(parentDir, newName);

		try {
			await fs.promises.rename(oldPath, newPath);

			// Update .gitbbon.json if exists
			const configPath = path.join(newPath, '.gitbbon.json');
			if (fs.existsSync(configPath)) {
				const content = await fs.promises.readFile(configPath, 'utf-8');
				const config = JSON.parse(content);
				config.name = newName;
				await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
			}

			// Note: We don't necessarily update .gitbbon-local.json here because the old entry refers to old repoName.
			// Ideally we should rename the key in local config too, but SyncEngine usually treats this as a fresh start or conflict copy.
			// Scenario 4 treats the renamed one as "renamed local" (backup) and creates a NEW remote.
			// So metadata for the renamed folder might not be relevant for sync anymore, or depends on what we do next.

			return newPath;
		} catch (e) {
			console.error(`[LocalProjectService] renameProject failed:`, e);
			throw e;
		}
	}

	async cloneProject(cloneUrl: string, targetPath: string): Promise<void> {
		try {
			const parentDir = path.dirname(targetPath);
			if (!fs.existsSync(parentDir)) {
				await fs.promises.mkdir(parentDir, { recursive: true });
			}

			if (fs.existsSync(targetPath)) {
				const files = await fs.promises.readdir(targetPath);
				if (files.length > 0) {
					throw new Error(`Target path ${targetPath} is not empty`);
				} else {
					await fs.promises.rmdir(targetPath);
				}
			}

			await this.execGit(['clone', cloneUrl, targetPath], parentDir);

			// Initialize project structure (ProjectManager.addProject logic)
			const repoName = path.basename(targetPath);
			await this.projectManager.addProject(repoName, targetPath);

			// Update metadata
			await this.projectManager.updateLastModified(targetPath);
			await this.projectManager.updateSyncedAt(repoName);

		} catch (e) {
			console.error(`[LocalProjectService] cloneProject failed:`, e);
			throw e;
		}
	}

	private async execGit(args: string[], cwd: string): Promise<string> {
		const dugite = await import('dugite');
		const result = await dugite.exec(args, cwd);
		if (result.exitCode !== 0) {
			throw new Error(result.stderr || `Git command exited with code ${result.exitCode}`);
		}
		return result.stdout.trim();
	}
}
