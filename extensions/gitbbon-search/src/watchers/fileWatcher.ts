/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { searchService } from '../services/searchService.js';
import { vectorStorageService } from '../services/vectorStorageService.js';

/**
 * 파일 감시자
 * *.md 파일 변경 감지 및 인덱스 업데이트
 */
export class FileWatcher implements vscode.Disposable {
	private watcher: vscode.FileSystemWatcher;
	private pendingUris = new Set<string>();
	private debounceTimer: NodeJS.Timeout | null = null;
	private readonly DEBOUNCE_MS = 1000; // 배치 처리를 위해 시간 증가

	constructor(private readonly onIndexUpdate: (uris: vscode.Uri[]) => void) {
		this.watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

		this.watcher.onDidChange(this.handleFileChange.bind(this));
		this.watcher.onDidCreate(this.handleFileChange.bind(this));
		this.watcher.onDidDelete(this.handleDelete.bind(this));

		console.log('[gitbbon-search][fileWatcher] Watching **/*.md files');
	}

	/**
	 * 파일 변경/생성 처리 (배치 적용)
	 */
	private handleFileChange(uri: vscode.Uri): void {
		this.pendingUris.add(uri.fsPath);
		this.scheduleBatch();
	}

	/**
	 * 파일 삭제 처리
	 */
	private handleDelete(uri: vscode.Uri): void {
		// 삭제는 즉시 처리하거나 별도로 처리 (지금은 기존 로직 유지하되 즉시 실행)
		// 삭제된 파일이 pending에 있으면 제거
		if (this.pendingUris.has(uri.fsPath)) {
			this.pendingUris.delete(uri.fsPath);
		}

		console.log(`[gitbbon-search][fileWatcher] File deleted: ${uri.fsPath}`);
		searchService.removeFile(uri).then(() => {
			vectorStorageService.deleteVectorData(uri);
			searchService.debouncedSave();
		});
	}

	/**
	 * 배치 처리 스케줄링
	 */
	private scheduleBatch(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.processBatch();
		}, this.DEBOUNCE_MS);
	}

	/**
	 * 배치 실행
	 */
	private processBatch(): void {
		if (this.pendingUris.size === 0) {
			return;
		}

		const uris = Array.from(this.pendingUris).map(fsPath => vscode.Uri.file(fsPath));
		this.pendingUris.clear();
		this.debounceTimer = null;

		console.log(`[gitbbon-search][fileWatcher] Batch processing ${uris.length} files`);
		this.onIndexUpdate(uris);
	}

	dispose(): void {
		this.watcher.dispose();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.pendingUris.clear();
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
			console.log('[gitbbon-search][gitWatcher] Git extension not found');
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

			console.log(`[gitbbon-search][gitWatcher] Watching ${api.repositories.length} repositories`);
		} catch (error) {
			console.error('[gitbbon-search][gitWatcher] Failed to setup:', error);
		}
	}

	private watchRepository(repo: GitRepository): void {
		// git status 변경 감지 (pull/checkout/merge 등)
		const disposable = repo.state.onDidChange(() => {
			console.log('[gitbbon-search][gitWatcher] Git state changed');
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
