import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';

// VS Code 테마 변수와 연동되는 커스텀 스타일 (CSS 변수로 덮어씀)
const vscodeStyle: { [key: string]: React.CSSProperties } = {
	'pre[class*="language-"]': {
		background: 'var(--vscode-textCodeBlock-background)',
		color: 'var(--vscode-editor-foreground)',
		fontFamily: 'var(--vscode-editor-font-family, monospace)',
		fontSize: '0.9em',
		margin: 0,
		padding: '12px',
		borderRadius: '6px',
		overflow: 'auto',
	},
	'code[class*="language-"]': {
		background: 'transparent',
		color: 'var(--vscode-editor-foreground)',
		fontFamily: 'var(--vscode-editor-font-family, monospace)',
	},
	// Keywords
	keyword: { color: 'var(--vscode-symbolIcon-keywordForeground, #569cd6)' },
	'control-flow': { color: 'var(--vscode-symbolIcon-keywordForeground, #c586c0)' },
	// Strings
	string: { color: 'var(--vscode-debugTokenExpression-string, #ce9178)' },
	'template-string': { color: 'var(--vscode-debugTokenExpression-string, #ce9178)' },
	// Comments
	comment: { color: 'var(--vscode-editorGhostText-foreground, #6a9955)', fontStyle: 'italic' },
	// Numbers
	number: { color: 'var(--vscode-debugTokenExpression-number, #b5cea8)' },
	// Functions
	function: { color: 'var(--vscode-symbolIcon-functionForeground, #dcdcaa)' },
	'function-variable': { color: 'var(--vscode-symbolIcon-functionForeground, #dcdcaa)' },
	// Classes/Types
	'class-name': { color: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)' },
	builtin: { color: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)' },
	// Operators
	operator: { color: 'var(--vscode-foreground, #d4d4d4)' },
	// Punctuation
	punctuation: { color: 'var(--vscode-foreground, #d4d4d4)' },
	// Properties
	property: { color: 'var(--vscode-symbolIcon-propertyForeground, #9cdcfe)' },
	// Parameters
	parameter: { color: 'var(--vscode-symbolIcon-variableForeground, #9cdcfe)' },
	// Booleans
	boolean: { color: 'var(--vscode-debugTokenExpression-boolean, #569cd6)' },
	// Tags (HTML/JSX)
	tag: { color: 'var(--vscode-symbolIcon-colorForeground, #4ec9b0)' },
	'attr-name': { color: 'var(--vscode-symbolIcon-propertyForeground, #9cdcfe)' },
	'attr-value': { color: 'var(--vscode-debugTokenExpression-string, #ce9178)' },
};

interface SyntaxHighlightedCodeProps {
	inline?: boolean;
	className?: string;
	children?: React.ReactNode;
}

const SyntaxHighlightedCode: React.FC<SyntaxHighlightedCodeProps> = ({
	inline,
	className,
	children,
}) => {
	const match = /language-(\w+)/.exec(className ?? '');
	const language = match ? match[1] : '';
	const codeText = String(children).replace(/\n$/, '');

	if (inline || !match) {
		return <code className={className}>{children}</code>;
	}

	return (
		<SyntaxHighlighter
			style={vscodeStyle as SyntaxHighlighterProps['style']}
			language={language}
			PreTag="div"
			customStyle={{
				margin: 0,
				padding: '12px',
				background: 'var(--vscode-textCodeBlock-background)',
				borderRadius: '6px',
				fontSize: '0.9em',
				lineHeight: '1.45',
			}}
		>
			{codeText}
		</SyntaxHighlighter>
	);
};

const CopyableCodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement> & { children?: React.ReactNode }> = ({ children, ...props }) => {
	const [copied, setCopied] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const handleCopy = useCallback(() => {
		const text = wrapperRef.current?.textContent ?? '';
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, []);

	return (
		<div className="code-block-wrapper" ref={wrapperRef}>
			<button className="code-copy-btn" onClick={handleCopy} title="Copy code">
				{copied ? 'Copied!' : 'Copy'}
			</button>
			<div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
		</div>
	);
};

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	// Issue #64: AI 추론(reasoning) 과정 텍스트
	reasoning?: string;
}

interface MessageListProps {
	messages: ChatMessage[];
	isLoading: boolean;
	isReceiving?: boolean; // Issue #70: 스트리밍 수신 중 여부 (reasoning 기본 열림 판별용)
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

const MessageList: React.FC<MessageListProps> = ({ messages, isLoading, isReceiving, onRetry }) => {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	return (
		<div className="message-list">
			{messages.map((m, index) => {
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

				// Issue #70: 마지막 assistant 메시지이고 아직 스트리밍 중이면 reasoning이 진행 중
				const isLastMessage = index === messages.length - 1;
				const isReasoningStreaming = m.role === 'assistant' && isLastMessage && isReceiving && !!m.reasoning && !m.content;

				return (
					<div key={m.id} className={`message-wrapper ${m.role === 'user' ? 'user' : 'assistant'}`}>
						<div className={`message-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
							<strong>{m.role === 'user' ? 'You' : 'AI'}:</strong>
							{/* Issue #70: AI 추론(reasoning) 모던 아코디언 */}
							{m.role === 'assistant' && m.reasoning && (
								<details
									className={`reasoning-accordion ${isReasoningStreaming ? 'reasoning-streaming' : ''}`}
									open={isReasoningStreaming || undefined}
								>
									<summary className="reasoning-accordion-summary">
										{isReasoningStreaming ? (
											<span className="reasoning-label-streaming">
												<span className="thinking-indicator" />
												추론 중...
											</span>
										) : (
											<span className="reasoning-label">추론 과정</span>
										)}
									</summary>
									<div className="reasoning-accordion-detail">
										{m.reasoning}
									</div>
								</details>
							)}
							<div className="message-content">
								{m.role === 'assistant' ? (
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{
										pre: CopyableCodeBlock,
										code: SyntaxHighlightedCode,
										table: ({ children, ...props }) => (
											<div className="table-wrapper">
												<table {...props}>{children}</table>
											</div>
										),
										th: ({ children, style, ...props }) => <th style={style} {...props}>{children}</th>,
										td: ({ children, style, ...props }) => <td style={style} {...props}>{children}</td>,
									}}
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
