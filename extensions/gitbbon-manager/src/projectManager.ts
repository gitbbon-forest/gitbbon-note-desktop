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
}

interface ProjectManifest {
	version: number;
	projects: Project[];
}

export class ProjectManager {
	private readonly rootPath: string;
	private readonly manifestPath: string;
	private readonly commitMessageGenerator: CommitMessageGenerator;

	constructor() {
		this.rootPath = path.join(os.homedir(), 'Documents', 'Gitbbon_Notes');
		this.manifestPath = path.join(this.rootPath, 'projects.json');
		this.commitMessageGenerator = new CommitMessageGenerator();
	}

	/**
	 * Initialize the Project Manager and ensure a project is open
	 */
	public async startup(): Promise<void> {
		console.log('[ProjectManager] Starting up...');
		try {
			// Ensure root directory exists
			console.log(`[ProjectManager] Checking root directory: ${this.rootPath}`);
			if (!fs.existsSync(this.rootPath)) {
				console.log(`[ProjectManager] Creating root directory: ${this.rootPath}`);
				await fs.promises.mkdir(this.rootPath, { recursive: true });
			}

			// Ensure manifest exists
			console.log('[ProjectManager] Loading project manifest...');
			let manifest = await this.loadManifest();
			if (!manifest) {
				console.log('[ProjectManager] No manifest found, creating default...');
				manifest = await this.createDefaultManifest();
			}
			console.log(`[ProjectManager] Manifest loaded with ${manifest.projects.length} projects`);

			// Check if we are already in a Gitbbon project
			const currentFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (currentFolder) {
				console.log(`[ProjectManager] Current workspace folder: ${currentFolder}`);
				const matchedProject = manifest.projects.find(p => p.path === currentFolder || path.normalize(p.path) === path.normalize(currentFolder));
				if (matchedProject) {
					console.log(`[ProjectManager] Matched current folder to project: ${matchedProject.name}`);
					// Update timestamp
					await this.updateLastOpened(matchedProject.name);
					console.log(`[ProjectManager] Updated lastOpened for project: ${matchedProject.name}`);
					console.log('[ProjectManager] Startup completed - already in Gitbbon project');
					return;
				}
				console.log('[ProjectManager] Current folder is not a Gitbbon project');
			} else {
				console.log('[ProjectManager] No workspace folder open');
			}

			// If no project open, or random folder open, switch to latest project
			const latestProject = this.getLatestProject(manifest);
			if (latestProject) {
				console.log(`[ProjectManager] Opening latest project: ${latestProject.name} (${latestProject.path})`);

				// Ensure the directory actually exists (in case user deleted it)
				if (!fs.existsSync(latestProject.path)) {
					console.warn(`[ProjectManager] Project path not found: ${latestProject.path}. Re-initializing...`);
					await this.initializeProject(latestProject.path, latestProject.name);
					console.log('[ProjectManager] Project re-initialized');
				}

				console.log('[ProjectManager] Switching to latest project...');
				const uri = vscode.Uri.file(latestProject.path);
				// Force open in same window
				await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
			} else {
				console.warn('[ProjectManager] No projects found in manifest');
			}
		} catch (error) {
			console.error('[ProjectManager] Startup failed:', error);
			vscode.window.showErrorMessage(`Gitbbon Project Manager Error: ${error}`);
		}
	}

	private async loadManifest(): Promise<ProjectManifest | null> {
		console.log(`[ProjectManager] Loading manifest from: ${this.manifestPath}`);
		if (fs.existsSync(this.manifestPath)) {
			try {
				const content = await fs.promises.readFile(this.manifestPath, 'utf-8');
				const manifest = JSON.parse(content) as ProjectManifest;
				console.log(`[ProjectManager] Manifest loaded successfully`);
				return manifest;
			} catch (e) {
				console.error('[ProjectManager] Failed to parse projects.json:', e);
				return null;
			}
		}
		console.log('[ProjectManager] Manifest file does not exist');
		return null;
	}

