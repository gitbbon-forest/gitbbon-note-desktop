/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MessageList, { ChatMessage } from './components/MessageList';
import ChatInput from './components/ChatInput';

// VS Code API 인터페이스
const vscode = acquireVsCodeApi();

const App: React.FC = () => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

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
		setIsLoading(true);

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
		let currentAssistantContent = '';

		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case 'chat-chunk':
					// AI 응답 청크 수신
					currentAssistantContent += message.chunk;
					setMessages((prev) => {
						const lastMessage = prev[prev.length - 1];
						if (lastMessage?.role === 'assistant') {
							// 기존 어시스턴트 메시지 업데이트
							return [
								...prev.slice(0, -1),
								{ ...lastMessage, content: currentAssistantContent },
							];
						} else {
							// 새 어시스턴트 메시지 추가
							return [
								...prev,
								{
									id: generateId(),
									role: 'assistant',
									content: currentAssistantContent,
								},
							];
						}
					});
					break;

				case 'chat-done':
					// AI 응답 완료
					setIsLoading(false);
					currentAssistantContent = '';
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
			<MessageList messages={messages} isLoading={isLoading} />
			<ChatInput
				inputValue={inputValue}
				setInputValue={setInputValue}
				isLoading={isLoading}
				onSubmit={handleSubmit}
				inputRef={inputRef}
			/>
		</div>
	);
};

export default App;
