import React, { useRef } from 'react';

interface ChatInputProps {
	inputValue: string;
	setInputValue: (value: string) => void;
	isSending: boolean; // 전송 중 상태
	isReceiving: boolean; // 수신 중 상태
	onSubmit: (e: React.FormEvent) => void;
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

// 화살표 전송 아이콘 SVG
const SendIcon = () => (
	<svg
		width="16"
		height="16"
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

const ChatInput: React.FC<ChatInputProps> = ({ inputValue, setInputValue, isSending, isReceiving, onSubmit, inputRef }) => {
	const internalRef = useRef<HTMLTextAreaElement>(null);
	const textareaRef = inputRef || internalRef;
	const isLoading = isSending || isReceiving;

	// 텍스트 영역 자동 높이 조절
	React.useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			// 높이 계산을 위해 먼저 높이를 초기화 (줄어들 때 필요)
			textarea.style.height = 'auto';

			// scrollHeight로 내용에 맞는 높이 계산 (최대 200px 제한)
			const computedHeight = Math.min(textarea.scrollHeight, 200);

			// 계산된 높이 적용
			textarea.style.height = `${computedHeight}px`;
		}
	}, [inputValue, textareaRef]);

	// Enter로 전송, Shift+Enter로 줄바꿈 (처리 중에도 입력은 가능하지만 전송은 불가)
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			// 로딩 중이 아니고 입력값이 있을 때만 전송
			if (!isLoading && inputValue.trim()) {
				onSubmit(e as unknown as React.FormEvent);
			}
		}
	};

	// 전송 버튼 비활성화 조건: 로딩 중이거나 입력값이 없을 때
	const isSubmitDisabled = isLoading || !inputValue.trim();

	// 버튼 상태에 따른 클래스
	const getButtonClass = () => {
		if (isSending) return 'chat-submit-btn sending';
		if (isReceiving) return 'chat-submit-btn receiving';
		return 'chat-submit-btn';
	};

	return (
		<form onSubmit={onSubmit} className="chat-input-form">
			<div className="chat-input-container">
				<textarea
					ref={textareaRef}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="메시지를 입력하세요..."
					className="chat-input-field"
					rows={1}
				/>
				<div className="chat-input-actions">
					<button
						type="submit"
						disabled={isSubmitDisabled}
						className={getButtonClass()}
						aria-label="전송"
					>
						<SendIcon />
					</button>
				</div>
			</div>
		</form>
	);
};

export default ChatInput;
