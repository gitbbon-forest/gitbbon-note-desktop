/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { DiffParser } from './diffParser';
import { CommitMessageGenerator } from './commitMessageGenerator';


interface Project {
	name: string;
	path: string;
	lastOpened: string; // ISO 8601 Timestamp
	lastModified?: string; // ISO 8601 Timestamp of last commit
}

interface ProjectManifest {
	version: number;
	projects: Project[];
}

export class ProjectManager {
	private readonly rootPath: string;
	private readonly commitMessageGenerator: CommitMessageGenerator;

	constructor() {
		this.rootPath = path.join(os.homedir(), 'Documents', 'Gitbbon_Notes');
		this.commitMessageGenerator = new CommitMessageGenerator();
	}

	/**
	 * Initialize the Project Manager and ensure a project is open
	 */
	public async startup(): Promise<void> {
		console.log('[ProjectManager] Startup initiated');

		try {
			// Ensure root directory exists
			console.log(`[ProjectManager] Checking root path: ${this.rootPath}, Exists: ${fs.existsSync(this.rootPath)}`);
			if (!fs.existsSync(this.rootPath)) {
				console.log('[ProjectManager] Creating root directory...');
				await fs.promises.mkdir(this.rootPath, { recursive: true });
			}



			// Check if we are already in a Gitbbon project (inside Gitbbon_Notes)
			const currentFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (currentFolder && currentFolder.startsWith(this.rootPath)) {
				console.log(`[ProjectManager] Already in Gitbbon project: ${currentFolder}`);

				// Ensure .gitbbon.json exists (for older projects or manually added folders)
				const gitbbonConfigPath = path.join(currentFolder, '.gitbbon.json');
				if (!fs.existsSync(gitbbonConfigPath)) {
					const folderName = path.basename(currentFolder);
					console.log(`[ProjectManager] Creating .gitbbon.json for existing project: ${folderName}`);
					const config = {
						name: folderName,
						createdAt: new Date().toISOString()
					};
					await fs.promises.writeFile(gitbbonConfigPath, JSON.stringify(config, null, 2), 'utf-8');
				}

				console.log('[ProjectManager] Startup completed - already in Gitbbon project');
				return;
			}

			// Scan for existing projects
			const projects = await this.getProjects();
			console.log(`[ProjectManager] Found ${projects.length} projects`);

			if (projects.length > 0) {
				// Open first project
				const firstProject = projects[0];
				console.log(`[ProjectManager] Opening project: ${firstProject.name} (${firstProject.path})`);

				const uri = vscode.Uri.file(firstProject.path);
				await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
			} else {
				// No projects exist, create default
				console.log('[ProjectManager] No projects found, creating default...');
				const defaultDirName = 'gitbbon-note-default';
				const defaultProjectName = 'default';
				const defaultPath = path.join(this.rootPath, defaultDirName);
				await this.initializeProject(defaultPath, defaultProjectName);

				const uri = vscode.Uri.file(defaultPath);
				await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
			}
		} catch (error) {
			console.error('[ProjectManager] Startup failed:', error);
			vscode.window.showErrorMessage(`Gitbbon Project Manager Error: ${error}`);
		}
	}

	/**
	 * Scan Gitbbon_Notes directory for Git repositories
	 */
	public async getProjects(): Promise<{ name: string; path: string }[]> {
		const projects: { name: string; path: string }[] = [];

		if (!fs.existsSync(this.rootPath)) {
			return projects;
		}

		const entries = await fs.promises.readdir(this.rootPath, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const projectPath = path.join(this.rootPath, entry.name);
			const gitPath = path.join(projectPath, '.git');

			if (fs.existsSync(gitPath)) {
				// Read project name from .gitbbon.json if exists
				const gitbbonConfigPath = path.join(projectPath, '.gitbbon.json');
				let projectName = entry.name;

				if (fs.existsSync(gitbbonConfigPath)) {
					try {
						const configContent = await fs.promises.readFile(gitbbonConfigPath, 'utf-8');
						const config = JSON.parse(configContent);
						if (config.name) {
							projectName = config.name;
						}
					} catch (e) {
						console.warn(`[ProjectManager] Failed to read .gitbbon.json for ${entry.name}:`, e);
					}
				}

				projects.push({ name: projectName, path: projectPath });
			}
		}

		return projects;
	}

