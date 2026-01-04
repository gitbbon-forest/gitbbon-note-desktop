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

	// 메시지 ID 생성
	const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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
				case 'chat-chunk':
					// AI 응답 청크 수신 - 전송 완료, 수신 중으로 전환
					currentAssistantContentRef.current += message.chunk;
					const newContent = currentAssistantContentRef.current;

					// flushSync로 즉시 렌더링하여 스트리밍 효과 구현
					flushSync(() => {
						setIsSending(false);
						setIsReceiving(true);
						setMessages((prev) => {
							const lastMessage = prev[prev.length - 1];
							if (lastMessage?.role === 'assistant') {
								// 기존 어시스턴트 메시지 업데이트
								return [
									...prev.slice(0, -1),
									{ ...lastMessage, content: newContent },
								];
							} else {
								// 새 어시스턴트 메시지 추가
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
					// AI 응답 완료
					setIsSending(false);
					setIsReceiving(false);
					currentAssistantContentRef.current = '';
					break;

				case 'insertText':
					// 외부에서 텍스트 삽입 요청 (AI에게 물어보기)
					if (message.text) {
						setInputValue((prev) => prev + message.text);
						// 입력 필드에 포커스
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
