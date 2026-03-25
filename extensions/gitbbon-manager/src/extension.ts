/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import 'source-map-support/register';
import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { GitGraphViewProvider } from './gitGraphViewProvider';
import { GitHubSyncManager } from './githubSyncManager';
import * as cp from 'child_process';
import { logService } from './services/logService';

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	logService.init();
	logService.info('Gitbbon Manager extension activating...');
	const projectManager = new ProjectManager(context);
	const githubSyncManager = new GitHubSyncManager(projectManager);

	// Register Git Graph View Provider
	const gitGraphProvider = new GitGraphViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(GitGraphViewProvider.viewType, gitGraphProvider)
	);

	// Watch .gitbbon.json and commit immediately
	const configWatcher = vscode.workspace.createFileSystemWatcher('**/.gitbbon.json');
	const handleConfigChange = async (uri: vscode.Uri) => {
		logService.info('.gitbbon.json changed/created:', uri.fsPath);
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (folder) {
			await projectManager.commitProjectConfig(folder.uri.fsPath);
			// Push changes if possible (Silent sync)
			logService.info('Triggering sync after .gitbbon.json update...');
			await githubSyncManager.sync(true);
			await gitGraphProvider.refresh();
		}
	};

	configWatcher.onDidChange(handleConfigChange);
	configWatcher.onDidCreate(handleConfigChange);
	context.subscriptions.push(configWatcher);

	// Register initialize command (manual trigger)
	const initializeCommand = vscode.commands.registerCommand(
		'gitbbon.manager.initialize',
		async () => {
			await projectManager.startup();
		}
	);
	context.subscriptions.push(initializeCommand);

	// Register Sync Command
	const syncCommand = vscode.commands.registerCommand(
		'gitbbon.manager.sync',
		async () => {
			// Update status bar to show syncing
			syncStatusBarItem.text = '$(sync~spin) Syncing...';
			syncStatusBarItem.tooltip = 'Synchronizing with GitHub...';

			try {
				await githubSyncManager.sync(false); // Interactive mode
				await gitGraphProvider.refresh();
				// Show success briefly
				syncStatusBarItem.text = '$(check) Synced';
				setTimeout(() => {
					syncStatusBarItem.text = '$(sync) Sync';
					syncStatusBarItem.tooltip = 'Sync with GitHub';
				}, 3000);
			} catch {
				syncStatusBarItem.text = '$(error) Sync Failed';
				setTimeout(() => {
					syncStatusBarItem.text = '$(sync) Sync';
					syncStatusBarItem.tooltip = 'Sync with GitHub';
				}, 5000);
			}
		}
	);
	context.subscriptions.push(syncCommand);

	// Status Bar Item for Sync
	const syncStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	syncStatusBarItem.text = '$(sync) Sync';
	syncStatusBarItem.command = 'gitbbon.manager.sync';
	syncStatusBarItem.tooltip = 'Sync with GitHub';
	syncStatusBarItem.show();
	context.subscriptions.push(syncStatusBarItem);

	// Register autoCommit command
	const autoCommitCommand = vscode.commands.registerCommand(
		'gitbbon.manager.autoCommit',
		async () => {
			const result = await projectManager.autoCommit();
			logService.info('Auto Commit Result:', result);
			if (result.success) {
				await gitGraphProvider.refresh();
			}
			return result;
		}
	);
	context.subscriptions.push(autoCommitCommand);

	// Register reallyFinal command
	const reallyFinalCommand = vscode.commands.registerCommand(
		'gitbbon.manager.reallyFinal',
		async () => {
			// Show "Saving..." state immediately
			vscode.commands.executeCommand('_gitbbon.upsertFloatingWidget', {
				id: 'gitbbon-main',
				type: 'button',
				icon: 'codicon codicon-loading',
				label: 'Saving...',
				tooltip: 'Commit in progress',
				priority: 10,
				dimmed: false
			});

			const result = await projectManager.reallyFinalCommit();
			logService.info('Really Final Result:', result);
			if (result.success) {
				await gitGraphProvider.refresh();
				// gitbbon custom: 커밋 완료 후 로딩 아이콘 명시적 제거 (Issue #59 - 로딩 스피너 미제거 버그)
				vscode.commands.executeCommand('_gitbbon.upsertFloatingWidget', {
					id: 'gitbbon-main',
					icon: '',  // 로딩 아이콘 클리어
					label: 'Committed',
					tooltip: 'All changes committed',
					priority: 10,
					dimmed: true
				});
				// Notify Gitbbon Editor of committed status
				vscode.commands.executeCommand('gitbbon.editor.sendStatusUpdate', 'committed');
				// Trigger Sync after really final commit (Silent mode)
				logService.info('Triggering Sync after Really Final Commit (Silent)...');
				githubSyncManager.sync(true)
					.then(() => {
						logService.info('Post-commit sync completed, refreshing git graph...');
						return gitGraphProvider.refresh();
					})
					.catch(e => logService.error('Post-commit sync failed:', e));
			}
			return result;
		}
	);
	context.subscriptions.push(reallyFinalCommand);

	// Register hasPendingAutoSave command (checks if auto-save branch is ahead of main)
	const hasPendingAutoSaveCommand = vscode.commands.registerCommand(
		'gitbbon.manager.hasPendingAutoSave',
		async () => {
			const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!cwd) {
				return false;
			}
			return await projectManager.hasPendingAutoSave(cwd);
		}
	);
	context.subscriptions.push(hasPendingAutoSaveCommand);

	// Register deleteProject command (called from SidebarPart project switcher)
	const deleteProjectCommand = vscode.commands.registerCommand(
		'gitbbon.manager.deleteProject',
		async (args: { projectPath: string; deleteRemote?: boolean }) => {
			logService.info(`[Gitbbon-Delete] Delete project command triggered. Local path: ${args.projectPath}, deleteRemote: ${args.deleteRemote}`);

			if (!args.projectPath) {
				logService.error('[Gitbbon-Delete] Error: No project path provided');
				return { success: false, message: 'No project path provided' };
			}

			try {
				// 원격 삭제가 요청된 경우
				if (args.deleteRemote) {
					logService.info(`[Gitbbon-Delete] Fetching remote URL for project: ${args.projectPath}`);
					const remoteUrl = await projectManager.getRemoteUrl(args.projectPath);
					if (remoteUrl) {
						// URL에서 저장소 이름 추출 (예: https://github.com/user/gitbbon-note-xxx.git)
						const repoName = remoteUrl.split('/').pop()?.replace('.git', '');
						if (repoName) {
							logService.info(`[Gitbbon-Delete] Attempting to delete remote repository on GitHub: ${repoName}`);
							const success = await githubSyncManager.deleteGitHubRepo(repoName);
							if (!success) {
								logService.warn(`[Gitbbon-Delete] Failed to delete remote repository. Continuing with local delete.`);
								return { success: false, message: 'Failed to delete remote repository' };
							} else {
								logService.info(`[Gitbbon-Delete] Remote repository '${repoName}' successfully deleted.`);
							}
						} else {
							logService.warn(`[Gitbbon-Delete] Failed to extract repo name from remote URL: ${remoteUrl}`);
						}
					} else {
						logService.warn(`[Gitbbon-Delete] No remote URL found for project: ${args.projectPath}`);
					}
				}

				// 로컬 프로젝트 삭제
				logService.info(`[Gitbbon-Delete] Attempting to delete local project path: ${args.projectPath}`);
				const success = await projectManager.deleteProject(args.projectPath, true);
				if (success) {
					logService.info(`[Gitbbon-Delete] Local project '${args.projectPath}' deleted successfully.`);
					return { success: true, message: 'Project deleted' };
				} else {
					logService.warn(`[Gitbbon-Delete] Failed to delete local project: ${args.projectPath}`);
					return { success: false, message: 'Failed to delete project' };
				}
			} catch (error) {
				logService.error(`[Gitbbon-Delete] Exception during deletion:`, error);
				return { success: false, message: String(error) };
			}
		}
	);
	context.subscriptions.push(deleteProjectCommand);

	// Register addProject command (called from SidebarPart project switcher)
	const addProjectCommand = vscode.commands.registerCommand(
		'gitbbon.manager.addProject',
		async (args?: { name: string }) => {
			logService.info('Add project command triggered:', args);

			let projectName = args?.name;

			if (!projectName) {
				projectName = await vscode.window.showInputBox({
					prompt: 'Enter new project name',
					placeHolder: 'My New Project'
				});
			}

			if (!projectName) {
				return { success: false, message: 'No project name provided' };
			}

			try {
				const result = await projectManager.addNewProject(projectName);
				return result;
			} catch (error) {
				logService.error('Add project failed:', error);
				return { success: false, message: String(error) };
			}
		}
	);
	context.subscriptions.push(addProjectCommand);

	// 30-minute Periodic Sync (Silent mode)
	const syncInterval = setInterval(() => {
		logService.info('Triggering periodic sync (30m, Silent)...');
		githubSyncManager.sync(true)
			.then(() => {
				logService.info('Periodic sync completed, refreshing git graph...');
				return gitGraphProvider.refresh();
			})
			.catch(e => logService.error('Periodic sync failed:', e));
	}, 30 * 60 * 1000); // 30 minutes
	context.subscriptions.push({ dispose: () => clearInterval(syncInterval) });


	// Startup logic
	// We run this slightly deferred to let VS Code settle, though 'activate' is already part of startup.
	// We don't want to block extension activation too long, so we run async.
	projectManager.startup().then(async () => {
		// Activate Self-Destruct Watcher
		projectManager.startSelfDestructWatcher();

		// Focus Git Graph View on startup
		// The command 'gitbbon.gitGraph.focus' is automatically generated by VS Code for the view with ID 'gitbbon.gitGraph'.
		await vscode.commands.executeCommand('gitbbon.gitGraph.focus').then(undefined, err => {
			logService.warn('Could not focus Git Graph view:', err);
		});

		// Attempt initial sync in SILENT mode.
		// If user never authenticated, this will do nothing.
		logService.info('Triggering startup sync (Silent)...');
		githubSyncManager.sync(true)
			.then(() => {
				logService.info('Startup sync completed, refreshing git graph...');
				return gitGraphProvider.refresh();
			})
			.catch(e => logService.error('Startup sync failed:', e));
	}).catch(err => {
		logService.error('Startup failed:', err);
	});

	// Restore File Command
	const restoreFileCommand = vscode.commands.registerCommand('gitbbon.restoreFile', async (commitHash: string, fileUri: vscode.Uri) => {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('워크스페이스를 찾을 수 없습니다.');
			return;
		}

		try {
			const relativePath = vscode.workspace.asRelativePath(fileUri);

			const confirm = await vscode.window.showWarningMessage(
				`'${relativePath}' 파일을 ${commitHash.substring(0, 7)} 버전으로 복구하시겠습니까? (현재 변경사항은 덮어쓰여집니다)`,
				'복구',
				'취소'
			);

			if (confirm !== '복구') {
				return;
			}

			// git checkout {commitHash} -- {relativePath}
			const { exec } = cp;
			const command = `git checkout ${commitHash} -- "${relativePath}"`;

			await new Promise((resolve, reject) => {
				exec(command, { cwd: workspaceFolder.uri.fsPath }, (error: any, stdout: any) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(stdout);
				});
			});

			vscode.window.showInformationMessage(`${relativePath} 파일이 복구되었습니다.`);
		} catch (error) {
			logService.error('File restore failed:', error);
			vscode.window.showErrorMessage(`파일 복구 실패: ${error}`);
		}
	});
	context.subscriptions.push(restoreFileCommand);

	// Comparison Mode Switch Command

	// 현재 커밋 컨텍스트를 저장 (모드 변경 간 유지)
	let currentCommitContext: { historyItemId: string; rootUri: vscode.Uri } | undefined;

	// 커밋 해시 → 커밋 정보 캐시 (탭 전환 시 하이라이트 갱신용)
	// key: shortHash (8자리), value: { current: fullHash, compare: fullHash }
	const multiDiffHashCache = new Map<string, { current: string; compare: string }>();

	// 탭 라벨에서 커밋 해시 추출 (예: "Commit 00244f2a vs 53e53594 (1 file)")
	const extractHashesFromTabLabel = (label: string): { current: string; compare: string } | null => {
		const match = label.match(/Commit\s+([a-f0-9]+)\s+vs\s+([a-f0-9]+)/i);
		if (match) {
			return { current: match[1], compare: match[2] };
		}
		return null;
	};

	// 탭 변경 감지 리스너 등록
	const tabChangeListener = vscode.window.tabGroups.onDidChangeTabs(() => {
		// 활성 탭 변경 감지
		const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
		if (!activeTab) {
			return;
		}

		const tabLabel = activeTab.label;
		const extractedHashes = extractHashesFromTabLabel(tabLabel);

		if (extractedHashes) {
			// Multi Diff 탭이면 캐시에서 full hash 찾기 또는 short hash로 하이라이트
			const cachedCommits = multiDiffHashCache.get(extractedHashes.current);
			if (cachedCommits) {
				logService.debug(`Tab Change: Highlighting from cache for: ${tabLabel}`, cachedCommits);
				gitGraphProvider.highlightCommits(cachedCommits.current, cachedCommits.compare);
			} else {
				// 캐시에 없으면 추출한 short hash로 직접 하이라이트
				logService.debug(`Tab Change: Highlighting with extracted hashes: ${tabLabel}`, extractedHashes);
				gitGraphProvider.highlightCommits(extractedHashes.current, extractedHashes.compare);
			}
		} else {
			// Multi Diff 탭이 아니면 하이라이트 해제
			gitGraphProvider.clearHighlights();
		}
	});
	context.subscriptions.push(tabChangeListener);

	const switchComparisonModeCommand = vscode.commands.registerCommand(
		'gitbbon.switchComparisonMode',
		async (args: { mode: string; multiDiffSource: string }) => {
			logService.info('Switch Comparison Mode triggered:', args);
			if (!args.multiDiffSource) {
				vscode.window.showErrorMessage('No Multi Diff Source provided.');
				return;
			}

			try {
				const uri = vscode.Uri.parse(args.multiDiffSource);
				logService.debug('uri.scheme:', uri.scheme);

				// scm-history-item 스킴인 경우 컨텍스트 갱신
				if (uri.scheme === 'scm-history-item') {
					const query = JSON.parse(uri.query);
					const { historyItemId } = query;
					const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
					if (historyItemId && rootUri) {
						currentCommitContext = { historyItemId, rootUri };
						logService.debug('Updated commit context:', currentCommitContext);
					}
				}

				// 저장된 컨텍스트가 없으면 에러
				if (!currentCommitContext) {
					vscode.window.showWarningMessage('비교 모드 변경은 Git Graph에서 커밋을 다시 선택해 주세요.');
					return;
				}

				const { historyItemId, rootUri } = currentCommitContext;

				// Get current branch name dynamically
				const getCurrentBranch = (): Promise<string> => {
					return new Promise((resolve, reject) => {

						cp.exec('git rev-parse --abbrev-ref HEAD', { cwd: rootUri.fsPath }, (err: Error | null, stdout: string) => {
							if (err) {
								reject(err);
								return;
							}
							resolve(stdout.trim());
						});
					});
				};

				// Resolve branch/ref name to commit hash
				const resolveRefToCommitHash = (ref: string): Promise<string> => {
					return new Promise((resolve, reject) => {

						cp.exec(`git rev-parse ${ref}`, { cwd: rootUri.fsPath }, (err: Error | null, stdout: string) => {
							if (err) {
								reject(err);
								return;
							}
							resolve(stdout.trim());
						});
					});
				};

				const getCommitMessage = (hash: string): Promise<string> => {
					return new Promise((resolve) => {

						// Get subject only (%s)
						cp.exec(`git log -1 --pretty=%s ${hash}`, { cwd: rootUri.fsPath }, (err: Error | null, stdout: string) => {
							if (err) {
								logService.error(`Failed to get message for ${hash}`, err);
								resolve('No message');
							} else {
								resolve(stdout.trim());
							}
						});
					});
				};

				let parentCommitId: string | undefined = undefined;


				console.log("🚀 ~ activate ~ args.mode:", args.mode)
				switch (args.mode) {
					case 'savepoint':
						// 현재 브랜치의 마지막 버전(커밋 해시)과 비교
						try {
							const currentBranch = await getCurrentBranch();
							const commitHash = await resolveRefToCommitHash(currentBranch);
							parentCommitId = commitHash;
							logService.info(`Savepoint mode: comparing with '${currentBranch}' -> commit ${commitHash}`);
						} catch (e) {
							logService.error('Failed to resolve branch to commit:', e);
						}
						break;
					case 'draft':
						// auto-save/현재브랜치의 커밋 해시와 비교
						try {
							const currentBranch = await getCurrentBranch();
							const autoSaveBranch = `auto-save/${currentBranch}`;
							const commitHash = await resolveRefToCommitHash(autoSaveBranch);
							parentCommitId = commitHash;
							logService.info(`Draft mode: comparing with '${autoSaveBranch}' -> commit ${commitHash}`);
						} catch (e) {
							logService.error('Failed to resolve auto-save branch to commit:', e);
							vscode.window.showWarningMessage(`auto-save 브랜치를 찾을 수 없습니다.`);
						}
						break;
					case 'default':
						// 이전 버전(커밋의 실제 부모)과 비교
						try {
							const commitParent = await resolveRefToCommitHash(`${historyItemId}^`);
							parentCommitId = commitParent;
							logService.info(`Default mode: comparing with parent commit ${commitParent}`);
						} catch (e) {
							logService.error('Failed to resolve parent commit:', e);
							vscode.window.showWarningMessage('부모 커밋을 찾을 수 없습니다.');
						}
						break;
				}

				logService.info(`Switching mode to ${args.mode}, parent: ${parentCommitId}`);

				if (!parentCommitId) {
					// Default 모드: 기존 Core 명령어 사용
					await vscode.commands.executeCommand(
						'gitbbon.openCommitInMultiDiffEditor',
						rootUri,
						historyItemId,
						undefined
					);
				} else {
					// Determine left (original) and right (modified) refs first
					// default mode: parent (left) vs current (right)
					// savepoint/draft mode: current (left) vs savepoint/draft (right)
					const shouldSwap = args.mode === 'savepoint' || args.mode === 'draft';
					const leftRef = shouldSwap ? historyItemId : parentCommitId!;
					const rightRef = shouldSwap ? parentCommitId! : historyItemId;

					// Custom 비교: git diff를 직접 실행하여 파일 목록 가져오기
					const getChangedFiles = (): Promise<{ status: string, file: string, originalFile?: string }[]> => {
						return new Promise((resolve, reject) => {

							// Use leftRef..rightRef to match the diff direction
							cp.exec(
								`git diff --name-status ${leftRef}..${rightRef}`,
								{ cwd: rootUri.fsPath },
								(err: Error | null, stdout: string) => {
									if (err) {
										reject(err);
										return;
									}
									const files = stdout.trim().split('\n').filter(l => l).map(line => {
										const parts = line.split('\t');
										const status = parts[0];

										// Git outputs non-ASCII filenames with quotes and octal escapes
										const normalizeGitPath = (path: string): string => {
											if (!path) return path;
											let normalized = path.startsWith('"') && path.endsWith('"')
												? path.slice(1, -1)
												: path;
											normalized = normalized.replace(/\\([0-7]{3})/g, (_, oct) => {
												return String.fromCharCode(parseInt(oct, 8));
											});
											try {
												const bytes = new Uint8Array(
													normalized.split('').map(char => char.charCodeAt(0))
												);
												return new TextDecoder('utf-8').decode(bytes);
											} catch {
												return normalized;
											}
										};
										if (status.startsWith('R')) {
											// Renamed: R100\toldname\tnewname
											return { status: 'R', file: normalizeGitPath(parts[2]), originalFile: normalizeGitPath(parts[1]) };
										}
										return { status, file: normalizeGitPath(parts[1]) };
									});
									resolve(files);
								}
							);
						});
					};

					try {
						const changedFiles = await getChangedFiles();
						logService.debug(`[switchComparisonMode] Changed files:`, changedFiles);

						if (changedFiles.length === 0) {
							vscode.window.showInformationMessage('변경된 파일이 없습니다.');
							return;
						}

						// git: 스킴 URI 생성 헬퍼
						const toGitUri = (filePath: string, ref: string): vscode.Uri => {
							const fileUri = vscode.Uri.file(`${rootUri.fsPath}/${filePath}`);
							const params = { path: fileUri.fsPath, ref };
							return fileUri.with({
								scheme: 'git',
								query: JSON.stringify(params)
							});
						};

						const resources = changedFiles.map(change => {
							let originalUri: vscode.Uri | undefined;
							let modifiedUri: vscode.Uri | undefined;

							switch (change.status) {
								case 'A': // Added
									modifiedUri = toGitUri(change.file, rightRef);
									break;
								case 'D': // Deleted
									originalUri = toGitUri(change.file, leftRef);
									break;
								case 'R': // Renamed
									originalUri = toGitUri(change.originalFile!, leftRef);
									modifiedUri = toGitUri(change.file, rightRef);
									break;
								default: // Modified
									originalUri = toGitUri(change.file, leftRef);
									modifiedUri = toGitUri(change.file, rightRef);
									break;
							}

							return { originalUri, modifiedUri };
						});

						// Fetch commit messages
						const leftMessage = await getCommitMessage(leftRef);
						const rightMessage = await getCommitMessage(rightRef);

						// Multi Diff Editor 열기
						const label = `${historyItemId.substring(0, 8)} vs ${parentCommitId.substring(0, 8)}`;
						await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
							title: label,
							resources,
							commitMessages: {
								left: leftMessage,
								right: rightMessage,
								leftHash: leftRef,
								rightHash: rightRef
							}
						});

						// 캐시에 저장하고 하이라이트 트리거 (shortHash를 키로 사용)
						const shortHash = historyItemId.substring(0, 8);
						multiDiffHashCache.set(shortHash, { current: historyItemId, compare: parentCommitId });
						gitGraphProvider.highlightCommits(historyItemId, parentCommitId);
						logService.debug(`Switch Comparison Mode: Cached (key: ${shortHash}) and highlighted`);

					} catch (e) {
						logService.error('Switch Comparison Mode: Failed to get changed files:', e);
						vscode.window.showErrorMessage('변경된 파일 목록을 가져오지 못했습니다.');
					}
				}

			} catch (e) {
				logService.error('Failed to switch comparison mode:', e);
				vscode.window.showErrorMessage('Failed to switch comparison mode.');
			}
		}
	);
	context.subscriptions.push(switchComparisonModeCommand);

	// Restore to Version Command
	const restoreToVersionCommand = vscode.commands.registerCommand(
		'gitbbon.restoreToVersion',
		async (args: { commitHash: string; multiDiffSource: string }) => {
			logService.info('Restore to Version triggered:', args);

			if (!args.commitHash) {
				vscode.window.showErrorMessage('No commit hash provided for restoration.');
				return;
			}

			// 1. Resolve Root URI
			let rootUri: vscode.Uri | undefined;
			if (args.multiDiffSource) {
				try {
					const uri = vscode.Uri.parse(args.multiDiffSource);
					if (uri.scheme === 'scm-history-item') {
						rootUri = vscode.workspace.workspaceFolders?.[0]?.uri; // fallback to first folder usually works
					}
				} catch (e) {
					logService.error('Failed to parse multiDiffSource:', e);
				}
			}
			if (!rootUri) {
				rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
			}
			if (!rootUri) {
				vscode.window.showErrorMessage('No workspace folder found.');
				return;
			}

			const cwd = rootUri.fsPath;
			const targetCommitHash = args.commitHash;

			// Confirm with user
			const confirm = await vscode.window.showWarningMessage(
				`현재 상태를 커밋 '${targetCommitHash.substring(0, 7)}' 상태로 복원하시겠습니까? (현재 내용은 자동으로 백업됩니다)`,
				{ modal: true },
				'복원하기'
			);
			if (confirm !== '복원하기') {
				return;
			}

			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "버전 복원 중...",
					cancellable: false
				}, async (progress) => {
					progress.report({ message: "복원 진행 중..." });

					const result = await projectManager.restoreToVersion(cwd, targetCommitHash);

					if (result.success) {
						// Sync
						progress.report({ message: "원격 저장소 동기화 중..." });
						await githubSyncManager.sync(false);

						// Refresh Git Graph
						await gitGraphProvider.refresh();

						vscode.window.showInformationMessage(`성공적으로 복원되었습니다: ${result.message}`);
					}
				});
			} catch (e) {
				logService.error('Restore Failed:', e);
				vscode.window.showErrorMessage(`복원 실패: ${e}`);
			}
		}
	);
	context.subscriptions.push(restoreToVersionCommand);

	logService.info('Gitbbon Manager extension activated!');
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
	logService.info('Gitbbon Manager extension deactivated');
}