	/**
	 * Read .gitbbon.json config from a project directory
	 */
	public async readProjectConfig(projectPath: string): Promise<{ name: string; createdAt?: string; lastModified?: string } | null> {
		const configPath = path.join(projectPath, '.gitbbon.json');
		if (!fs.existsSync(configPath)) {
			return null;
		}
		try {
			const content = await fs.promises.readFile(configPath, 'utf-8');
			return JSON.parse(content);
		} catch (e) {
			console.warn(`[ProjectManager] Failed to read .gitbbon.json at ${projectPath}:`, e);
			return null;
		}
	}

	/**
	 * Write .gitbbon.json config to a project directory
	 */
	public async writeProjectConfig(projectPath: string, config: { name: string; createdAt?: string; lastModified?: string }): Promise<void> {
		const configPath = path.join(projectPath, '.gitbbon.json');
		await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
		console.log(`[ProjectManager] Updated .gitbbon.json at ${projectPath}`);
	}

	/**
	 * Get the path to .gitbbon-local.json (local-only metadata)
	 */
	private getLocalConfigPath(): string {
		return path.join(this.rootPath, '.gitbbon-local.json');
	}

	/**
	 * Read .gitbbon-local.json (local-only sync metadata)
	 */
	public async readLocalConfig(): Promise<{ projects: Record<string, { syncedAt: string | null }> }> {
		const configPath = this.getLocalConfigPath();
		if (!fs.existsSync(configPath)) {
			return { projects: {} };
		}
		try {
			const content = await fs.promises.readFile(configPath, 'utf-8');
			return JSON.parse(content);
		} catch (e) {
			console.warn('[ProjectManager] Failed to read .gitbbon-local.json:', e);
			return { projects: {} };
		}
	}

	/**
	 * Write .gitbbon-local.json (local-only sync metadata)
	 */
	public async writeLocalConfig(config: { projects: Record<string, { syncedAt: string | null }> }): Promise<void> {
		const configPath = this.getLocalConfigPath();
		await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
		console.log('[ProjectManager] Updated .gitbbon-local.json');
	}

	/**
	 * Update syncedAt for a specific project
	 */
	public async updateSyncedAt(repoName: string): Promise<void> {
		const config = await this.readLocalConfig();
		config.projects[repoName] = { syncedAt: new Date().toISOString() };
		await this.writeLocalConfig(config);
		console.log(`[ProjectManager] Updated syncedAt for ${repoName}`);
	}

	/**
	 * Get syncedAt for a specific project
	 */
	public async getSyncedAt(repoName: string): Promise<string | null> {
		const config = await this.readLocalConfig();
		return config.projects[repoName]?.syncedAt ?? null;
	}

	/**
	 * Remove project from local config
	 */
	public async removeFromLocalConfig(repoName: string): Promise<void> {
		const config = await this.readLocalConfig();
		delete config.projects[repoName];
		await this.writeLocalConfig(config);
		console.log(`[ProjectManager] Removed ${repoName} from .gitbbon-local.json`);
	}

