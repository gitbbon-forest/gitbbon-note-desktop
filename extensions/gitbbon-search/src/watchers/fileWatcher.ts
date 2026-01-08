/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { searchService } from '../services/searchService.js';

/**
 * 파일 감시자
 * *.md 파일 변경 감지 및 인덱스 업데이트
 */
export class FileWatcher implements vscode.Disposable {
	private watcher: vscode.FileSystemWatcher;
	private debounceTimers = new Map<string, NodeJS.Timeout>();
	private readonly DEBOUNCE_MS = 500;

	constructor(private readonly onIndexUpdate: (uri?: vscode.Uri) => void) {
		this.watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

		this.watcher.onDidChange(this.handleChange.bind(this));
		this.watcher.onDidCreate(this.handleCreate.bind(this));
		this.watcher.onDidDelete(this.handleDelete.bind(this));

		console.log('[FileWatcher] Watching **/*.md files');
	}

	/**
	 * 파일 변경 처리 (debounce 적용)
	 * NOTE: 인덱싱은 Webview에서 처리
	 */
	private handleChange(uri: vscode.Uri): void {
		this.debounce(uri, async () => {
			const now = new Date().toISOString();
			console.log(`[FileWatcher] ⚠️ File changed at ${now}: ${uri.fsPath}`);
			// TODO: Webview에 인덱싱 요청 메시지 전송
			this.onIndexUpdate(uri);
		});
	}

	/**
	 * 파일 생성 처리
	 * NOTE: 인덱싱은 Webview에서 처리
	 */
	private handleCreate(uri: vscode.Uri): void {
		this.debounce(uri, async () => {
			console.log(`[FileWatcher] File created: ${uri.fsPath} - index needed`);
			// TODO: Webview에 인덱싱 요청 메시지 전송
			this.onIndexUpdate(uri);
		});
	}

	/**
	 * 파일 삭제 처리
	 */
	private handleDelete(uri: vscode.Uri): void {
		this.debounce(uri, async () => {
			console.log(`[FileWatcher] File deleted: ${uri.fsPath}`);
			await searchService.removeFile(uri);
			await searchService.saveToStorage();
			this.onIndexUpdate();
		});
	}

	/**
	 * Debounce 처리
	 */
	private debounce(uri: vscode.Uri, action: () => Promise<void>): void {
		const key = uri.fsPath;

		// 기존 타이머 취소
		const existing = this.debounceTimers.get(key);
		if (existing) {
			clearTimeout(existing);
		}

		// 새 타이머 설정
		const timer = setTimeout(() => {
			this.debounceTimers.delete(key);
			action().catch(console.error);
		}, this.DEBOUNCE_MS);

		this.debounceTimers.set(key, timer);
	}

	dispose(): void {
		this.watcher.dispose();
		this.debounceTimers.forEach(timer => clearTimeout(timer));
		this.debounceTimers.clear();
	}
}

/**
 * Git API 이벤트 감시자
 * git pull/checkout/merge 등 감지
 */
export class GitWatcher implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];

	constructor(private readonly onGitChange: () => Promise<void>) {
		this.init();
	}

	private init(): void {
		// Git 확장 API 가져오기
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (!gitExtension) {
			console.log('[GitWatcher] Git extension not found');
			return;
		}

		if (!gitExtension.isActive) {
			gitExtension.activate().then(() => this.setupWatcher(gitExtension.exports));
		} else {
			this.setupWatcher(gitExtension.exports);
		}
	}

	private setupWatcher(gitExtensionExports: { getAPI: (version: number) => GitAPI }): void {
		try {
			const api = gitExtensionExports.getAPI(1);

			// 기존 리포지토리 감시
			api.repositories.forEach(repo => this.watchRepository(repo));

			// 새 리포지토리 추가 시 감시
			this.disposables.push(
				api.onDidOpenRepository(repo => this.watchRepository(repo))
			);

			console.log(`[GitWatcher] Watching ${api.repositories.length} repositories`);
		} catch (error) {
			console.error('[GitWatcher] Failed to setup:', error);
		}
	}

	private watchRepository(repo: GitRepository): void {
		// git status 변경 감지 (pull/checkout/merge 등)
		const disposable = repo.state.onDidChange(() => {
			console.log('[GitWatcher] Git state changed');
			this.onGitChange().catch(console.error);
		});
		this.disposables.push(disposable);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}

// Git API 타입 정의 (vscode.git 확장)
interface GitAPI {
	repositories: GitRepository[];
	onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
	state: {
		onDidChange: vscode.Event<void>;
	};
}
