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

const App: React.FC = () => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isSending, setIsSending] = useState(false); // 전송 중 상태
	const [isReceiving, setIsReceiving] = useState(false); // 수신 중 상태
	const [thinkingContent, setThinkingContent] = useState(''); // thinking 내용
	const [currentBackend, setCurrentBackend] = useState<'api' | 'ollama'>('api');
	const [ollamaStatus, setOllamaStatus] = useState<{ step: string; detail: string; progress?: number } | null>(null);
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
		setThinkingContent('');
		lastUserMessageRef.current = userContent;

		const allMessages = [...currentMessages, userMessage]
			.filter((m) => m.role !== 'system')
			.map((m) => ({
				role: m.role,
				content: m.content,
			}));

		vscode.postMessage({
			type: 'chat-request',
			messages: allMessages,
		});
	}, []);

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
		setThinkingContent('');
	}, []);

	// 새 대화 시작
	const handleNewChat = useCallback(() => {
		setMessages([]);
		setInputValue('');
		setIsSending(false);
		setIsReceiving(false);
		currentAssistantContentRef.current = '';
		setThinkingContent('');
		toolStatusMapRef.current.clear();
		lastUserMessageRef.current = '';
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
					if (message.backend !== 'ollama') {
						setOllamaStatus(null);
					}
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

				case 'chat-thinking-content':
					setThinkingContent(prev => prev + message.content);
					break;

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
					<button
						className="backend-select-btn"
						onClick={() => vscode.postMessage({ type: 'select-backend' })}
						title={`백엔드: ${currentBackend === 'ollama' ? 'Ollama (로컬)' : 'API'}`}
					>
						⚙️
					</button>
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
			<MessageList messages={messages} isLoading={isSending || isReceiving} onRetry={handleRetry} thinkingContent={thinkingContent} />
			<ChatInput
				inputValue={inputValue}
				setInputValue={setInputValue}
				isSending={isSending}
				isReceiving={isReceiving}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
				inputRef={inputRef}
			/>
		</div>
	);
};

export default App;
