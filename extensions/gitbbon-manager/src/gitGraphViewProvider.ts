/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { logService } from './services/logService';

/**
 * 커밋 정보 인터페이스
 */
interface CommitInfo {
	hash: string;
	shortHash: string;
	parents: string[];
	message: string;
	author: string;
	date: string;
	refs: string[];
}

/**
 * Git Graph View Provider
 * Explorer 사이드바에 Git 히스토리 그래프를 표시하는 webview provider
 */
export class GitGraphViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.gitGraph';

	private _view?: vscode.WebviewView;
	private _commits: CommitInfo[] = [];
	private _isLoading = false;
	private _hasMore = true;

	// 페이지네이션 설정
	private static readonly INITIAL_LOAD_COUNT = 100;
	private static readonly LOAD_MORE_COUNT = 50;

	constructor(
		private readonly _extensionUri: vscode.Uri
	) { }

	/**
	 * Webview View 초기화
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media')
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// 메시지 핸들러
		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'ready':
					await this._loadInitialCommits();
					break;
				case 'loadMore':
					await this._loadMoreCommits();
					break;
				case 'refresh':
					await this.refresh();
					break;
				case 'commitClick':
					// 커밋 클릭 시 Multi Diff Editor 열기
					if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
						const rootUri = vscode.workspace.workspaceFolders[0].uri;
						// gitbbon custom: Issue #140 - 대용량/다수 파일 lazy load (성능 개선)
						const shouldOpen = await this._checkDiffLazyLoad(rootUri.fsPath, message.hash, message.parentHash);
						if (shouldOpen) {
							vscode.commands.executeCommand('gitbbon.openCommitInMultiDiffEditor', rootUri, message.hash, message.parentHash);
							// 즉시 하이라이트 적용
							this.highlightCommits(message.hash, message.parentHash);
						}
					}
					break;
			}
		});

		// 뷰가 보일 때 자동 로드
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible && this._commits.length === 0) {
				this._loadInitialCommits();
			}
		});
	}

	/**
	 * 그래프 데이터를 새로고침합니다.
	 * 외부(Extension)에서 호출할 수 있도록 public으로 공개
	 */
	public async refresh(): Promise<void> {
		this._commits = [];
		this._hasMore = true;
		await this._loadInitialCommits();
	}

	/**
	 * Highlight specific commits in the graph
	 * @param commitHash The main commit to highlight (current selection)
	 * @param compareHash The comparison target commit to highlight
	 */
	public highlightCommits(commitHash: string, compareHash?: string): void {
		this._view?.webview.postMessage({
			type: 'highlight',
			hash: commitHash,
			compareHash: compareHash
		});
	}

	/**
	 * Clear all highlights in the graph
	 */
	public clearHighlights(): void {
		this._view?.webview.postMessage({
			type: 'clearHighlight'
		});
	}

	/**
	 * 초기 커밋 로드
	 */
	private async _loadInitialCommits(): Promise<void> {
		if (this._isLoading) { return; }
		this._isLoading = true;

		try {
			const commits = await this._getCommitHistory(0, GitGraphViewProvider.INITIAL_LOAD_COUNT);
			this._commits = commits;
			this._hasMore = commits.length === GitGraphViewProvider.INITIAL_LOAD_COUNT;
			this._sendCommitsToWebview();
		} catch (error) {
			logService.error('[GitGraphViewProvider] Failed to load commits:', error);
			this._view?.webview.postMessage({
				type: 'error',
				message: `커밋 로드 실패: ${error}`
			});
		} finally {
			this._isLoading = false;
		}
	}

	/**
	 * 추가 커밋 로드 (스크롤 시)
	 */
	private async _loadMoreCommits(): Promise<void> {
		if (this._isLoading || !this._hasMore) { return; }
		this._isLoading = true;

		try {
			const skip = this._commits.length;
			const commits = await this._getCommitHistory(skip, GitGraphViewProvider.LOAD_MORE_COUNT);
			this._commits.push(...commits);
			this._hasMore = commits.length === GitGraphViewProvider.LOAD_MORE_COUNT;
			this._sendCommitsToWebview();
		} catch (error) {
			logService.error('[GitGraphViewProvider] Failed to load more commits:', error);
		} finally {
			this._isLoading = false;
		}
	}

	/**
	 * Webview로 커밋 데이터 전송
	 */
	private _sendCommitsToWebview(): void {
		this._view?.webview.postMessage({
			type: 'commits',
			commits: this._commits,
			hasMore: this._hasMore
		});
	}

	/**
	 * Git 커밋 히스토리 조회
	 */
	private async _getCommitHistory(skip: number, count: number): Promise<CommitInfo[]> {
		const cp = await import('child_process');
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!cwd) {
			return [];
		}

		// format: hash|shortHash|parents|message|author|date|refs
		const format = '%H|%h|%P|%s|%an|%aI|%D';
		const args = [
			'log',
			'--all',
			'-n', `${count}`,
			`--skip=${skip}`,
			`--format=${format}`
		];

		logService.info(`[GitGraphViewProvider] Executing: git ${args.join(' ')}`);
		logService.info(`[GitGraphViewProvider] Current PATH (first 200 chars): ${(process.env.PATH || '').substring(0, 200)}...`);

		return new Promise((resolve, reject) => {
			const git = cp.spawn('git', args, { cwd });
			let stdout = '';
			let stderr = '';

			git.stdout.on('data', (data) => { stdout += data.toString(); });
			git.stderr.on('data', (data) => { stderr += data.toString(); });

			git.on('close', (code) => {
				if (code !== 0) {
					// 저장소가 비어있거나 커밋이 없는 경우 (exit code 128)
					if (stderr.includes('does not have any commits') || stderr.includes('fatal: your current branch')) {
						logService.info('[GitGraphViewProvider] No commits found (empty repository)');
						resolve([]);
						return;
					}

					logService.error('[GitGraphViewProvider] Git command failed:', stderr);
					reject(new Error(stderr));
					return;
				}

				const commits: CommitInfo[] = [];
				const lines = stdout.trim().split('\n').filter(line => line);

				for (const line of lines) {
					const parts = line.split('|');
					if (parts.length >= 6) {
						commits.push({
							hash: parts[0],
							shortHash: parts[1],
							parents: parts[2] ? parts[2].split(' ') : [],
							message: parts[3],
							author: parts[4],
							date: parts[5],
							refs: parts[6] ? parts[6].split(', ').filter(r => r) : []
						});
					}
				}

				logService.info(`[GitGraphViewProvider] Loaded ${commits.length} commits`);
				resolve(commits);
			});

			git.on('error', (err) => {
				logService.error('[GitGraphViewProvider] Failed to spawn git:', err);
				reject(err);
			});
		});
	}

	/**
	 * Webview HTML 생성
	 */
	private _getHtmlForWebview(webview: vscode.Webview): string {
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'gitGraph.css')
		);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'gitGraph.js')
		);

		const nonce = this._getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet">
	<title>Git Graph</title>
