/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'source-map-support/register';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { type ModelMessage } from 'ai';
import { AIService } from './services/aiService';
import { logService } from './services/logService';
import { ollamaService, MODEL_SIZES_GB, type RecommendedModel, type ModelWithCapabilities } from './services/ollamaService';
import { ContextService } from './services/ContextService';

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
			} else if (message.type === 'pull-ollama-model') {
				// gitbbon custom: Issue #69 - 미설치 모델 다운로드 요청 (상태표시줄 진행률 표시)
				const modelName = message.model as string;
				logService.info(`[debug:#69] pull-ollama-model 요청: ${modelName}`);
				webviewView.webview.postMessage({ type: 'model-pull-progress', model: modelName, progress: 0, status: 'pulling' });

				// gitbbon custom: Issue #69 - 상태표시줄에 다운로드 진행률 표시
				if (!this._pullStatusBarItem) {
					this._pullStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
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

export function activate(context: vscode.ExtensionContext): void {
	logService.init();
	const provider = new GitbbonChatViewProvider(context);

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

	// Issue #90: 컨텍스트 갱신은 gitbbon-manager ContextService가 담당 (manager로 이전됨)
	// Issue #90: MCP 설정 파일 생성은 gitbbon-manager McpSetupService가 담당 (manager로 이전됨)

	logService.info('Activated');
}

// ─── MCP 설정 파일 자동 생성 (Issue #90: gitbbon-manager McpSetupService로 이전됨) ──────
// 아래 함수는 하위 호환성을 위해 남겨두되, 실제 호출은 제거되었다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function setupMcpConfigFiles_DEPRECATED(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		logService.info('[debug:#90] setupMcpConfigFiles: 워크스페이스 없음, 스킵');
		return;
	}

	const wsRoot = workspaceFolders[0].uri.fsPath;
	logService.info(`[debug:#90] setupMcpConfigFiles: 워크스페이스 루트=${wsRoot}`);

	// 1. MCP 서버 스크립트를 .gitbbon/mcp-server/index.js 에 복사
	const mcpServerSrc = path.join(context.extensionPath, 'mcp-server', 'index.js');
	const mcpServerDir = path.join(wsRoot, '.gitbbon', 'mcp-server');
	const mcpServerDest = path.join(mcpServerDir, 'index.js');

	try {
		fs.mkdirSync(mcpServerDir, { recursive: true });
		fs.copyFileSync(mcpServerSrc, mcpServerDest);
		logService.info(`[debug:#90] MCP 서버 스크립트 복사 완료: ${mcpServerDest}`);
	} catch (e) {
		logService.warn(`[debug:#90] MCP 서버 스크립트 복사 실패: ${e}`);
		return;
	}

	// 2. 에이전트별 설정 파일 생성
	const mcpJsonContent = JSON.stringify({
		mcpServers: {
			'gitbbon-ide': {
				command: 'node',
				args: ['.gitbbon/mcp-server/index.js']
			}
		}
	}, null, 2);

	const continueJsonContent = JSON.stringify({
		mcpServers: [
			{
				name: 'gitbbon-ide',
				command: 'node',
				args: ['.gitbbon/mcp-server/index.js']
			}
		]
	}, null, 2);

	const codexTomlContent = `[mcp_servers.gitbbon-ide]\ncommand = "node .gitbbon/mcp-server/index.js"\n`;

	const agentFiles: Array<{ relPath: string; content: string }> = [
		{ relPath: '.mcp.json', content: mcpJsonContent },
		{ relPath: path.join('.cursor', 'mcp.json'), content: mcpJsonContent },
		{ relPath: path.join('.vscode', 'mcp.json'), content: mcpJsonContent },
		{ relPath: path.join('.windsurf', 'mcp.json'), content: mcpJsonContent },
		{ relPath: path.join('.gemini', 'settings.json'), content: mcpJsonContent },
		{ relPath: path.join('.codex', 'config.toml'), content: codexTomlContent },
		{ relPath: path.join('.continue', 'mcpServers', 'mcp.json'), content: continueJsonContent },
	];

	for (const { relPath, content } of agentFiles) {
		const fullPath = path.join(wsRoot, relPath);
		const dir = path.dirname(fullPath);
		try {
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(fullPath, content, 'utf-8');
			logService.info(`[debug:#90] 에이전트 설정 파일 생성: ${relPath}`);
		} catch (e) {
			logService.warn(`[debug:#90] 에이전트 설정 파일 생성 실패 (${relPath}): ${e}`);
		}
	}

	// 3. .gitignore 업데이트
	await updateGitignore(wsRoot);

	// 4. VS Code files.exclude 설정
	await updateVscodeExclude(wsRoot);

	logService.info('[debug:#90] setupMcpConfigFiles: 완료');
}

async function updateGitignore(wsRoot: string): Promise<void> {
	const gitignorePath = path.join(wsRoot, '.gitignore');
	const marker = '# gitbbon MCP 설정 (자동 생성)';
	const gitignoreEntries = [
		marker,
		'.mcp.json',
		'.cursor/mcp.json',
		'.vscode/mcp.json',
		'.windsurf/mcp.json',
		'.gemini/settings.json',
		'.codex/config.toml',
		'.continue/mcpServers/mcp.json',
		'.gitbbon/',
		''
	].join('\n');

	try {
		let existing = '';
		try {
			existing = fs.readFileSync(gitignorePath, 'utf-8');
		} catch {
			// 파일 없으면 새로 생성
		}

		if (existing.includes(marker)) {
			logService.info('[debug:#90] .gitignore 이미 업데이트됨, 스킵');
			return;
		}

		const updated = existing.endsWith('\n') || existing === ''
			? existing + gitignoreEntries
			: existing + '\n' + gitignoreEntries;

		fs.writeFileSync(gitignorePath, updated, 'utf-8');
		logService.info('[debug:#90] .gitignore 업데이트 완료');
	} catch (e) {
		logService.warn(`[debug:#90] .gitignore 업데이트 실패: ${e}`);
	}
}

async function updateVscodeExclude(wsRoot: string): Promise<void> {
	const settingsPath = path.join(wsRoot, '.vscode', 'settings.json');
	const excludeKeys: Record<string, boolean> = {
		'.mcp.json': true,
		'.cursor': true,
		'.windsurf': true,
		'.gemini': true,
		'.codex': true,
		'.continue': true,
		'.gitbbon': true,
	};

	try {
		fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

		let settings: Record<string, unknown> = {};
		try {
			const raw = fs.readFileSync(settingsPath, 'utf-8');
			settings = JSON.parse(raw);
		} catch {
			// 파일 없거나 파싱 실패 시 빈 객체로 시작
		}

		const existingExclude = (settings['files.exclude'] as Record<string, boolean>) ?? {};
		const mergedExclude = { ...existingExclude, ...excludeKeys };
		settings['files.exclude'] = mergedExclude;

		fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
		logService.info('[debug:#90] .vscode/settings.json files.exclude 업데이트 완료');
	} catch (e) {
		logService.warn(`[debug:#90] .vscode/settings.json 업데이트 실패: ${e}`);
	}
}

export function deactivate(): void { }
