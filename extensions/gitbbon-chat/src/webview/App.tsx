import React, { useState, useEffect } from 'react';
import MessageList, { ChatMessage } from './components/MessageList';
import ChatInput from './components/ChatInput';
import './index.css';

const vscode = acquireVsCodeApi();

const App: React.FC = () => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	// Listen for messages from extension host
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;

			if (message.type === 'chat-chunk') {
				// Append chunk to the last assistant message
				setMessages(prev => {
					const updated = [...prev];
					const lastMessage = updated[updated.length - 1];

					if (lastMessage && lastMessage.role === 'assistant') {
						lastMessage.content += message.chunk;
					} else {
						// Create new assistant message if none exists
						updated.push({
							id: generateId(),
							role: 'assistant',
							content: message.chunk
						});
					}
					return updated;
				});
			} else if (message.type === 'chat-done') {
				setIsLoading(false);
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const generateId = () => Math.random().toString(36).substring(2, 15);

	const onFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputValue.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: generateId(),
			role: 'user',
			content: inputValue
		};

		// Add user message and prepare for assistant response
		setMessages(prev => [...prev, userMessage]);
		setInputValue('');
		setIsLoading(true);

		// Send to extension host
		vscode.postMessage({
			type: 'chat-request',
			messages: [...messages, userMessage].map(m => ({
				role: m.role,
				content: m.content
			}))
		});
	};

	return (
		<div className="app-container">
			<MessageList messages={messages} isLoading={isLoading} />
			<ChatInput
				inputValue={inputValue}
				setInputValue={setInputValue}
				isLoading={isLoading}
				onSubmit={onFormSubmit}
			/>
		</div>
	);
};

export default App;