</head>
<body>

	<div id="graph-container">
		<div id="loading">Loading commits...</div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	// gitbbon custom: Issue #140 - 대용량/다수 파일 lazy load 사전 검사
	// 파일 수 또는 크기가 임계값 초과 시 사용자 확인 후 diff 로드 여부 결정
	private static readonly MAX_FILES_AUTO_LOAD = 50;        // 자동 로드 허용 최대 파일 수
	private static readonly MAX_FILE_SIZE_AUTO_LOAD = 51200;  // 자동 로드 허용 최대 단일 파일 크기 (50KB)

	/**
	 * diff 로드 전 파일 수 / 크기를 검사하여 사용자 확인이 필요한 경우 다이얼로그를 표시합니다.
	 * @returns diff를 열어야 하면 true, 취소하면 false
	 */
	private async _checkDiffLazyLoad(cwd: string, hash: string, parentHash?: string): Promise<boolean> {
		const cp = await import('child_process');

		// 변경 파일 목록 (파일명 + 크기) 빠르게 조회
		const diffRange = parentHash ? `${parentHash}..${hash}` : `${hash}^..${hash}`;

		logService.info(`[debug:#140] Checking diff lazy load for range: ${diffRange}`);

		return new Promise((resolve) => {
			// --diff-filter=ACDMRT: 바이너리 등 제외하고 실제 변경 파일만 조회
			cp.exec(
				`git diff --name-only ${diffRange}`,
				{ cwd, maxBuffer: 1024 * 1024 },
				async (err, stdout) => {
					if (err) {
						logService.warn(`[debug:#140] Failed to get file list for lazy load check: ${err.message}`);
						// 오류 시 그냥 열기
						resolve(true);
						return;
					}

					const files = stdout.trim().split('\n').filter(f => f);
					const fileCount = files.length;
					logService.info(`[debug:#140] Changed file count: ${fileCount}`);

					// 파일 수 임계값 초과 시 사용자 확인
					if (fileCount > GitGraphViewProvider.MAX_FILES_AUTO_LOAD) {
						logService.info(`[debug:#140] File count (${fileCount}) exceeds threshold (${GitGraphViewProvider.MAX_FILES_AUTO_LOAD}), showing confirmation`);
						const answer = await vscode.window.showWarningMessage(
							`이 커밋에는 변경된 파일이 ${fileCount}개 있습니다. 한번에 로드하면 성능이 저하될 수 있습니다. diff를 열겠습니까?`,
							{ modal: false },
							'diff 보기',
							'취소'
						);
						resolve(answer === 'diff 보기');
						return;
					}

					// 파일 크기 검사 (대용량 파일 존재 여부)
					const largeFiles = await this._findLargeFiles(cwd, files, hash, parentHash);
					if (largeFiles.length > 0) {
						const sizeKB = Math.round(GitGraphViewProvider.MAX_FILE_SIZE_AUTO_LOAD / 1024);
						logService.info(`[debug:#140] Large files detected: ${largeFiles.join(', ')}`);
						const answer = await vscode.window.showWarningMessage(
							`크기가 ${sizeKB}KB를 초과하는 파일이 ${largeFiles.length}개 있습니다 (${largeFiles.slice(0, 3).join(', ')}${largeFiles.length > 3 ? ' 외 ...' : ''}). diff를 열겠습니까?`,
							{ modal: false },
							'diff 보기',
							'취소'
						);
						resolve(answer === 'diff 보기');
						return;
					}

					// 임계값 이하 → 바로 열기
					logService.info(`[debug:#140] File count and sizes within threshold, opening diff`);
					resolve(true);
				}
			);
		});
	}

	/**
	 * 주어진 파일 목록 중 크기 임계값을 초과하는 파일을 찾습니다.
	 */
	private async _findLargeFiles(cwd: string, files: string[], hash: string, parentHash?: string): Promise<string[]> {
		const cp = await import('child_process');
		const largeFiles: string[] = [];

		// git cat-file -s {hash}:{file} 로 파일 크기 조회
		const ref = hash;
		for (const file of files) {
			try {
				const size = await new Promise<number>((resolve) => {
					cp.exec(
						`git cat-file -s ${ref}:"${file}"`,
						{ cwd },
						(err, stdout) => {
							if (err) {
								resolve(0);
							} else {
								resolve(parseInt(stdout.trim(), 10) || 0);
							}
						}
					);
				});
				logService.info(`[debug:#140] File size check: ${file} = ${size} bytes`);
				if (size > GitGraphViewProvider.MAX_FILE_SIZE_AUTO_LOAD) {
					largeFiles.push(file);
				}
			} catch {
				// 파일 크기 조회 실패 시 무시
			}
		}

		return largeFiles;
	}

	/**
	 * Nonce 생성 (CSP용)
	 */
	private _getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
