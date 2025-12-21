import React, { useState, useEffect, useRef } from 'react';

const vscode = acquireVsCodeApi();

interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
}

const App: React.FC = () => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

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

		const userMessage: Message = {
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
		<div style={{
			padding: '20px',
			maxWidth: '800px',
			margin: '0 auto',
			display: 'flex',
			flexDirection: 'column',
			height: '100vh',
			boxSizing: 'border-box'
		}}>
			<div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
				{messages.map((m) => (
					<div key={m.id} style={{ marginBottom: '10px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
						<div style={{
							display: 'inline-block',
							padding: '10px',
							borderRadius: '8px',
							backgroundColor: m.role === 'user' ? '#007acc' : '#252526',
							color: 'white',
							maxWidth: '80%'
						}}>
							<strong>{m.role === 'user' ? 'You' : 'AI'}:</strong>
							<div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
						</div>
					</div>
				))}
				{isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
					<div style={{ textAlign: 'left', marginBottom: '10px' }}>
						<div style={{
							display: 'inline-block',
							padding: '10px',
							borderRadius: '8px',
							backgroundColor: '#252526',
							color: 'white'
						}}>
							<strong>AI:</strong> <span style={{ opacity: 0.6 }}>생각 중...</span>
						</div>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			<form onSubmit={onFormSubmit} style={{ display: 'flex', gap: '10px' }}>
				<input
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					placeholder="Say something..."
					disabled={isLoading}
					style={{
						flex: 1,
						padding: '10px',
						borderRadius: '4px',
						border: '1px solid #3c3c3c',
						backgroundColor: '#3c3c3c',
						color: 'white'
					}}
				/>
				<button
					type="submit"
					disabled={isLoading}
					style={{
						padding: '10px 20px',
						backgroundColor: isLoading ? '#555' : '#007acc',
						color: 'white',
						border: 'none',
						borderRadius: '4px',
						cursor: isLoading ? 'not-allowed' : 'pointer'
					}}
				>
					{isLoading ? '...' : 'Send'}
				</button>
			</form>
		</div>
	);
};

export default App;
