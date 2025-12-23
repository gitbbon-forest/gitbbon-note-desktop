import React from 'react';

interface ChatInputProps {
	inputValue: string;
	setInputValue: (value: string) => void;
	isLoading: boolean;
	onSubmit: (e: React.FormEvent) => void;
	inputRef?: React.RefObject<HTMLInputElement | null>;
}

const ChatInput: React.FC<ChatInputProps> = ({ inputValue, setInputValue, isLoading, onSubmit, inputRef }) => {
	return (
		<form onSubmit={onSubmit} className="chat-input-form">
			<input
				ref={inputRef}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				placeholder="Say something..."
				disabled={isLoading}
				className="chat-input-field"
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
