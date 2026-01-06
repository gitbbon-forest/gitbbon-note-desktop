import React, { useRef, useEffect } from 'react';

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
}

interface MessageListProps {
	messages: ChatMessage[];
	isLoading: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isLoading }) => {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	return (
		<div className="message-list">
			{messages.map((m) => {
				// system 메시지는 도구 상태 표시용 - 간단한 한 줄로
				if (m.role === 'system') {
					return (
						<div key={m.id} className="tool-status-line">
							{m.content}
						</div>
					);
				}

				return (
					<div key={m.id} className={`message-wrapper ${m.role === 'user' ? 'user' : 'assistant'}`}>
						<div className={`message-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
							<strong>{m.role === 'user' ? 'You' : 'AI'}:</strong>
							<div className="message-content">{m.content}</div>
						</div>
					</div>
				);
			})}
			{isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
				<div className="message-wrapper assistant">
					<div className="message-bubble assistant">
						<strong>AI:</strong> <span className="loading-text">생각 중...</span>
					</div>
				</div>
			)}
			<div ref={messagesEndRef} />
		</div>
	);
};

export default MessageList;