	private async initializeProject(projectPath: string, projectName: string): Promise<void> {
		console.log(`[ProjectManager] Initializing project: ${projectName} at ${projectPath}`);

		// 1. Create Directory
		if (!fs.existsSync(projectPath)) {
			console.log(`[ProjectManager] Creating project directory: ${projectPath}`);
			await fs.promises.mkdir(projectPath, { recursive: true });
		} else {
			console.log(`[ProjectManager] Project directory already exists: ${projectPath}`);
		}

		// 2. Git Init
		const gitPath = path.join(projectPath, '.git');
		if (!fs.existsSync(gitPath)) {
			console.log(`[ProjectManager] Initializing git repository...`);
			// Now that git is in PATH (injected by main process), we can just use simple exec
			await new Promise<void>((resolve, reject) => {
				cp.exec('git init', { cwd: projectPath }, (err, stdout, stderr) => {
					if (err) {
						console.error('[ProjectManager] Git init failed:', err);
						if (stderr) { console.error('[ProjectManager] Git stderr:', stderr); }
						// Non-fatal, continue
					} else {
						console.log('[ProjectManager] Git repository initialized successfully');
						if (stdout) { console.log('[ProjectManager] Git stdout:', stdout); }
					}
					resolve();
				});
			});
		} else {
			console.log(`[ProjectManager] Git repository already exists`);
		}

		// 3. Create .gitbbon.json (프로젝트 설정 파일)
		const gitbbonConfigPath = path.join(projectPath, '.gitbbon.json');
		if (!fs.existsSync(gitbbonConfigPath)) {
			console.log(`[ProjectManager] Creating .gitbbon.json...`);
			const config = {
				name: projectName,
				createdAt: new Date().toISOString()
			};
			await fs.promises.writeFile(gitbbonConfigPath, JSON.stringify(config, null, 2), 'utf-8');
			console.log(`[ProjectManager] .gitbbon.json created`);
		} else {
			console.log(`[ProjectManager] .gitbbon.json already exists`);
		}

		// 3.5. Create .vscode/settings.json to hide .gitbbon.json from Explorer
		const vscodePath = path.join(projectPath, '.vscode');
		const settingsPath = path.join(vscodePath, 'settings.json');
		if (!fs.existsSync(settingsPath)) {
			console.log(`[ProjectManager] Creating .vscode/settings.json...`);
			if (!fs.existsSync(vscodePath)) {
				await fs.promises.mkdir(vscodePath, { recursive: true });
			}
			const settings = {
				"files.exclude": {
					"**/.gitbbon.json": true,
					".vscode": true
				}
			};
			await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
			console.log(`[ProjectManager] .vscode/settings.json created`);
		} else {
			console.log(`[ProjectManager] .vscode/settings.json already exists`);
		}

		// 4. Create README (Non-destructive)
		const readmePath = path.join(projectPath, 'README.md');
		if (!fs.existsSync(readmePath)) {
			console.log(`[ProjectManager] Creating README.md...`);
			const content = `# ${projectName}\n\nManaged by Gitbbon.\nCreated: ${new Date().toLocaleString()}\n`;
			await fs.promises.writeFile(readmePath, content, 'utf-8');
			console.log(`[ProjectManager] README.md created`);

			// 5. Create initial commit (including .gitbbon.json)
			try {
				console.log('[ProjectManager] Creating initial commit...');
				await this.execGit(['add', '.'], projectPath);
				await this.execGit(['commit', '-m', 'Initial commit'], projectPath);
				console.log('[ProjectManager] ✅ Initial commit created');
			} catch (e) {
				console.warn('[ProjectManager] Failed to create initial commit:', e);
				// Non-fatal, continue
			}
		} else {
			console.log(`[ProjectManager] README.md already exists`);
		}

		console.log(`[ProjectManager] Project initialization completed: ${projectName}`);
	}

	private getLatestProject(manifest: ProjectManifest): Project | undefined {
		return manifest.projects[0];
	}

	/**
	 * Update lastModified in .gitbbon.json for the given project path
	 */
	public async updateLastModified(cwd: string): Promise<void> {
		const config = await this.readProjectConfig(cwd);
		if (config) {
			config.lastModified = new Date().toISOString();
			await this.writeProjectConfig(cwd, config);
			console.log(`[ProjectManager] Updated lastModified for ${config.name}`);
		} else {
			// Create .gitbbon.json if it doesn't exist
			const projectName = path.basename(cwd);
			const newConfig = {
				name: projectName,
				createdAt: new Date().toISOString(),
				lastModified: new Date().toISOString()
			};
			await this.writeProjectConfig(cwd, newConfig);
			console.log(`[ProjectManager] Created .gitbbon.json with lastModified for ${projectName}`);
		}
	}