	private async saveManifest(manifest: ProjectManifest): Promise<void> {
		console.log(`[ProjectManager] Saving manifest with ${manifest.projects.length} projects`);
		await fs.promises.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
		console.log('[ProjectManager] Manifest saved successfully');
	}

	private async createDefaultManifest(): Promise<ProjectManifest> {
		console.log('[ProjectManager] Creating default manifest...');
		const defaultName = 'default';
		const defaultPath = path.join(this.rootPath, defaultName);
		console.log(`[ProjectManager] Default project path: ${defaultPath}`);

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
		console.log('[ProjectManager] Default manifest created');
		return manifest;
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
						if (stderr) console.error('[ProjectManager] Git stderr:', stderr);
						// Non-fatal, continue
					} else {
						console.log('[ProjectManager] Git repository initialized successfully');
						if (stdout) console.log('[ProjectManager] Git stdout:', stdout);
					}
					resolve();
				});
			});
		} else {
			console.log(`[ProjectManager] Git repository already exists`);
		}

		// 3. Create README (Non-destructive)
		const readmePath = path.join(projectPath, 'README.md');
		if (!fs.existsSync(readmePath)) {
			console.log(`[ProjectManager] Creating README.md...`);
			const content = `# ${projectName}\n\nManaged by Gitbbon.\nCreated: ${new Date().toLocaleString()}\n`;
			await fs.promises.writeFile(readmePath, content, 'utf-8');
			console.log(`[ProjectManager] README.md created`);
		} else {
			console.log(`[ProjectManager] README.md already exists`);
		}

		console.log(`[ProjectManager] Project initialization completed: ${projectName}`);
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
		console.log(`[ProjectManager] Updating lastOpened for project: ${projectName}`);
		const manifest = await this.loadManifest();
		if (manifest) {
			const project = manifest.projects.find(p => p.name === projectName);
			if (project) {
				const oldTimestamp = project.lastOpened;
				project.lastOpened = new Date().toISOString();
				await this.saveManifest(manifest);
				console.log(`[ProjectManager] Updated timestamp for ${projectName}: ${oldTimestamp} -> ${project.lastOpened}`);
			} else {
				console.warn(`[ProjectManager] Project not found for timestamp update: ${projectName}`);
			}
		} else {
			console.error('[ProjectManager] Failed to load manifest for timestamp update');
		}
	}

	// =====================================================
	// Git Helper Methods for 3-Layer Save System
	// =====================================================

	/**
	 * Git 명령어 실행 헬퍼
	 * spawn을 사용하여 인자를 안전하게 전달 (따옴표 이스케이프 문제 해결)
	 * @param options.silent true일 경우 에러 로그를 출력하지 않음 (예: 브랜치 확인 등)
	 */
	private execGit(args: string[], cwd: string, options: { silent?: boolean } = {}): Promise<string> {
		return new Promise((resolve, reject) => {
			const cmd = `git ${args.join(' ')}`;
			if (!options.silent) {
				console.log(`[ProjectManager] Executing: ${cmd} in ${cwd}`);
			}
			const child = cp.spawn('git', args, { cwd });
			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (data) => {
				const chunk = data.toString();
				stdout += chunk;
				if (!options.silent && stdout.trim()) {
					// Show first line of output for visibility
					const lines = chunk.trim().split('\n');
					if (lines.length > 0 && lines[0]) {
						console.log(`[ProjectManager] Git stdout: ${lines[0]}`);
					}
				}
			});

			child.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			child.on('close', (code) => {
				if (code !== 0) {
					if (!options.silent) {
						console.error(`[ProjectManager] Git command failed: ${cmd}`, stderr);
					}
					reject(new Error(stderr || `Git command exited with code ${code}`));
				} else {
					if (!options.silent) {
						console.log(`[ProjectManager] Git command succeeded: ${cmd}`);
					}
					resolve(stdout.trim());
				}
			});

			child.on('error', (err) => {
				if (!options.silent) {
					console.error(`[ProjectManager] Git command error: ${cmd}`, err);
				}
				reject(err);
			});
		});
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
	private async getChangePreview(cwd: string, compareRef?: string, maxLength: number = 20): Promise<string> {
		try {
			// compareRef가 있으면 해당 ref와 비교, 없으면 staged 상태 비교
			const diffArgs = compareRef
				? ['diff', '--cached', '--no-color', compareRef]
				: ['diff', '--cached', '--no-color'];

			// -U0 옵션으로 컨텍스트 라인을 제거하여 파싱 용이성 확보
			diffArgs.push('-U0');

			const diff = await this.execGit(diffArgs, cwd, { silent: true });
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

		try {
			// 변경 사항 확인
			if (!(await this.hasChanges(cwd))) {
				console.log('[ProjectManager] No changes to auto commit');
				return { success: true, message: 'No changes to commit' };
			}

			const currentBranch = await this.getCurrentBranch(cwd);
			const autoSaveBranch = `auto-save/${currentBranch}`;
			console.log(`[ProjectManager] Auto committing to branch: ${autoSaveBranch}`);

			// 1. Stage all changes
			console.log('[ProjectManager] Staging all changes...');
			await this.execGit(['add', '.'], cwd);

			// 2. auto-save 브랜치 없으면 생성
			if (!(await this.branchExists(autoSaveBranch, cwd))) {
				console.log(`[ProjectManager] Creating auto-save branch: ${autoSaveBranch}`);
				try {
					await this.execGit(['branch', autoSaveBranch], cwd);
				} catch {
					// 브랜치 생성 실패 시 (e.g. HEAD 없음) 직접 커밋
					// getCurrentBranch에서 root commit 보장하므로 거의 발생 안 함
					console.log('[ProjectManager] Branch creation failed, making direct commit');
					const fallbackPreview = await this.getChangePreview(cwd);
					await this.execGit(['commit', '-m', fallbackPreview || '첫 저장'], cwd);
					return { success: true, message: 'Auto commit created (first commit)' };
				}
			}

			// 3. Tree 생성
			console.log('[ProjectManager] Creating git tree...');
			const treeId = await this.execGit(['write-tree'], cwd);

			// 4. auto-save 브랜치의 부모 커밋 가져오기 (이미 존재함이 확인됨)
			let parentCommit: string | null = null;
			if (await this.branchExists(autoSaveBranch, cwd)) {
				parentCommit = await this.execGit(['rev-parse', autoSaveBranch], cwd);
				console.log(`[ProjectManager] Parent commit: ${parentCommit}`);
			}

			// 5. 커밋 메시지 생성 (이전 auto-save 커밋과 비교하여 추가된 텍스트의 처음 20자)
			const compareRef = parentCommit ? autoSaveBranch : undefined;
			const changePreview = await this.getChangePreview(cwd, compareRef);
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

			// 7. Index 초기화 (plumbing 명령어는 index를 건드리지 않으므로 수동 정리)
			// git reset --mixed: index를 HEAD에 맞추고, working directory는 유지
			console.log('[ProjectManager] Resetting index after auto commit...');
			await this.execGit(['reset', '--mixed'], cwd, { silent: true });

			console.log(`[ProjectManager] Auto commit created: ${newCommitId}`);
			return { success: true, message: `Auto commit: ${newCommitId.substring(0, 7)}` };
		} catch (error) {
			console.error('[ProjectManager] Auto commit failed:', error);
			return { success: false, message: `Auto commit failed: ${error}` };
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
			return { success: true, message: `진짜최종: ${newCommitId.substring(0, 7)}` };
		} catch (error) {
			console.error('[ProjectManager] Really Final commit failed:', error);
			vscode.window.showErrorMessage(`진짜최종 실패: ${error}`);
			return { success: false, message: `Really Final failed: ${error}` };
		}
	}
}
