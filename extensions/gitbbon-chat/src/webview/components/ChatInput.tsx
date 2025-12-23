import React, { useEffect, useRef } from 'react';

interface ChatInputProps {
	inputValue: string;
	setInputValue: (value: string) => void;
	isLoading: boolean;
	onSubmit: (e: React.FormEvent) => void;
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

const ChatInput: React.FC<ChatInputProps> = ({ inputValue, setInputValue, isLoading, onSubmit, inputRef }) => {
	const internalRef = useRef<HTMLTextAreaElement>(null);
	const textareaRef = inputRef || internalRef;

	// 텍스트 영역 자동 높이 조절
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
		}
	}, [inputValue, textareaRef]);

	// Enter로 전송, Shift+Enter로 줄바꿈
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (!isLoading && inputValue.trim()) {
				onSubmit(e as unknown as React.FormEvent);
			}
		}
	};

	return (
		<form onSubmit={onSubmit} className="chat-input-form">
			<textarea
				ref={textareaRef}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Say something... (Shift+Enter for new line)"
				disabled={isLoading}
				className="chat-input-field"
				rows={1}
			/>
			<button
				type="submit"
				disabled={isLoading}
				className={`chat-submit-btn ${isLoading ? 'loading' : ''}`}
			>
				{isLoading ? '...' : 'Send'}
			</button>
		</form>
	);
};

export default ChatInput;