	/**
	 * @deprecated Use readProjectConfig instead
	 */
	public async getManifest(): Promise<ProjectManifest | null> {
		// Return a virtual manifest built from scanned projects for backward compatibility
		const projects = await this.getProjects();
		return {
			version: 1,
			projects: projects.map((p: { name: string; path: string }) => ({
				name: p.name,
				path: p.path,
				lastOpened: new Date().toISOString()
			}))
		};
	}

	/**
	 * Initialize a new project with .gitbbon.json
	 */
	public async addProject(name: string, projectPath: string): Promise<void> {
		// Just ensure .gitbbon.json exists
		const existingConfig = await this.readProjectConfig(projectPath);
		if (!existingConfig) {
			const config = {
				name,
				createdAt: new Date().toISOString()
			};
			await this.writeProjectConfig(projectPath, config);
			console.log(`[ProjectManager] Added new project: ${name}`);
		}
	}

	/**
	 * Delete project (local folder only since we no longer have a manifest)
	 * @param projectPath Project path to delete
	 * @param deleteFolder If true, deletes local folder
	 * @returns Success status
	 */
	public async deleteProject(projectPath: string, deleteFolder: boolean = true): Promise<boolean> {
		console.log(`[ProjectManager] Deleting project: ${projectPath}, deleteFolder: ${deleteFolder}`);

		try {
			// Delete local folder
			if (deleteFolder && fs.existsSync(projectPath)) {
				await fs.promises.rm(projectPath, { recursive: true, force: true });
				console.log(`[ProjectManager] Deleted project folder: ${projectPath}`);
			}

			return true;
		} catch (error) {
			console.error('[ProjectManager] Failed to delete project:', error);
			return false;
		}
	}

	/**
	 * 프로젝트의 원격 저장소 URL 가져오기
	 * @param projectPath 프로젝트 경로
	 * @returns 원격 URL 또는 null
	 */
	public async getRemoteUrl(projectPath: string): Promise<string | null> {
		try {
			const url = await this.execGit(['remote', 'get-url', 'origin'], projectPath, { silent: true });
			return url || null;
		} catch {
			return null;
		}
	}

	/**
	 * Immediately commit .gitbbon.json changes
	 */
	public async commitProjectConfig(cwd: string): Promise<void> {
		console.log(`[ProjectManager] Committing .gitbbon.json at ${cwd}`);
		try {
			const configPath = path.join(cwd, '.gitbbon.json');
			if (!fs.existsSync(configPath)) {
				console.log('[ProjectManager] .gitbbon.json not found, skipping config commit');
				return;
			}

			// Check if there are changes to .gitbbon.json
			const status = await this.execGit(['status', '--porcelain', '.gitbbon.json'], cwd);
			if (status.trim().length === 0) {
				console.log('[ProjectManager] No changes in .gitbbon.json to commit');
				return;
			}

			await this.execGit(['add', '.gitbbon.json'], cwd);
			await this.execGit(['commit', '-m', 'Update project configuration'], cwd);
			console.log('[ProjectManager] Committed .gitbbon.json');
		} catch (error) {
			console.error('[ProjectManager] Failed to commit .gitbbon.json:', error);
		}
	}

	// =====================================================
	// Git Helper Methods for 3-Layer Save System
	// =====================================================

	/**
	 * Git 명령어 실행 헬퍼
	 * dugite를 사용하여 내장 Git 바이너리로 실행
	 * @param options.silent true일 경우 에러 로그를 출력하지 않음 (예: 브랜치 확인 등)
	 */
	private async execGit(args: string[], cwd: string, options: { silent?: boolean; env?: Record<string, string> } = {}): Promise<string> {
		const dugite = await import('dugite');

		const cmd = `git ${args.join(' ')}`;
		if (!options.silent) {
			console.log(`[ProjectManager] Executing: ${cmd} in ${cwd}`);
		}

		const execOptions = options.env ? { env: { ...process.env, ...options.env } } : undefined;
		const result = await dugite.exec(args, cwd, execOptions);

		if (result.exitCode !== 0) {
			if (!options.silent) {
				console.error(`[ProjectManager] Git command failed: ${cmd}`, result.stderr);
			}
			throw new Error(result.stderr || `Git command exited with code ${result.exitCode}`);
		}

		if (!options.silent) {
			console.log(`[ProjectManager] Git command succeeded: ${cmd}`);
		}
		return result.stdout.trim();
	}

