import React, { useEffect, useRef } from 'react';

interface ChatInputProps {
	inputValue: string;
	setInputValue: (value: string) => void;
	isLoading: boolean;
	onSubmit: (e: React.FormEvent) => void;
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

// 화살표 전송 아이콘 SVG
const SendIcon = () => (
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M5 12h14M12 5l7 7-7 7" />
	</svg>
);

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

	// 전송 버튼 비활성화 조건: 로딩 중이거나 입력값이 없을 때
	const isSubmitDisabled = isLoading || !inputValue.trim();

	return (
		<form onSubmit={onSubmit} className="chat-input-form">
			<textarea
				ref={textareaRef}
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="메시지를 입력하세요..."
				className="chat-input-field"
				rows={1}
			/>
			<button
				type="submit"
				disabled={isSubmitDisabled}
				className={`chat-submit-btn ${isLoading ? 'loading' : ''}`}
				aria-label="전송"
			>
				<SendIcon />
			</button>
		</form>
	);
};

export default ChatInput;
