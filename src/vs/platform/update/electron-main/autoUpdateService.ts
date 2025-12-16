/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow, dialog } from 'electron';
import electronUpdater, { type UpdateInfo, type AppUpdater } from 'electron-updater';
import { ILogService } from '../../log/common/log.js';

// ESM 환경에서 CommonJS 모듈의 autoUpdater에 접근
const autoUpdater: AppUpdater = electronUpdater.autoUpdater;

export class AutoUpdateService {
	private updateCheckInterval: ReturnType<typeof setInterval> | undefined;
	private readonly CHECK_INTERVAL = 1000 * 60 * 60 * 4; // 4시간마다 체크

	constructor(
		private readonly logService: ILogService,
		private readonly window: BrowserWindow | undefined
	) {
		this.initialize();
	}

	private initialize(): void {
		// 개발 환경에서는 자동 업데이트 비활성화
		if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
			this.logService.info('[AutoUpdate] Development mode - auto update disabled');
			return;
		}

		// 비공개 레포용 GitHub 토큰 설정
		// 빌드 시점에 환경변수가 문자열로 치환됨 (예: "ghp_xxxx" 또는 undefined)
		// MVP 단계이며 향후 오픈소스 전환 예정으로 보안 리스크 수용
		const githubToken = process.env.GH_TOKEN;
		if (githubToken && githubToken !== 'undefined') {
			autoUpdater.requestHeaders = {
				Authorization: `token ${githubToken}`
			};
			this.logService.info('[AutoUpdate] GitHub token configured for private repo');
		} else {
			this.logService.warn('[AutoUpdate] No GitHub token found - updates may fail for private repo');
		}

		// 자동 다운로드 비활성화 (사용자에게 먼저 알림)
		autoUpdater.autoDownload = false;
		autoUpdater.autoInstallOnAppQuit = true;

		// 로깅 설정
		autoUpdater.logger = {
			info: (message?: any) => this.logService.info(`[AutoUpdate] ${message}`),
			warn: (message?: any) => this.logService.warn(`[AutoUpdate] ${message}`),
			error: (message?: any) => this.logService.error(`[AutoUpdate] ${message}`),
			debug: (message?: any) => this.logService.debug(`[AutoUpdate] ${message}`)
		};

		this.setupEventHandlers();
		this.startUpdateCheck();
	}

	private setupEventHandlers(): void {
		// 업데이트 확인 중
		autoUpdater.on('checking-for-update', () => {
			this.logService.info('[AutoUpdate] Checking for updates...');
		});

		// 업데이트 가능
		autoUpdater.on('update-available', (info: UpdateInfo) => {
			this.logService.info(`[AutoUpdate] Update available: ${info.version}`);
			this.showUpdateAvailableDialog(info);
		});

		// 업데이트 없음
		autoUpdater.on('update-not-available', (info: UpdateInfo) => {
			this.logService.info(`[AutoUpdate] Current version ${info.version} is up-to-date`);
		});

		// 다운로드 진행 중
		autoUpdater.on('download-progress', (progressObj) => {
			const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
			this.logService.info(`[AutoUpdate] ${message}`);

			// 메인 윈도우에 진행 상황 전송 (선택사항)
			if (this.window && !this.window.isDestroyed()) {
				this.window.webContents.send('update-download-progress', progressObj);
			}
		});

		// 다운로드 완료
		autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
			this.logService.info(`[AutoUpdate] Update downloaded: ${info.version}`);
			this.showUpdateDownloadedDialog(info);
		});

		// 에러 발생
		autoUpdater.on('error', (error) => {
			this.logService.error(`[AutoUpdate] Error: ${error.message}`);
		});
	}

	private async showUpdateAvailableDialog(info: UpdateInfo): Promise<void> {
		const result = await dialog.showMessageBox({
			type: 'info',
			title: '업데이트 가능',
			message: `새로운 버전 ${info.version}이 사용 가능합니다.`,
			detail: '지금 다운로드하시겠습니까?',
			buttons: ['다운로드', '나중에'],
			defaultId: 0,
			cancelId: 1
		});

		if (result.response === 0) {
			this.logService.info('[AutoUpdate] User accepted update download');
			await autoUpdater.downloadUpdate();
		} else {
			this.logService.info('[AutoUpdate] User postponed update');
		}
	}

	private async showUpdateDownloadedDialog(info: UpdateInfo): Promise<void> {
		const result = await dialog.showMessageBox({
			type: 'info',
			title: '업데이트 준비 완료',
			message: `버전 ${info.version}이 다운로드되었습니다.`,
			detail: '지금 재시작하여 업데이트를 적용하시겠습니까?',
			buttons: ['재시작', '나중에'],
			defaultId: 0,
			cancelId: 1
		});

		if (result.response === 0) {
			this.logService.info('[AutoUpdate] User accepted restart for update');
			setImmediate(() => autoUpdater.quitAndInstall());
		} else {
			this.logService.info('[AutoUpdate] User postponed restart');
		}
	}

	private startUpdateCheck(): void {
		// 앱 시작 후 5초 뒤 첫 체크
		setTimeout(() => {
			this.checkForUpdates();
		}, 5000);

		// 정기적으로 업데이트 체크
		this.updateCheckInterval = setInterval(() => {
			this.checkForUpdates();
		}, this.CHECK_INTERVAL);
	}

	public async checkForUpdates(): Promise<void> {
		try {
			this.logService.info('[AutoUpdate] Manual update check initiated');
			await autoUpdater.checkForUpdates();
		} catch (error) {
			this.logService.error(`[AutoUpdate] Failed to check for updates: ${error}`);
		}
	}

	public dispose(): void {
		if (this.updateCheckInterval) {
			clearInterval(this.updateCheckInterval);
			this.updateCheckInterval = undefined;
		}
	}
}
