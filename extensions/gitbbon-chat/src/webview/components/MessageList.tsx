import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CopyableCodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({ children, ...props }) => {
	const [copied, setCopied] = useState(false);
	const preRef = useRef<HTMLPreElement>(null);

	const handleCopy = useCallback(() => {
		const text = preRef.current?.textContent ?? '';
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, []);

	return (
		<div className="code-block-wrapper">
			<button className="code-copy-btn" onClick={handleCopy} title="Copy code">
				{copied ? 'Copied!' : 'Copy'}
			</button>
			<pre ref={preRef} {...props}>{children}</pre>
		</div>
	);
};

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
}

interface MessageListProps {
	messages: ChatMessage[];
	isLoading: boolean;
	onRetry?: () => void;
}

// system 메시지 content를 파싱하여 tool status 또는 error인지 판별
function parseSystemContent(content: string): { type: 'tool'; data: ToolStatusData } | { type: 'error'; message: string } | { type: 'text'; content: string } {
	try {
		const parsed = JSON.parse(content);
		if (parsed.error) {
			return { type: 'error', message: parsed.message };
		}
		if (parsed.toolName) {
			return { type: 'tool', data: parsed as ToolStatusData };
		}
	} catch {
		// JSON이 아닌 경우 기존 텍스트 형식
	}
	return { type: 'text', content };
}

interface ToolStatusData {
	toolName: string;
	args?: Record<string, unknown>;
	isRunning: boolean;
	duration?: number;
	success?: boolean;
}

const ToolStatusLine: React.FC<{ data: ToolStatusData }> = ({ data }) => {
	const argsText = data.args && Object.keys(data.args).length > 0
		? Object.values(data.args).map(v => typeof v === 'string' ? v.slice(0, 40) : String(v)).join(', ')
		: '';
	const timeText = data.duration !== undefined ? ` (${(data.duration / 1000).toFixed(1)}s)` : '';
	const summary = `${data.toolName}${argsText ? ` ${argsText}` : ''}${timeText}`;

	if (!data.args || Object.keys(data.args).length === 0) {
		return <div className="tool-status-line">{summary}</div>;
	}

	return (
		<details className="tool-accordion">
			<summary className="tool-accordion-summary">{summary}</summary>
			<div className="tool-accordion-detail">
				{Object.entries(data.args).map(([key, value]) => (
					<div key={key} className="tool-arg-row">
						<span className="tool-arg-key">{key}:</span>
						<span className="tool-arg-value">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
					</div>
				))}
			</div>
		</details>
	);
};

const ErrorMessage: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => {
	return (
		<div className="error-message">
			<div className="error-message-text">⚠ {message}</div>
			{onRetry && (
				<button className="error-retry-btn" onClick={onRetry}>
					다시 시도
				</button>
			)}
		</div>
	);
};

const MessageList: React.FC<MessageListProps> = ({ messages, isLoading, onRetry }) => {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	return (
		<div className="message-list">
			{messages.map((m) => {
				// system 메시지 처리
				if (m.role === 'system') {
					const parsed = parseSystemContent(m.content);
					if (parsed.type === 'error') {
						return <ErrorMessage key={m.id} message={parsed.message} onRetry={onRetry} />;
					}
					if (parsed.type === 'tool') {
						return <ToolStatusLine key={m.id} data={parsed.data} />;
					}
					return (
						<div key={m.id} className="tool-status-line">
							{parsed.content}
						</div>
					);
				}

				return (
					<div key={m.id} className={`message-wrapper ${m.role === 'user' ? 'user' : 'assistant'}`}>
						<div className={`message-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
							<strong>{m.role === 'user' ? 'You' : 'AI'}:</strong>
							<div className="message-content">
								{m.role === 'assistant' ? (
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{ pre: CopyableCodeBlock }}
									>
										{m.content}
									</ReactMarkdown>
								) : (
									m.content
								)}
							</div>
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
