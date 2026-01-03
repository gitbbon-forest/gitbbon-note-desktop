/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

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
						vscode.commands.executeCommand('gitbbon.openCommitInMultiDiffEditor', rootUri, message.hash, message.parentHash);
						// 즉시 하이라이트 적용
						this.highlightCommits(message.hash, message.parentHash);
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
			console.error('[GitGraphViewProvider] Failed to load commits:', error);
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
			console.error('[GitGraphViewProvider] Failed to load more commits:', error);
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

		console.log(`[GitGraphViewProvider] Executing: git ${args.join(' ')}`);
		console.log(`[GitGraphViewProvider] Current PATH (first 200 chars): ${(process.env.PATH || '').substring(0, 200)}...`);

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
						console.log('[GitGraphViewProvider] No commits found (empty repository)');
						resolve([]);
						return;
					}

					console.error('[GitGraphViewProvider] Git command failed:', stderr);
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

				console.log(`[GitGraphViewProvider] Loaded ${commits.length} commits`);
				resolve(commits);
			});

			git.on('error', (err) => {
				console.error('[GitGraphViewProvider] Failed to spawn git:', err);
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
