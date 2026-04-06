/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'source-map-support/register';
import * as vscode from 'vscode';
import { type ModelMessage } from 'ai';
import { AIService } from './services/aiService';
import { logService } from './services/logService';
import { ollamaService, MODEL_SIZES_GB, type RecommendedModel, type ModelWithCapabilities } from './services/ollamaService';

class GitbbonChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitbbon.chat';
	private _webviewView?: vscode.WebviewView;
	private aiService: AIService;
	private _pendingText?: string;
	// gitbbon custom: Issue #69 - 모델 다운로드 진행률 상태표시줄 아이템
	private _pullStatusBarItem?: vscode.StatusBarItem;
	// Issue #77: 모델별 capabilities 캐시
	private _modelCapabilities: Record<string, { thinking: boolean; tools: boolean; completion: boolean }> = {};

	constructor(private readonly _context: vscode.ExtensionContext) {
		this.aiService = new AIService(_context.secrets);
	}

	public getAIService(): AIService {
		return this.aiService;
	}

	private get _extensionUri(): vscode.Uri {
		return this._context.extensionUri;
	}

	/**
	 * 외부에서 텍스트를 채팅 입력창에 삽입
	 */
	public sendTextToChat(text: string): void {
		if (this._webviewView) {
			this._webviewView.webview.postMessage({
				type: 'insertText',
				text: text
			});
			// 패널 포커스
			this._webviewView.show(true);
		} else {
			// 웹뷰가 아직 준비되지 않은 경우, 대기 텍스트로 저장
			this._pendingText = text;
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext<unknown>,
		_token: vscode.CancellationToken
	): void {
		this._webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// 웹뷰에서 메시지 수신
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'chat-request') {
				// gitbbon custom: UI 선택 모델 추출
				// Issue #77: capabilities 기반으로 streamText 옵션 자동 결정
				const { messages: chatMessages, selectedModel } = message;
				const modelCaps = selectedModel ? this._modelCapabilities[selectedModel] : undefined;
				await this._handleChatMessage(chatMessages, selectedModel, modelCaps);
			} else if (message.type === 'chat-cancel') {
				this.aiService.cancelCurrentStream();
				webviewView.webview.postMessage({ type: 'chat-done' });
			} else if (message.type === 'select-backend') {
				// gitbbon custom: 웹뷰 셀렉트박스에서 직접 backend 값을 받아 처리 (QuickPick 제거)
				await this._handleSelectBackend(webviewView, message.backend as 'api' | 'ollama');
			} else if (message.type === 'get-ollama-models') {
				// gitbbon custom: 웹뷰에서 ollama 설치 모델 목록 요청
				// Issue #77: capabilities 포함하여 전달
				const modelsWithCaps = await ollamaService.getInstalledModelsWithCapabilities();
				const models = modelsWithCaps.map(m => m.name);
				const capabilities: Record<string, { thinking: boolean; tools: boolean; completion: boolean }> = {};
				for (const m of modelsWithCaps) {
					capabilities[m.name] = m.capabilities;
				}
				this._modelCapabilities = { ...this._modelCapabilities, ...capabilities };
				webviewView.webview.postMessage({ type: 'ollama-models', models, capabilities });
			} else if (message.type === 'setup-ollama') {
				await setupOllama(this.aiService, webviewView);
			} else if (message.type === 'save-selected-model') {
				// gitbbon custom: 온디바이스 모델 선택값 저장
				await this._context.globalState.update('SELECTED_OLLAMA_MODEL', message.model);
			} else if (message.type === 'get-recommended-models') {
				// gitbbon custom: Issue #68 - 추천 모델 리스트 + 다운로드 상태 반환
				logService.info('[debug:#69] get-recommended-models 요청 수신');
				const models = await ollamaService.getRecommendedModels();
				const freeDiskGB = await ollamaService.getFreeDiskGB();
				webviewView.webview.postMessage({ type: 'recommended-models', models, freeDiskGB });
			} else if (message.type === 'delete-ollama-model') {
				// Issue #79: 온디바이스 모델 삭제 요청 처리
				const modelName = message.model as string;
				logService.info(`[debug:#79] 모델 삭제 요청 수신: ${modelName}`);
				webviewView.webview.postMessage({ type: 'model-delete-progress', model: modelName, status: 'deleting' });
				try {
					await ollamaService.deleteModel(modelName);
					logService.info(`[debug:#79] 삭제 완료, 목록 갱신: ${modelName}`);
					webviewView.webview.postMessage({ type: 'model-delete-progress', model: modelName, status: 'done' });
					// 삭제 완료 후 추천 모델 목록 갱신
					const updatedModels = await ollamaService.getRecommendedModels();
					const freeDiskGB = await ollamaService.getFreeDiskGB();
					webviewView.webview.postMessage({ type: 'recommended-models', models: updatedModels, freeDiskGB });
					// 설치된 모델 목록도 capabilities 포함하여 갱신
					const installedModelsWithCaps = await ollamaService.getInstalledModelsWithCapabilities();
					const installedModels = installedModelsWithCaps.map(m => m.name);
					const installedCaps: Record<string, { thinking: boolean; tools: boolean; completion: boolean }> = {};
					for (const m of installedModelsWithCaps) {
						installedCaps[m.name] = m.capabilities;
					}
					this._modelCapabilities = { ...this._modelCapabilities, ...installedCaps };
					webviewView.webview.postMessage({ type: 'ollama-models', models: installedModels, capabilities: installedCaps });
				} catch (err) {
					logService.error(`[debug:#79] 모델 삭제 실패: ${modelName}`, err);
					webviewView.webview.postMessage({ type: 'model-delete-progress', model: modelName, status: 'error', message: String(err) });
				}
			} else if (message.type === 'pull-model') {
				// gitbbon custom: Issue #134 - 채팅창 드롭다운에서 미설치 모델 선택 → 공통 확인 다이얼로그 경유
				const modelName = message.model as string;
				const sizeGB = message.sizeGB as number | undefined;
				await downloadModelWithConfirm(modelName, sizeGB, this);
			} else if (message.type === 'pull-ollama-model') {
				// gitbbon custom: Issue #69 - 미설치 모델 다운로드 요청 (상태표시줄 진행률 표시)
				const modelName = message.model as string;
				logService.info(`[debug:#69] pull-ollama-model 요청: ${modelName}`);
				webviewView.webview.postMessage({ type: 'model-pull-progress', model: modelName, progress: 0, status: 'pulling' });

				// gitbbon custom: Issue #69 - 상태표시줄에 다운로드 진행률 표시
				// gitbbon custom: Issue #135 - 모델 선택 아이템(Right, 100) 옆에 위치하도록 Right, 99로 변경
				if (!this._pullStatusBarItem) {
					this._pullStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
					this._context.subscriptions.push(this._pullStatusBarItem);
				}
				this._pullStatusBarItem.text = `$(sync~spin) 모델 다운로드: ${modelName} 0%`;
				this._pullStatusBarItem.tooltip = `Ollama 모델 다운로드 중: ${modelName}`;
				this._pullStatusBarItem.show();
				logService.info(`[debug:#69] 상태표시줄 진행률 표시 시작: ${modelName}`);

				try {
					await ollamaService.pullModel(modelName, (pct) => {
						webviewView.webview.postMessage({ type: 'model-pull-progress', model: modelName, progress: pct, status: 'pulling' });
						// gitbbon custom: Issue #69 - 상태표시줄 진행률 업데이트
						if (this._pullStatusBarItem) {
							this._pullStatusBarItem.text = `$(sync~spin) 모델 다운로드: ${modelName} ${pct}%`;
						}
					});
					logService.info(`[debug:#69] pull-ollama-model 완료: ${modelName}`);
					webviewView.webview.postMessage({ type: 'model-pull-progress', model: modelName, progress: 100, status: 'done' });

					// gitbbon custom: Issue #69 - 다운로드 완료 시 상태표시줄 완료 표시 후 숨김
					if (this._pullStatusBarItem) {
						this._pullStatusBarItem.text = `$(check) 모델 다운로드 완료: ${modelName}`;
						logService.info(`[debug:#69] 상태표시줄 진행률 완료: ${modelName}`);
						setTimeout(() => {
							this._pullStatusBarItem?.hide();
						}, 3000);
					}

					// 다운로드 완료 후 추천 모델 목록 갱신하여 전송
					const updatedModels = await ollamaService.getRecommendedModels();
					const freeDiskGB = await ollamaService.getFreeDiskGB();
					webviewView.webview.postMessage({ type: 'recommended-models', models: updatedModels, freeDiskGB });
					// Issue #77: 설치된 모델 목록도 capabilities 포함하여 갱신
					const installedModelsWithCaps = await ollamaService.getInstalledModelsWithCapabilities();
					const installedModels = installedModelsWithCaps.map(m => m.name);
					const installedCaps: Record<string, { thinking: boolean; tools: boolean; completion: boolean }> = {};
					for (const m of installedModelsWithCaps) {
						installedCaps[m.name] = m.capabilities;
					}
					this._modelCapabilities = { ...this._modelCapabilities, ...installedCaps };
					webviewView.webview.postMessage({ type: 'ollama-models', models: installedModels, capabilities: installedCaps });
				} catch (err) {
					logService.error(`[debug:#69] pull-ollama-model 실패: ${modelName}`, err);
					webviewView.webview.postMessage({ type: 'model-pull-progress', model: modelName, progress: 0, status: 'error' });

					// gitbbon custom: Issue #69 - 다운로드 실패 시 상태표시줄 오류 표시 후 숨김
					if (this._pullStatusBarItem) {
						this._pullStatusBarItem.text = `$(error) 모델 다운로드 실패: ${modelName}`;
						logService.info(`[debug:#69] 상태표시줄 진행률 실패: ${modelName}`);
						setTimeout(() => {
							this._pullStatusBarItem?.hide();
						}, 5000);
					}
				}
			}
		});

		// gitbbon custom: 웹뷰 init 시 저장된 backend 및 선택된 모델 복원
		// 웹뷰 React 마운트 완료를 기다린 후 복원 메시지 전송 (race condition 방지)
		webviewView.webview.onDidReceiveMessage(async (msg: { type: string }) => {
			if (msg.type !== 'webview-ready') {
				return;
			}
			const savedBackend = await this.aiService.getBackend();
			webviewView.webview.postMessage({ type: 'backend-changed', backend: savedBackend });
			if (savedBackend === 'ollama') {
				// Issue #77: capabilities 포함하여 전달
				const modelsWithCaps = await ollamaService.getInstalledModelsWithCapabilities();
				const models = modelsWithCaps.map(m => m.name);
				const capabilities: Record<string, { thinking: boolean; tools: boolean; completion: boolean }> = {};
				for (const m of modelsWithCaps) {
					capabilities[m.name] = m.capabilities;
				}
				this._modelCapabilities = { ...this._modelCapabilities, ...capabilities };
				webviewView.webview.postMessage({ type: 'ollama-models', models, capabilities });
				// gitbbon custom: Issue #68 - 추천 모델 리스트도 함께 전송
				const recommendedModels = await ollamaService.getRecommendedModels();
				const freeDiskGB = await ollamaService.getFreeDiskGB();
				webviewView.webview.postMessage({ type: 'recommended-models', models: recommendedModels, freeDiskGB });
				const savedModel = this._context.globalState.get<string>('SELECTED_OLLAMA_MODEL', '');
				if (savedModel) {
					webviewView.webview.postMessage({ type: 'selected-model', model: savedModel });
				}
			}
		});

		// 대기 중인 텍스트가 있으면 삽입
		if (this._pendingText) {
			setTimeout(() => {
				if (this._pendingText) {
					this.sendTextToChat(this._pendingText);
					this._pendingText = undefined;
				}
			}, 500);
		}
	}

	// gitbbon custom: QuickPick 제거 - 웹뷰 셀렉트박스에서 backend 값을 직접 수신
	private async _handleSelectBackend(webviewView: vscode.WebviewView, backend: 'api' | 'ollama'): Promise<void> {
		await this.aiService.setBackend(backend);
		webviewView.webview.postMessage({ type: 'backend-changed', backend });

		if (backend === 'ollama') {
			await setupOllama(this.aiService, webviewView);
			// Issue #77: capabilities 포함하여 ollama 모델 목록 전송
			const modelsWithCaps = await ollamaService.getInstalledModelsWithCapabilities();
			const models = modelsWithCaps.map(m => m.name);
			const capabilities: Record<string, { thinking: boolean; tools: boolean; completion: boolean }> = {};
			for (const m of modelsWithCaps) {
				capabilities[m.name] = m.capabilities;
			}
			this._modelCapabilities = { ...this._modelCapabilities, ...capabilities };
			webviewView.webview.postMessage({ type: 'ollama-models', models, capabilities });
			// gitbbon custom: Issue #68 - 추천 모델 리스트도 함께 전송
			const recommendedModels = await ollamaService.getRecommendedModels();
			const freeDiskGB = await ollamaService.getFreeDiskGB();
			webviewView.webview.postMessage({ type: 'recommended-models', models: recommendedModels, freeDiskGB });
		}
	}

	private async _handleChatMessage(messages: ModelMessage[], selectedModel?: string, modelCapabilities?: { thinking: boolean; tools: boolean; completion: boolean }): Promise<void> {
		if (!this._webviewView) {
			return;
		}

		// Check backend - Ollama doesn't need an API key
		const backend = await this.aiService.getBackend();
		if (backend !== 'ollama') {
			// Ensure AI Service is initialized (loads keys)
			await this.aiService.ensureInitialized();

			if (!this.aiService.hasApiKey()) {
				logService.warn('Missing API Key');
				this._webviewView.webview.postMessage({
					type: 'chat-error',
					message: 'API 키가 설정되지 않았습니다. Settings에서 API 키를 설정해주세요.'
				});
				this._webviewView.webview.postMessage({ type: 'chat-done' });
				return;
			}
		}

		try {
			// gitbbon custom: UI 선택 모델을 aiService에 전달
			// Issue #77: capabilities 정보도 함께 전달
			const stream = this.aiService.streamAgentChat(messages, selectedModel, modelCapabilities);

			for await (const event of stream) {
				switch (event.type) {
					case 'tool-start':
					case 'tool-end':
						// 도구 진행 상황 전송
						this._webviewView.webview.postMessage({
							type: 'chat-tool-status',
							event: event
						});
						break;
					case 'text':
						// AI 응답 텍스트 전송
						this._webviewView.webview.postMessage({
							type: 'chat-chunk',
							chunk: event.content
						});
						break;
					// Issue #64: AI 추론(reasoning) 스트리밍 전달
					case 'reasoning':
						this._webviewView.webview.postMessage({
							type: 'chat-reasoning',
							chunk: event.content
						});
						break;
				}
			}

			this._webviewView.webview.postMessage({ type: 'chat-done' });

		} catch (error) {
			logService.error('Chat failed:', error);
			this._webviewView.webview.postMessage({
				type: 'chat-error',
				message: 'AI 응답 중 오류가 발생했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.'
			});
			this._webviewView.webview.postMessage({ type: 'chat-done' });
		}
	}

	private _getHtmlForWebview(_webview: vscode.Webview): string {
		const styleUri = _webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.css'));
		const scriptUri = _webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.js'));
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${_webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; connect-src 'self' https:; font-src ${_webview.cspSource};">
	<title>Gitbbon Chat</title>
	<link href="${styleUri}" rel="stylesheet">
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

async function setupOllama(aiService: AIService, webviewView: vscode.WebviewView): Promise<void> {
	const post = (step: string, detail: string, progress?: number) => {
		logService.info(`[gitbbon-chat][setupOllama] step=${step} ${progress !== undefined ? `progress=${progress}%` : ''} ${detail}`);
		webviewView.webview.postMessage({ type: 'ollama-status', step, detail, progress });
	};

	logService.info('[gitbbon-chat][setupOllama] starting');
	post('checking', 'Ollama 확인 중...');

	const running = await ollamaService.isRunning();
	if (!running) {
		logService.info('[gitbbon-chat][setupOllama] Ollama not running, checking install');
		const installed = await ollamaService.isInstalled();
		if (!installed) {
			post('installing', 'Ollama 설치 중...');
			try {
				await ollamaService.install();
				logService.info('[gitbbon-chat][setupOllama] install complete');
			} catch {
				post('error', 'Ollama 자동 설치에 실패했습니다.\n\n• macOS (Homebrew): brew install ollama\n• 공식 설치: https://ollama.com/download\n• 설치 후 터미널에서: ollama serve');
				return;
			}
		}
		try {
			await ollamaService.startServer();
			logService.info('[gitbbon-chat][setupOllama] server started');
		} catch {
			post('error', 'Ollama 서버를 시작하지 못했습니다. 터미널에서 "ollama serve" 를 실행해주세요.');
			return;
		}
	} else {
		logService.info('[gitbbon-chat][setupOllama] Ollama already running');
	}

	const installedModels = await ollamaService.getInstalledModels();

	let model: string;
	if (installedModels.length > 0) {
		model = installedModels[0];
		logService.info(`[gitbbon-chat][setupOllama] using existing model: ${model} (installedModels=[${installedModels.join(', ')}])`);
	} else {
		const hw = await ollamaService.detectHardware();
		model = ollamaService.selectModel(hw);
		logService.info(`[gitbbon-chat][setupOllama] no installed models, will pull: ${model}`);

		// 다운로드 전 사용자 확인
		const modelSizeGB = MODEL_SIZES_GB[model] ?? null;
		const freeDiskGB = await ollamaService.getFreeDiskGB();

		const sizeInfo = modelSizeGB !== null ? `${modelSizeGB.toFixed(1)}GB` : '크기 미확인';
		const diskInfo = freeDiskGB !== Infinity ? `여유 공간: ${freeDiskGB.toFixed(1)}GB` : '여유 공간: 확인 불가';
		const diskWarning = modelSizeGB !== null && freeDiskGB < modelSizeGB + 1
			? `\n⚠️ 여유 공간이 부족할 수 있습니다.`
			: '';

		logService.info(`[gitbbon-chat][setupOllama] confirm pull: model=${model}, size=${sizeInfo}, ${diskInfo}`);

		const answer = await vscode.window.showInformationMessage(
			`Ollama 모델을 다운로드합니다`,
			{
				modal: true,
				detail: `모델: ${model}\n다운로드 크기: ${sizeInfo}\n${diskInfo}${diskWarning}\n\n계속하시겠습니까?`,
			},
			'다운로드',
			'취소'
		);

		if (answer !== '다운로드') {
			logService.info('[gitbbon-chat][setupOllama] user cancelled pull');
			post('error', '모델 다운로드가 취소되었습니다.\n터미널에서 원하는 모델을 직접 설치할 수 있습니다:\nollama pull <모델명>');
			return;
		}

		post('pulling', `모델 다운로드 중... ${model}`, 0);
		try {
			await ollamaService.pullModel(model, (pct) => {
				post('pulling', `모델 다운로드 중... ${model}`, pct);
			});
			logService.info(`[gitbbon-chat][setupOllama] pull complete: ${model}`);
		} catch {
			post('error', `모델 다운로드에 실패했습니다. 터미널에서 "ollama pull ${model}" 을 실행해주세요.`);
			return;
		}
	}

	post('ready', `준비 완료: ${model}`);
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// gitbbon custom: Issue #134 - 모델 다운로드 공통 함수 (확인 다이얼로그 포함)
async function downloadModelWithConfirm(modelName: string, sizeGB: number | undefined, provider: GitbbonChatViewProvider): Promise<void> {
	const sizeText = sizeGB && sizeGB > 0 ? ` (${sizeGB.toFixed(1)}GB)` : '';
	const answer = await vscode.window.showInformationMessage(
		`${modelName}${sizeText}을 다운로드하시겠습니까?`,
		{ modal: true },
		'다운로드',
		'취소'
	);
	if (answer !== '다운로드') {
		return;
	}
	// WebView를 통해 pull-ollama-model 메시지로 다운로드 시작
	const webviewView = (provider as any)._webviewView as vscode.WebviewView | undefined;
	if (webviewView) {
		webviewView.webview.postMessage({ type: 'trigger-pull-model', model: modelName });
	} else {
		// WebView가 없으면 직접 pullModel 호출 (상태표시줄로 진행률 표시)
		vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `모델 다운로드: ${modelName}`, cancellable: false },
			async (progress) => {
				try {
					await ollamaService.pullModel(modelName, (pct) => {
						progress.report({ increment: pct, message: `${pct}%` });
					});
					vscode.window.showInformationMessage(`모델 다운로드 완료: ${modelName}`);
				} catch (err) {
					vscode.window.showErrorMessage(`모델 다운로드 실패: ${modelName}`);
				}
			}
		);
	}
}

export function activate(context: vscode.ExtensionContext): void {
	logService.init();
	const provider = new GitbbonChatViewProvider(context);

	// gitbbon custom: Issue #129 - 전역 AI 모델 상태바 아이템
	const aiStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	aiStatusBarItem.command = 'gitbbon.selectModel';
	context.subscriptions.push(aiStatusBarItem);

	// gitbbon custom: Issue #129 - 상태바 텍스트 갱신 함수
	async function updateAiStatusBar(): Promise<void> {
		const config = vscode.workspace.getConfiguration('gitbbon');
		const backend = config.get<string>('ai.backend') || 'api';
		if (backend === 'ollama') {
			const model = config.get<string>('ai.ollamaModel') || '';
			aiStatusBarItem.text = model ? `$(vm) ${model}` : '$(vm) 온디바이스';
			aiStatusBarItem.tooltip = `온디바이스 AI: ${model || '모델 미선택'} (클릭하여 변경)`;
		} else {
			aiStatusBarItem.text = '$(cloud) Gitbbon AI';
			aiStatusBarItem.tooltip = 'Gitbbon AI (클릭하여 변경)';
		}
		aiStatusBarItem.show();
	}

	// 초기 상태바 설정
	updateAiStatusBar();

	// gitbbon custom: Issue #129 - Configuration 변경 감지 → 상태바 갱신
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('gitbbon.ai')) {
				updateAiStatusBar();
			}
		})
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			GitbbonChatViewProvider.viewType,
			provider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.open', () => {
			vscode.commands.executeCommand('workbench.view.extension.gitbbon-chat-panel');
		})
	);

	// gitbbon custom: AI에게 물어보기 커맨드 - 에디터에서 선택된 텍스트를 채팅창에 삽입
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.sendText', async (arg?: string | { text: string; fileName?: string }) => {
			let text: string | undefined;
			let fileInfo = '';

			// 인자가 객체인 경우 (gitbbon-editor에서 호출)
			if (arg && typeof arg === 'object') {
				text = arg.text;
				if (arg.fileName) {
					fileInfo = arg.fileName;
				}
			} else if (typeof arg === 'string') {
				text = arg;
			}

			// 텍스트가 전달되지 않은 경우, 현재 에디터에서 선택된 텍스트 사용
			const editor = vscode.window.activeTextEditor;
			if (!text && editor && !editor.selection.isEmpty) {
				text = editor.document.getText(editor.selection);
				// 에디터에서 가져온 경우 파일명과 라인 정보 추가
				const fileName = editor.document.fileName.split('/').pop() || 'unknown';
				const startLine = editor.selection.start.line + 1;
				const endLine = editor.selection.end.line + 1;
				fileInfo = startLine === endLine
					? `${fileName}:L${startLine}`
					: `${fileName}:L${startLine}-${endLine}`;
			}

			if (text) {
				// 백틱 코드 블록으로 감싸기 (파일 정보 포함)
				const formattedText = fileInfo
					? `\`\`\`\n${text}\n— ${fileInfo}\n\`\`\`\n\n`
					: `\`\`\`\n${text}\n\`\`\`\n\n`;

				// Secondary Sidebar 열기 (gitbbon-chat 패널)
				await vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
				// 포맷된 텍스트 전송
				provider.sendTextToChat(formattedText);
			}
		})
	);

	// gitbbon custom: Issue #129 - 전역 AI 모델 선택 Quick Pick 커맨드
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.selectModel', async () => {
			const config = vscode.workspace.getConfiguration('gitbbon');
			const currentBackend = config.get<string>('ai.backend') || 'api';
			const currentOllamaModel = config.get<string>('ai.ollamaModel') || '';

			// 온디바이스 모델 목록 조회
			let installedModels: string[] = [];
			let recommendedModels: import('./services/ollamaService').RecommendedModel[] = [];
			try {
				installedModels = await ollamaService.getInstalledModels();
				recommendedModels = await ollamaService.getRecommendedModels();
			} catch {
			}

			// gitbbon custom: Issue #131 - 현재 선택된 모델 강조를 위해 picked/activeItems 사용

			const isApiCurrent = currentBackend === 'api';
			const apiItem: vscode.QuickPickItem = {
				label: isApiCurrent ? '$(check) $(cloud) Gitbbon AI' : '$(cloud) Gitbbon AI',
				description: 'API 모드',
				picked: isApiCurrent,
			};
			const items: vscode.QuickPickItem[] = [
				apiItem,
				{ label: '', kind: vscode.QuickPickItemKind.Separator },
			];

			if (installedModels.length > 0) {
				items.push({ label: '온디바이스 — 설치됨', kind: vscode.QuickPickItemKind.Separator });
				for (const m of installedModels) {
					const isCurrent = currentBackend === 'ollama' && currentOllamaModel === m;
					items.push({
						label: isCurrent ? `$(check) $(vm) ${m}` : `$(vm) ${m}`,
						description: '온디바이스',
						picked: isCurrent,
					});
				}
			}

			const notInstalled = recommendedModels.filter(m => !m.installed);
			if (notInstalled.length > 0) {
				items.push({ label: '온디바이스 — 다운로드 가능', kind: vscode.QuickPickItemKind.Separator });
				for (const m of notInstalled) {
					items.push({
						label: `$(cloud-download) ${m.name}`,
						description: `${m.sizeGB > 0 ? m.sizeGB.toFixed(1) + 'GB' : '크기 미확인'}`,
						detail: m.description,
					});
				}
			}

			// gitbbon custom: Issue #131 - createQuickPick으로 activeItems 설정하여 현재 선택 항목 강조
			const qp = vscode.window.createQuickPick();
			qp.title = 'AI 모델 선택';
			qp.placeholder = '사용할 AI 모델을 선택하세요';
			qp.items = items;
			const currentItem = items.find(item => item.picked);
			if (currentItem) {
				qp.activeItems = [currentItem];
			}

			const selected = await new Promise<vscode.QuickPickItem | undefined>(resolve => {
				qp.onDidAccept(() => {
					resolve(qp.selectedItems[0]);
					qp.dispose();
				});
				qp.onDidHide(() => {
					resolve(undefined);
					qp.dispose();
				});
				qp.show();
			});

			if (!selected || selected.kind === vscode.QuickPickItemKind.Separator) {
				return;
			}

			if (selected.label.includes('Gitbbon AI')) {
				await config.update('ai.backend', 'api', vscode.ConfigurationTarget.Global);
				provider.getAIService().setBackend('api');
				// WebView에도 동기화
				const webviewView = (provider as any)._webviewView as vscode.WebviewView | undefined;
				if (webviewView) {
					webviewView.webview.postMessage({ type: 'model-changed', backend: 'api', model: '' });
					webviewView.webview.postMessage({ type: 'backend-changed', backend: 'api' });
				}
			} else if (selected.label.includes('$(vm)')) {
				// 온디바이스 설치된 모델 선택
				// gitbbon custom: Issue #131 - $(check) 아이콘 prefix 제거 후 모델명 추출
				const modelName = selected.label.replace('$(check) ', '').replace('$(vm) ', '').trim();
				await config.update('ai.backend', 'ollama', vscode.ConfigurationTarget.Global);
				await config.update('ai.ollamaModel', modelName, vscode.ConfigurationTarget.Global);
				provider.getAIService().setBackend('ollama');
				await provider.getAIService().setOllamaModel(modelName);
				// WebView에도 동기화
				const webviewView = (provider as any)._webviewView as vscode.WebviewView | undefined;
				if (webviewView) {
					webviewView.webview.postMessage({ type: 'model-changed', backend: 'ollama', model: modelName });
					webviewView.webview.postMessage({ type: 'backend-changed', backend: 'ollama' });
					webviewView.webview.postMessage({ type: 'selected-model', model: modelName });
				}
			} else if (selected.label.startsWith('$(cloud-download)')) {
				// gitbbon custom: Issue #134 - 미설치 모델 선택 시 공통 다운로드 함수 호출
				const modelName = selected.label.replace('$(cloud-download) ', '').trim();
				const sizeGB = recommendedModels.find(m => m.name === modelName)?.sizeGB;
				await downloadModelWithConfirm(modelName, sizeGB, provider);
			}
		})
	);

	// gitbbon custom: Issue #129 - gitbbon.generateCommitMessage 커맨드 (gitbbon-manager에서 위임 호출)
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.generateCommitMessage', async (diff: string): Promise<string | null> => {
			const aiService = provider.getAIService();
			try {
				await aiService.ensureInitialized();
				if (!aiService.hasApiKey()) {
					return null;
				}
				// streamAgentChat 대신 단순 텍스트 생성용 API 직접 호출
				const { generateText } = await import('ai');
				const { createOpenAI } = await import('@ai-sdk/openai');
				const apiKey = process.env.AI_GATEWAY_API_KEY || '';
				const openai = createOpenAI({
					apiKey,
					baseURL: 'https://ai-gateway.vercel.sh/v1',
				});
				const { text } = await generateText({
					model: openai('o4-mini'),
					prompt: `다음 Git diff를 분석하여 간결하고 명확한 한글 커밋 메시지를 작성해주세요.\n\n규칙:\n변경 사항을 충실하게 설명\n커밋 메시지만 출력하고 다른 설명은 하지 마세요\n\nGit diff:\n\`\`\`\n${diff.substring(0, 3000)}\n\`\`\`\n\n커밋 메시지:`,
				});
				const result = text.trim();
				return result || null;
			} catch (error) {
				return null;
			}
		})
	);

	// 백엔드 선택 커맨드
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.selectBackend', async () => {
			const webviewView = (provider as any)._webviewView as vscode.WebviewView | undefined;
			if (webviewView) {
				await (provider as any)._handleSelectBackend(webviewView);
			} else {
				vscode.window.showWarningMessage('채팅 패널을 먼저 열어주세요.');
			}
		})
	);

	// API 키 설정 커맨드
	context.subscriptions.push(
		vscode.commands.registerCommand('gitbbon.chat.setApiKey', async () => {
			const aiService = provider.getAIService();
			const success = await aiService.promptForApiKey();

			if (success) {
				vscode.window.showInformationMessage('API 키가 성공적으로 저장되었습니다.');
			} else {
				vscode.window.showWarningMessage('API 키 설정이 취소되었습니다.');
			}
		})
	);

	logService.info('Activated');
}

export function deactivate(): void { }
