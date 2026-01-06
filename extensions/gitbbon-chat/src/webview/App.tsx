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
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const currentAssistantContentRef = useRef(''); // 스트리밍 콘텐츠 추적용
	const toolStatusMapRef = useRef<Map<string, { name: string; args?: Record<string, unknown> }>>(new Map());

	// 메시지 ID 생성
	const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

	// 도구 상태를 텍스트로 변환
	const formatToolStatus = (
		type: 'start' | 'end',
		name: string,
		args?: Record<string, unknown>,
		duration?: number,
		success?: boolean
	): string => {
		const argsText = args && Object.keys(args).length > 0
			? ` ${Object.values(args).map(v => typeof v === 'string' ? v.slice(0, 40) : String(v)).join(', ')}`
			: '';

		if (type === 'start') {
			return `⏳ ${name}${argsText}`;
		} else {
			const icon = success ? '✅' : '❌';
			const timeText = duration !== undefined ? ` (${(duration / 1000).toFixed(1)}s)` : '';
			return `${icon} ${name}${argsText}${timeText}`;
		}
	};

	// 메시지 전송
	const handleSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault();
		const trimmedInput = inputValue.trim();
		if (!trimmedInput) return;

		// 사용자 메시지 추가
		const userMessage: ChatMessage = {
			id: generateId(),
			role: 'user',
			content: trimmedInput,
		};

		setMessages((prev) => [...prev, userMessage]);
		setInputValue('');
		setIsSending(true); // 전송 시작
		toolStatusMapRef.current.clear(); // 도구 상태 맵 초기화
		currentAssistantContentRef.current = ''; // 초기화

		// Extension에 채팅 요청 전송
		const allMessages = [...messages, userMessage].map((m) => ({
			role: m.role,
			content: m.content,
		}));

		vscode.postMessage({
			type: 'chat-request',
			messages: allMessages,
		});
	}, [inputValue, messages]);

	// Extension으로부터 메시지 수신
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case 'chat-tool-status': {
					// 도구 진행 상황을 한 줄 메시지로 표시
					const toolEvent = message.event;
					setIsSending(false);

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

				case 'chat-done':
					setIsSending(false);
					setIsReceiving(false);
					currentAssistantContentRef.current = '';
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
			<MessageList messages={messages} isLoading={isSending || isReceiving} />
			<ChatInput
				inputValue={inputValue}
				setInputValue={setInputValue}
				isSending={isSending}
				isReceiving={isReceiving}
				onSubmit={handleSubmit}
				inputRef={inputRef}
			/>
		</div>
	);
};

export default App;
