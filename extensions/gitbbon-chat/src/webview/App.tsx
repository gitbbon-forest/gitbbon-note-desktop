/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import MessageList, { ChatMessage } from './components/MessageList';
import ChatInput from './components/ChatInput';

// VS Code API 인터페이스
const vscode = acquireVsCodeApi();

// gitbbon custom: 모델타입 UI 레이블 타입 (셀렉트박스용)
export type ModelType = 'gitbbon' | 'ondevice' | 'byok';

// gitbbon custom: Issue #68 - 추천 모델 정보 인터페이스
export interface RecommendedModel {
	name: string;
	sizeGB: number;
	installed: boolean;
	description: string;
}

// gitbbon custom: Issue #68 - 모델 다운로드 진행 상태
export interface ModelPullStatus {
	model: string;
	progress: number;
	status: 'pulling' | 'done' | 'error';
}

// ollama 모델명 폴백 목록 (설치된 모델 없을 때 사용)
const FALLBACK_OLLAMA_MODELS = ['llama3.1:8b', 'llama3.2:3b', 'llama3.2:1b', 'gemma2:2b', 'gemma2:9b', 'phi3:mini', 'mistral:7b', 'qwen2.5:7b', 'qwen2.5:3b'];

const App: React.FC = () => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isSending, setIsSending] = useState(false); // 전송 중 상태
	const [isReceiving, setIsReceiving] = useState(false); // 수신 중 상태
	const [currentBackend, setCurrentBackend] = useState<'api' | 'ollama'>('api');
	const [ollamaStatus, setOllamaStatus] = useState<{ step: string; detail: string; progress?: number } | null>(null);
	// gitbbon custom: 채팅 입력창 셀렉트박스용 상태
	const [modelType, setModelType] = useState<ModelType>('gitbbon');
	const [selectedModel, setSelectedModel] = useState<string>('');
	const [ollamaModels, setOllamaModels] = useState<string[]>([]);
	// gitbbon custom: Issue #68 - 추천 모델 리스트 및 다운로드 관리 상태
	const [recommendedModels, setRecommendedModels] = useState<RecommendedModel[]>([]);
	const [freeDiskGB, setFreeDiskGB] = useState<number>(Infinity);
	const [modelPullStatus, setModelPullStatus] = useState<ModelPullStatus | null>(null);
	const [downloadConfirm, setDownloadConfirm] = useState<RecommendedModel | null>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const currentAssistantContentRef = useRef(''); // 스트리밍 콘텐츠 추적용
	const toolStatusMapRef = useRef<Map<string, { name: string; args?: Record<string, unknown> }>>(new Map());
	const lastUserMessageRef = useRef<string>(''); // 마지막 사용자 메시지 저장 (재시도용)

	// 메시지 ID 생성
	const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

	// 도구 상태를 구조화된 JSON으로 변환
	const formatToolStatus = (
		type: 'start' | 'end',
		name: string,
		args?: Record<string, unknown>,
		duration?: number,
		success?: boolean
	): string => {
		return JSON.stringify({
			toolName: name,
			args: args,
			isRunning: type === 'start',
			duration: duration,
			success: success,
		});
	};

	// 메시지 전송 (재시도 시에도 사용)
	const sendChatRequest = useCallback((userContent: string, currentMessages: ChatMessage[]) => {
		const userMessage: ChatMessage = {
			id: generateId(),
			role: 'user',
			content: userContent,
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsSending(true);
		toolStatusMapRef.current.clear();
		currentAssistantContentRef.current = '';
		lastUserMessageRef.current = userContent;

		const allMessages = [...currentMessages, userMessage]
			.filter((m) => m.role !== 'system')
			.map((m) => ({
				role: m.role,
				content: m.content,
			}));

		// gitbbon custom: 선택된 모델을 extension에 전달
		vscode.postMessage({
			type: 'chat-request',
			messages: allMessages,
			selectedModel,
		});
	}, [selectedModel]);

	// 메시지 전송
	const handleSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault();
		const trimmedInput = inputValue.trim();
		if (!trimmedInput) return;

		setInputValue('');
		// IME(한글 등) 조합 후 submit 시 마지막 글자가 textarea에 남는 버그 수정:
		// React 상태 초기화와 함께 textarea DOM 값도 직접 비워서 IME 잔여 문자를 제거
		if (inputRef.current) {
			inputRef.current.value = '';
		}
		sendChatRequest(trimmedInput, messages);
	}, [inputValue, messages, sendChatRequest, inputRef]);

	// 재시도
	const handleRetry = useCallback(() => {
		if (!lastUserMessageRef.current) return;

		// 마지막 에러 메시지 제거
		setMessages((prev) => {
			const filtered = prev.filter((m) => m.role !== 'system' || !m.content.startsWith('{"error":'));
			// 마지막 사용자 메시지도 제거 (재전송하므로)
			const lastUserIdx = filtered.findLastIndex((m) => m.role === 'user');
			if (lastUserIdx >= 0) {
				return filtered.slice(0, lastUserIdx);
			}
			return filtered;
		});

		// 재전송 시 현재 messages에서 에러와 마지막 user 메시지 제외
		setMessages((prev) => {
			sendChatRequest(lastUserMessageRef.current, prev);
			return prev;
		});
	}, [sendChatRequest]);

	// 응답 취소
	const handleCancel = useCallback(() => {
		vscode.postMessage({ type: 'chat-cancel' });
		setIsSending(false);
		setIsReceiving(false);
		currentAssistantContentRef.current = '';
	}, []);

	// gitbbon custom: ollamaModels 변경 시 selectedModel 동기화
	useEffect(() => {
		if (modelType === 'ondevice' && ollamaModels.length > 0) {
			if (!ollamaModels.includes(selectedModel)) {
				setSelectedModel(ollamaModels[0]);
			}
		}
	}, [ollamaModels, modelType]);

	// gitbbon custom: 모델타입 셀렉트 변경 시 백엔드 전환 메시지 전송
	const handleModelTypeChange = useCallback((type: ModelType) => {
		setModelType(type);
		setSelectedModel('');
		if (type === 'ondevice') {
			vscode.postMessage({ type: 'select-backend', backend: 'ollama' });
			// gitbbon custom: Issue #68 - 추천 모델 리스트 요청
			vscode.postMessage({ type: 'get-recommended-models' });
		} else if (type === 'gitbbon') {
			vscode.postMessage({ type: 'select-backend', backend: 'api' });
		}
		// byok는 아직 미구현 — 선택만 저장
	}, []);

	// gitbbon custom: Issue #68 - 모델 선택 변경 시, 미설치 모델이면 다운로드 확인
	const handleModelSelect = useCallback((model: string) => {
		const recommended = recommendedModels.find(m => m.name === model);
		if (recommended && !recommended.installed) {
			// 미설치 모델: 다운로드 확인 다이얼로그 표시
			setDownloadConfirm(recommended);
			return;
		}
		setSelectedModel(model);
		vscode.postMessage({ type: 'save-selected-model', model });
	}, [recommendedModels]);

	// gitbbon custom: Issue #68 - 다운로드 확인 후 모델 다운로드 시작
	const handleConfirmDownload = useCallback(() => {
		if (!downloadConfirm) return;
		const modelName = downloadConfirm.name;
		setDownloadConfirm(null);
		vscode.postMessage({ type: 'pull-ollama-model', model: modelName });
	}, [downloadConfirm]);

	// gitbbon custom: Issue #68 - 다운로드 취소
	const handleCancelDownload = useCallback(() => {
		setDownloadConfirm(null);
	}, []);

	// 새 대화 시작
	const handleNewChat = useCallback(() => {
		setMessages([]);
		setInputValue('');
		setIsSending(false);
		setIsReceiving(false);
		currentAssistantContentRef.current = '';
		toolStatusMapRef.current.clear();
		lastUserMessageRef.current = '';
	}, []);

	// gitbbon custom: 마운트 완료 후 extension에 준비 신호 전송 (race condition 방지)
	useEffect(() => {
		vscode.postMessage({ type: 'webview-ready' });
	}, []);

	// Extension으로부터 메시지 수신
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case 'ollama-status':
					setOllamaStatus({ step: message.step, detail: message.detail, progress: message.progress });
					break;

				case 'backend-changed':
					setCurrentBackend(message.backend as 'api' | 'ollama');
					// gitbbon custom: 저장된 backend로 modelType UI 복원
					setModelType(message.backend === 'ollama' ? 'ondevice' : 'gitbbon');
					if (message.backend !== 'ollama') {
						setOllamaStatus(null);
					}
					break;

				// gitbbon custom: 저장된 선택 모델 복원
				case 'selected-model':
					if (message.model) {
						setSelectedModel(message.model);
					}
					break;

				// gitbbon custom: extension에서 ollama 설치 모델 목록 수신
				case 'ollama-models':
					setOllamaModels(message.models as string[]);
					// gitbbon custom: selectedModel이 비어있으면 첫 번째 모델 자동 선택 및 저장
					setSelectedModel((prev: string) => {
						const models = message.models as string[];
						if (!prev && models.length > 0) {
							vscode.postMessage({ type: 'save-selected-model', model: models[0] });
							return models[0];
						}
						return prev;
					});
					break;

				case 'chat-tool-status': {
					// 도구 진행 상황을 한 줄 메시지로 표시
					const toolEvent = message.event;
					setIsSending(false);
					setIsReceiving(true);

					if (toolEvent.type === 'tool-start') {
						// 시작 메시지 추가 및 ID 저장
						toolStatusMapRef.current.set(toolEvent.id, {
							name: toolEvent.toolName,
							args: toolEvent.args
						});

						const statusText = formatToolStatus('start', toolEvent.toolName, toolEvent.args);
						setMessages(prev => [...prev, {
							id: toolEvent.id,
							role: 'system' as const,
							content: statusText
						}]);
					} else if (toolEvent.type === 'tool-end') {
						// 시작 메시지를 완료 메시지로 업데이트
						const toolInfo = toolStatusMapRef.current.get(toolEvent.id);
						if (toolInfo) {
							const statusText = formatToolStatus(
								'end',
								toolInfo.name,
								toolInfo.args,
								toolEvent.duration,
								toolEvent.success
							);
							setMessages(prev => prev.map(m =>
								m.id === toolEvent.id
									? { ...m, content: statusText }
									: m
							));
						}
					}
					break;
				}

				case 'chat-chunk':
					// AI 응답 청크 수신
					currentAssistantContentRef.current += message.chunk;
					const newContent = currentAssistantContentRef.current;

					flushSync(() => {
						setIsSending(false);
						setIsReceiving(true);
						setMessages((prev) => {
							const lastMessage = prev[prev.length - 1];
							if (lastMessage?.role === 'assistant') {
								return [
									...prev.slice(0, -1),
									{ ...lastMessage, content: newContent },
								];
							} else {
								return [
									...prev,
									{
										id: generateId(),
										role: 'assistant',
										content: newContent,
									},
								];
							}
						});
					});
					break;

				case 'chat-error':
					// 에러 메시지 수신
					setIsSending(false);
					setIsReceiving(false);
					currentAssistantContentRef.current = '';
					setMessages(prev => [...prev, {
						id: generateId(),
						role: 'system' as const,
						content: JSON.stringify({ error: true, message: message.message })
					}]);
					break;

				case 'chat-done':
					setIsSending(false);
					setIsReceiving(false);
					currentAssistantContentRef.current = '';
					break;

				// gitbbon custom: Issue #68 - 추천 모델 리스트 수신
				case 'recommended-models':
					setRecommendedModels(message.models as RecommendedModel[]);
					if (typeof message.freeDiskGB === 'number') {
						setFreeDiskGB(message.freeDiskGB);
					}
					break;

				// gitbbon custom: Issue #68 - 모델 다운로드 진행 상태 수신
				case 'model-pull-progress': {
					const pullStatus: ModelPullStatus = {
						model: message.model,
						progress: message.progress,
						status: message.status,
					};
					if (pullStatus.status === 'done') {
						setModelPullStatus(null);
						// 다운로드 완료 시 선택 모델로 설정
						setSelectedModel(pullStatus.model);
						vscode.postMessage({ type: 'save-selected-model', model: pullStatus.model });
					} else if (pullStatus.status === 'error') {
						setModelPullStatus(null);
					} else {
						setModelPullStatus(pullStatus);
					}
					break;
				}

				case 'insertText':
					if (message.text) {
						setInputValue((prev) => prev + message.text);
						setTimeout(() => {
							inputRef.current?.focus();
						}, 100);
					}
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	return (
		<div className="chat-container">
			<div className="chat-header">
				<span className="chat-header-title">Gitbbon Chat</span>
				<div className="chat-header-actions">
					{/* gitbbon custom: ⚙️ 버튼 제거 - 모델 설정이 채팅 입력창 셀렉트박스로 이동 */}
					<button
						className="new-chat-btn"
						onClick={handleNewChat}
						title="새 대화 시작"
						disabled={isSending || isReceiving}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 5v14M5 12h14"/>
						</svg>
						새 대화
					</button>
				</div>
			</div>
			{ollamaStatus && ollamaStatus.step !== 'ready' && (
				<div className={`ollama-banner ollama-banner--${ollamaStatus.step}`}>
					{ollamaStatus.step === 'checking' && <span>Ollama 확인 중...</span>}
					{ollamaStatus.step === 'installing' && <span>Ollama 설치 중...</span>}
					{ollamaStatus.step === 'pulling' && (
						<span>모델 다운로드 중... {ollamaStatus.progress ?? 0}%</span>
					)}
					{ollamaStatus.step === 'error' && (
						<div className="ollama-error">
							<pre>{ollamaStatus.detail}</pre>
						</div>
					)}
				</div>
			)}
			{/* gitbbon custom: Issue #68 - 모델 다운로드 진행률 배너 */}
			{modelPullStatus && (
				<div className="ollama-banner ollama-banner--pulling">
					<span>모델 다운로드 중: {modelPullStatus.model} ({modelPullStatus.progress}%)</span>
					<div className="model-pull-progress-bar">
						<div className="model-pull-progress-fill" style={{ width: `${modelPullStatus.progress}%` }} />
					</div>
				</div>
			)}
			{/* gitbbon custom: Issue #68 - 미설치 모델 다운로드 확인 다이얼로그 */}
			{downloadConfirm && (
				<div className="model-download-confirm">
					<div className="model-download-confirm-content">
						<p className="model-download-confirm-title">모델 다운로드</p>
						<p className="model-download-confirm-info">
							<strong>{downloadConfirm.name}</strong><br />
							{downloadConfirm.description}<br />
							다운로드 크기: {downloadConfirm.sizeGB > 0 ? `${downloadConfirm.sizeGB.toFixed(1)}GB` : '크기 미확인'}<br />
							디스크 여유 공간: {freeDiskGB !== Infinity ? `${freeDiskGB.toFixed(1)}GB` : '확인 불가'}
							{downloadConfirm.sizeGB > 0 && freeDiskGB < downloadConfirm.sizeGB + 1 && (
								<span className="model-download-disk-warning"><br />디스크 여유 공간이 부족할 수 있습니다.</span>
							)}
						</p>
						<div className="model-download-confirm-actions">
							<button className="model-download-btn-cancel" onClick={handleCancelDownload}>취소</button>
							<button className="model-download-btn-confirm" onClick={handleConfirmDownload}>다운로드</button>
						</div>
					</div>
				</div>
			)}
			<MessageList messages={messages} isLoading={isSending || isReceiving} onRetry={handleRetry} />
			<ChatInput
				inputValue={inputValue}
				setInputValue={setInputValue}
				isSending={isSending}
				isReceiving={isReceiving}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
				inputRef={inputRef}
				modelType={modelType}
				setModelType={handleModelTypeChange}
				selectedModel={selectedModel}
				setSelectedModel={handleModelSelect}
				ollamaModels={ollamaModels.length > 0 ? ollamaModels : FALLBACK_OLLAMA_MODELS}
				recommendedModels={recommendedModels}
				modelPullStatus={modelPullStatus}
			/>
		</div>
	);
};

export default App;
