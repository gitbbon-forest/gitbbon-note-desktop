/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';


interface Project {
	name: string;
	path: string;
	lastOpened: string; // ISO 8601 Timestamp
}

interface ProjectManifest {
	version: number;
	projects: Project[];
}

export class ProjectManager {
	private readonly rootPath: string;
	private readonly manifestPath: string;

	constructor() {
		this.rootPath = path.join(os.homedir(), 'Documents', 'Gitbbon_Notes');
		this.manifestPath = path.join(this.rootPath, 'projects.json');
	}

	/**
	 * Initialize the Project Manager and ensure a project is open
	 */
	public async startup(): Promise<void> {
		try {
			// Ensure root directory exists
			if (!fs.existsSync(this.rootPath)) {
				await fs.promises.mkdir(this.rootPath, { recursive: true });
			}

			// Ensure manifest exists
			let manifest = await this.loadManifest();
			if (!manifest) {
				manifest = await this.createDefaultManifest();
			}

			// Check if we are already in a Gitbbon project
			const currentFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (currentFolder) {
				const matchedProject = manifest.projects.find(p => p.path === currentFolder || path.normalize(p.path) === path.normalize(currentFolder));
				if (matchedProject) {
					// Update timestamp
					await this.updateLastOpened(matchedProject.name);
					console.log(`Updated lastOpened for project: ${matchedProject.name}`);
					return;
				}
			}

			// If no project open, or random folder open, switch to latest project
			const latestProject = this.getLatestProject(manifest);
			if (latestProject) {
				console.log(`Opening latest project: ${latestProject.name}`);

				// Ensure the directory actually exists (in case user deleted it)
				if (!fs.existsSync(latestProject.path)) {
					console.warn(`Project path not found: ${latestProject.path}. Re-initializing...`);
					await this.initializeProject(latestProject.path, latestProject.name);
				}

				const uri = vscode.Uri.file(latestProject.path);
				// Force open in same window
				await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
			}
		} catch (error) {
			console.error('ProjectManager startup failed:', error);
			vscode.window.showErrorMessage(`Gitbbon Project Manager Error: ${error}`);
		}
	}

	private async loadManifest(): Promise<ProjectManifest | null> {
		if (fs.existsSync(this.manifestPath)) {
			try {
				const content = await fs.promises.readFile(this.manifestPath, 'utf-8');
				return JSON.parse(content) as ProjectManifest;
			} catch (e) {
				console.error('Failed to parse projects.json', e);
				return null;
			}
		}
		return null;
	}

	private async saveManifest(manifest: ProjectManifest): Promise<void> {
		await fs.promises.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
	}

	private async createDefaultManifest(): Promise<ProjectManifest> {
		const defaultName = 'default';
		const defaultPath = path.join(this.rootPath, defaultName);

		// Ensure default project structure exists
		await this.initializeProject(defaultPath, defaultName);

		const manifest: ProjectManifest = {
			version: 1,
			projects: [
				{
					name: defaultName,
					path: defaultPath,
					lastOpened: new Date().toISOString()
				}
			]
		};

		await this.saveManifest(manifest);
		return manifest;
	}

	private async initializeProject(projectPath: string, projectName: string): Promise<void> {
		// 1. Create Directory
		if (!fs.existsSync(projectPath)) {
			await fs.promises.mkdir(projectPath, { recursive: true });
		}

		// 2. Git Init
		const gitPath = path.join(projectPath, '.git');
		if (!fs.existsSync(gitPath)) {
			// Now that git is in PATH (injected by main process), we can just use simple exec
			await new Promise<void>((resolve, reject) => {
				cp.exec('git init', { cwd: projectPath }, (err) => {
					if (err) {
						console.error('Git init failed', err);
						// Non-fatal, continue
					}
					resolve();
				});
			});
		}

		// 3. Create README (Non-destructive)
		const readmePath = path.join(projectPath, 'README.md');
		if (!fs.existsSync(readmePath)) {
			const content = `# ${projectName}\n\nManaged by Gitbbon.\nCreated: ${new Date().toLocaleString()}\n`;
			await fs.promises.writeFile(readmePath, content, 'utf-8');
		}
	}

	private getLatestProject(manifest: ProjectManifest): Project | undefined {
		if (manifest.projects.length === 0) {
			return undefined;
		}
		return manifest.projects.reduce((prev, current) => {
			// ISO strings are lexicographically sortable, so string comparison works.
			// Reversing logic: we want the LATEST (Max value)
			return (prev.lastOpened > current.lastOpened) ? prev : current;
		});
	}

	private async updateLastOpened(projectName: string): Promise<void> {
		const manifest = await this.loadManifest();
		if (manifest) {
			const project = manifest.projects.find(p => p.name === projectName);
			if (project) {
				project.lastOpened = new Date().toISOString();
				await this.saveManifest(manifest);
			}
		}
	}
}
