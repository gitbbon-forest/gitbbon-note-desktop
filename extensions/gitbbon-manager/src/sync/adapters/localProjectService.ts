/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ILocalProjectService } from '../interfaces';
import { ProjectManager } from '../../projectManager';
import { logService } from '../../services/logService';

export class LocalProjectService implements ILocalProjectService {
	constructor(private projectManager: ProjectManager) { }

	async moveToTrash(projectPath: string): Promise<void> {
		try {
			// Delegate to ProjectManager to ensure consistent deletion logic (cleanup + workspace closure)
			logService.info(`[gitbbon-manager][localProjectService] Delegating deletion of ${projectPath} to ProjectManager`);
			const success = await this.projectManager.deleteProject(projectPath, true);
			if (!success) {
				throw new Error(`Failed to delete project: ${projectPath}`);
			}
		} catch (e) {
			logService.error(`[gitbbon-manager][localProjectService] moveToTrash failed for ${projectPath}:`, e);
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
			logService.error(`[gitbbon-manager][localProjectService] pullProject failed for ${path}:`, e);
			throw e;
		}
	}

	async pullAndPush(path: string): Promise<void> {
		try {
			await this.pullProject(path);
			await this.pushProject(path);
		} catch (e) {
			logService.error(`[gitbbon-manager][localProjectService] pullAndPush failed for ${path}:`, e);
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
			logService.error(`[gitbbon-manager][localProjectService] pushProject failed for ${projectPath}:`, e);
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
			logService.error(`[gitbbon-manager][localProjectService] renameProject failed:`, e);
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
			logService.error(`[gitbbon-manager][localProjectService] cloneProject failed:`, e);
			throw e;
		}
	}

	private async execGit(args: string[], cwd: string): Promise<string> {
		const cp = await import('child_process');
		return new Promise((resolve, reject) => {
			const git = cp.spawn('git', args, { cwd });
			let stdout = '';
			let stderr = '';

			git.stdout.on('data', (data) => { stdout += data.toString(); });
			git.stderr.on('data', (data) => { stderr += data.toString(); });

			git.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(stderr || `Git command exited with code ${code}`));
				} else {
					resolve(stdout.trim());
				}
			});

			git.on('error', (err) => reject(err));
		});
	}

	async confirmDeletion(projectName: string): Promise<boolean> {
		const message = `The remote repository for '${projectName}' is missing. Do you want to delete the local project?`;
		const answer = await vscode.window.showWarningMessage(message, { modal: true }, 'Delete', 'Keep');
		return answer === 'Delete';
	}
}