	/**
	 * 현재 브랜치 이름 가져오기
	 */
	private async getCurrentBranch(cwd: string): Promise<string> {
		try {
			// 커밋이 없는 경우(Empty Repo) 에러가 발생하므로 silent: true 처리
			const branch = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, { silent: true });
			console.log(`[ProjectManager] Current branch: ${branch}`);
			return branch;
		} catch {
			// HEAD가 없다는 것은 커밋이 하나도 없다는 뜻 (Empty Repository)
			console.log('[ProjectManager] No HEAD found - creating root commit');
			// 빈 커밋(allow-empty)을 생성하여 HEAD를 만들어줌
			try {
				await this.execGit(['commit', '--allow-empty', '-m', 'root commit'], cwd, { silent: true });
				// 커밋 생성 후 다시 브랜치 이름 조회
				const branch = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
				console.log(`[ProjectManager] Root commit created, current branch: ${branch}`);
				return branch;
			} catch (e) {
				console.warn('[ProjectManager] Failed to create root commit:', e);
				return 'main'; // 그래도 실패하면 기본값 반환
			}
		}
	}

	/**
	 * 변경 사항이 있는지 확인
	 */
	private async hasChanges(cwd: string): Promise<boolean> {
		try {
			const status = await this.execGit(['status', '--porcelain'], cwd);
			const hasChanges = status.length > 0;
			if (hasChanges) {
				const lines = status.split('\n').filter(line => line.trim());
				console.log(`[ProjectManager] Found ${lines.length} changed files`);
			} else {
				console.log(`[ProjectManager] No changes found`);
			}
			return hasChanges;
		} catch (e) {
			console.log(`[ProjectManager] Failed to check changes: ${e}`);
			return false;
		}
	}

	/**
	 * 브랜치 존재 여부 확인 (에러 로그 없이 안전하게 확인)
	 */
	private async branchExists(branchName: string, cwd: string): Promise<boolean> {
		try {
			await this.execGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], cwd, { silent: true });
			console.log(`[ProjectManager] Branch exists: ${branchName}`);
			return true;
		} catch {
			console.log(`[ProjectManager] Branch does not exist: ${branchName}`);
			return false;
		}
	}

	/**
	 * Git diff에서 추가된 텍스트 추출 (처음 등장하는 텍스트 최대 maxLength자)
	 * @param compareRef 비교 대상 ref (auto-save 브랜치). 없으면 HEAD와 비교
	 */
	private async getChangePreview(cwd: string, compareRef?: string, maxLength: number = 20, options: { env?: Record<string, string> } = {}): Promise<string> {
		try {
			// compareRef가 있으면 해당 ref와 비교, 없으면 staged 상태 비교
			const diffArgs = compareRef
				? ['diff', '--cached', '--no-color', compareRef]
				: ['diff', '--cached', '--no-color'];

			// -U0 옵션으로 컨텍스트 라인을 제거하여 파싱 용이성 확보
			diffArgs.push('-U0');

			const diff = await this.execGit(diffArgs, cwd, { silent: true, env: options.env });
			if (!diff) {
				return '';
			}

			const preview = DiffParser.extractChange(diff, maxLength);
			if (preview) {
				console.log(`[ProjectManager] Change preview: "${preview}"`);
				return preview;
			}

			return '';
		} catch (e) {
			console.log(`[ProjectManager] Failed to get change preview: ${e}`);
			return '';
		}
	}

	/**
	 * Auto Commit: auto-save/[현재브랜치] 브랜치에 자동 커밋
	 * 자동 저장 후 호출되어야 함
	 */
	public async autoCommit(): Promise<{ success: boolean; message: string }> {
		console.log('[ProjectManager] Starting auto commit...');
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!cwd) {
			console.log('[ProjectManager] No workspace folder open for auto commit');
			return { success: false, message: 'No workspace folder open' };
		}

		// 임시 인덱스 파일 경로 생성 (사용자 인덱스 보호)
		const tempIndexFile = path.join(cwd, '.git', `index-autosave-${Date.now()}`);
		const env = { 'GIT_INDEX_FILE': tempIndexFile };

		try {
			// 변경 사항 확인 (현재 작업 트리 vs HEAD/Index)
			if (!(await this.hasChanges(cwd))) {
				console.log('[ProjectManager] No changes to auto commit');
				return { success: true, message: 'No changes to commit' };
			}

			const currentBranch = await this.getCurrentBranch(cwd);
			const autoSaveBranch = `auto-save/${currentBranch}`;
			console.log(`[ProjectManager] Auto committing to branch: ${autoSaveBranch}`);

			// 1. Stage all changes (into TEMP index)
			console.log('[ProjectManager] Staging all changes to temp index...');
			await this.execGit(['add', '.'], cwd, { env });

			// 2. auto-save 브랜치 없으면 생성
			if (!(await this.branchExists(autoSaveBranch, cwd))) {
				console.log(`[ProjectManager] Creating auto-save branch: ${autoSaveBranch}`);
				try {
					await this.execGit(['branch', autoSaveBranch], cwd);
				} catch {
					// 브랜치 생성 실패 시 (e.g. HEAD 없음) 직접 커밋
					// getCurrentBranch에서 root commit 보장하므로 거의 발생 안 함
					console.log('[ProjectManager] Branch creation failed, making direct commit');
					const fallbackPreview = await this.getChangePreview(cwd, undefined, 20, { env });
					// 여기서는 임시 인덱스를 사용하여 커밋을 생성해야 하지만,
					// 편의상 branch 실패 케이스는 드물므로 기존 로직 유지하되, env 전달
					// (하지만 commit 명령은 index를 사용하므로 env 전달 필수)
					// 그러나 commit 명령은 porcelain이므로 GIT_INDEX_FILE을 존중하지만
					// 일반적인 flow와 다르므로 일단 env 전달.
					await this.execGit(['commit', '-m', fallbackPreview || '첫 저장'], cwd, { env });
					return { success: true, message: 'Auto commit created (first commit)' };
				}
			}

			// 3. Tree 생성 (from TEMP index)
			console.log('[ProjectManager] Creating git tree...');
			const treeId = await this.execGit(['write-tree'], cwd, { env });

			// 4. auto-save 브랜치의 부모 커밋 가져오기 (이미 존재함이 확인됨)
			let parentCommit: string | null = null;
			if (await this.branchExists(autoSaveBranch, cwd)) {
				parentCommit = await this.execGit(['rev-parse', autoSaveBranch], cwd);
				console.log(`[ProjectManager] Parent commit: ${parentCommit}`);
			}

			// 5. 커밋 메시지 생성 (이전 auto-save 커밋과 비교하여 추가된 텍스트의 처음 20자)
			const compareRef = parentCommit ? autoSaveBranch : undefined;
			// getChangePreview도 temp index를 사용해야 함
			const changePreview = await this.getChangePreview(cwd, compareRef, 20, { env });
			const commitMessage = changePreview || '변경사항 저장';
			console.log(`[ProjectManager] Creating commit with message: ${commitMessage}`);
			let newCommitId: string;
			if (parentCommit) {
				newCommitId = await this.execGit(['commit-tree', treeId, '-p', parentCommit, '-m', commitMessage], cwd);
			} else {
				// 이론상 여기에 도달하면 안 됨 (위에서 생성했으므로)
				newCommitId = await this.execGit(['commit-tree', treeId, '-m', commitMessage], cwd);
			}

			// 6. auto-save 브랜치 ref 업데이트
			console.log(`[ProjectManager] Updating ${autoSaveBranch} ref to ${newCommitId}`);
			await this.execGit(['update-ref', `refs/heads/${autoSaveBranch}`, newCommitId], cwd);

			// 7. Index 초기화 불필요 (Temp Index 사용으로 인해 메인 인덱스 오염 없음)
			// console.log('[ProjectManager] Resetting index after auto commit...');
			// await this.execGit(['reset', '--mixed'], cwd, { silent: true });

			console.log(`[ProjectManager] Auto commit created: ${newCommitId}`);
			// Update lastModified in projects.json
			await this.updateLastModified(cwd);

			return { success: true, message: `Auto commit: ${newCommitId.substring(0, 7)}` };
		} catch (error) {
			console.error('[ProjectManager] Auto commit failed:', error);
			return { success: false, message: `Auto commit failed: ${error}` };
		} finally {
			// 임시 인덱스 파일 삭제
			if (fs.existsSync(tempIndexFile)) {
				try {
					await fs.promises.unlink(tempIndexFile);
				} catch (e) {
					console.warn(`[ProjectManager] Failed to delete temp index file: ${e}`);
				}
			}
		}
	}

	/**
	 * Really Final Commit: 현재 상태를 main 브랜치에 스쿼시 커밋
	 * Plumbing 명령어를 사용하여 체크아웃 없이 수행
	 */
	public async reallyFinalCommit(commitMessage?: string): Promise<{ success: boolean; message: string }> {
		console.log('[ProjectManager] Starting really final commit...');
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!cwd) {
			console.log('[ProjectManager] No workspace folder open for really final commit');
			return { success: false, message: 'No workspace folder open' };
		}

		try {
			const currentBranch = await this.getCurrentBranch(cwd);
			const autoSaveBranch = `auto-save/${currentBranch}`;
			const timestamp = new Date().toLocaleString('ko-KR');

			// 1. Index 갱신 (가장 중요, Auto Save 텀 사이에 변경된 내용 반영)
			console.log('[ProjectManager] Staging all changes for final commit...');
			await this.execGit(['add', '.'], cwd);

			// 1.5. LLM을 사용하여 커밋 메시지 생성 (commitMessage가 제공되지 않은 경우)
			let message = commitMessage;
			if (!message && this.commitMessageGenerator.isConfigured()) {
				console.log('[ProjectManager] Generating commit message using LLM...');
				try {
					// 현재 staged 상태의 diff 가져오기
					const diff = await this.execGit(['diff', '--cached'], cwd, { silent: true });
					const generatedMessage = await this.commitMessageGenerator.generateCommitMessage(diff);
					if (generatedMessage) {
						message = generatedMessage;
						console.log(`[ProjectManager] LLM generated message: ${message}`);
						vscode.window.showInformationMessage(`AI 커밋 메시지: ${message}`);
					} else {
						console.log('[ProjectManager] LLM did not generate a message, using default');
						message = `진짜최종: ${timestamp}`;
					}
				} catch (error) {
					console.error('[ProjectManager] Failed to generate commit message with LLM:', error);
					message = `진짜최종: ${timestamp}`;
				}
			} else if (!message) {
				message = `진짜최종: ${timestamp}`;
			}

			console.log(`[ProjectManager] Really final commit with message: ${message}`);

			// 2. Tree 생성
			console.log('[ProjectManager] Creating git tree for final commit...');
			const treeId = await this.execGit(['write-tree'], cwd);

			// 3. Main 브랜치를 부모로 커밋 생성 (Squash 효과)
			let parentCommit: string | null = null;
			try {
				parentCommit = await this.execGit(['rev-parse', currentBranch], cwd);
				console.log(`[ProjectManager] Parent commit for final: ${parentCommit}`);
			} catch {
				console.log('[ProjectManager] No parent commit found - creating first commit');
				// main이 없으면 (첫 커밋) 부모 없이 생성
			}

			let newCommitId: string;
			if (parentCommit) {
				newCommitId = await this.execGit(['commit-tree', treeId, '-p', parentCommit, '-m', message], cwd);
			} else {
				newCommitId = await this.execGit(['commit-tree', treeId, '-m', message], cwd);
			}

			// 4. Main Ref 이동
			console.log(`[ProjectManager] Updating ${currentBranch} branch to ${newCommitId}`);
			await this.execGit(['update-ref', `refs/heads/${currentBranch}`, newCommitId], cwd);

			// 5. HEAD를 Main으로 변경 (안전을 위해)
			console.log(`[ProjectManager] Setting HEAD to ${currentBranch}`);
			await this.execGit(['symbolic-ref', 'HEAD', `refs/heads/${currentBranch}`], cwd);

			// 6. Index 재설정 (Mixed는 Index를 HEAD에 맞춤. Clean한 상태 유지)
			console.log('[ProjectManager] Resetting index to HEAD...');
			await this.execGit(['reset', '--mixed'], cwd);

			// 7. Autosave 브랜치 삭제 (기존 auto-save 커밋들을 고아 상태로 만듦)
			if (await this.branchExists(autoSaveBranch, cwd)) {
				console.log(`[ProjectManager] Deleting ${autoSaveBranch} branch to orphan auto-save commits`);
				try {
					await this.execGit(['branch', '-D', autoSaveBranch], cwd);
					console.log(`[ProjectManager] ${autoSaveBranch} branch deleted successfully`);
				} catch (error) {
					console.warn(`[ProjectManager] Failed to delete ${autoSaveBranch}:`, error);
					// 삭제 실패해도 진행 (치명적이지 않음)
				}
			} else {
				console.log(`[ProjectManager] ${autoSaveBranch} does not exist, skipping deletion`);
			}

			console.log(`[ProjectManager] Really Final commit created: ${newCommitId}`);
			vscode.window.showInformationMessage(`진짜최종 완료: ${newCommitId.substring(0, 7)}`);
			// Update lastModified in projects.json
			await this.updateLastModified(cwd);

			return { success: true, message: `진짜최종: ${newCommitId.substring(0, 7)}` };
		} catch (error) {
			console.error('[ProjectManager] Really Final commit failed:', error);
			vscode.window.showErrorMessage(`진짜최종 실패: ${error}`);
			return { success: false, message: `Really Final failed: ${error}` };
		}
	}

	public async getRootCommit(cwd: string): Promise<string | null> {
		try {
			// Get root commit hash (requires at least one commit)
			const rootCommit = await this.execGit(['rev-list', '--max-parents=0', 'HEAD'], cwd, { silent: true });
			// If there are multiple root commits (merge of unrelated histories), it returns multiple lines.
			// We take the last one (oldest) as the "true" root usually, or just the first line.
			// Ideally a repo has one root.
			return rootCommit.split('\n')[0].trim();
		} catch (e) {
			console.log('[ProjectManager] No root commit found (empty repo?)');
			return null;
		}
	}

	public async hasRemote(cwd: string): Promise<boolean> {
		try {
			const remotes = await this.execGit(['remote'], cwd, { silent: true });
			return remotes.trim().length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * 지정된 커밋 버전으로 복원 (새로운 커밋 생성)
	 */
	public async restoreToVersion(cwd: string, targetCommitHash: string): Promise<{ success: boolean; message: string }> {
		console.log(`[ProjectManager] Restoring to version: ${targetCommitHash}`);

		try {
			// 1. Safety Check: Uncommitted Changes
			const changed = await this.hasChanges(cwd);
			if (changed) {
				console.log('[ProjectManager] Uncommitted changes detected, creating backup...');
				const backupResult = await this.reallyFinalCommit();
				if (!backupResult.success) {
					throw new Error(`Backup failed: ${backupResult.message}`);
				}
			}

			// 2. Get Target Commit Title
			const targetTitle = await this.execGit(['log', '-1', '--pretty=%s', targetCommitHash], cwd);

			// 3. Read Tree (Restore Content)
			// -u: updates the index and checking out files
			// --reset: performs a merge rather than a hard overwrite if possible, but here we want to match target
			console.log('[ProjectManager] Reading tree...');
			await this.execGit(['read-tree', '-u', '--reset', targetCommitHash], cwd);

			// 4. Create Restore Commit
			console.log('[ProjectManager] Creating restore commit...');
			const restoreMessage = `복원 : ${targetTitle} (${targetCommitHash.substring(0, 7)})`;
			await this.execGit(['commit', '-m', restoreMessage], cwd);

			// 5. Update lastModified
			await this.updateLastModified(cwd);

			return { success: true, message: restoreMessage };

		} catch (error) {
			console.error('[ProjectManager] Restore failed:', error);
			throw error;
		}
	}
}
