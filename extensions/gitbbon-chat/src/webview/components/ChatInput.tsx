import React, { useRef } from 'react';
import type { ModelType, RecommendedModel, ModelPullStatus, ModelCapabilities } from '../App';

interface ChatInputProps {
	inputValue: string;
	setInputValue: (value: string) => void;
	isSending: boolean; // 전송 중 상태
	isReceiving: boolean; // 수신 중 상태
	onSubmit: (e: React.FormEvent) => void;
	onCancel: () => void;
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
	onCompositionChange?: (isComposing: boolean) => void;
	// gitbbon custom: 모델타입/모델명 셀렉트박스용 props
	modelType: ModelType;
	setModelType: (type: ModelType) => void;
	selectedModel: string;
	setSelectedModel: (model: string) => void;
	ollamaModels: string[];
	// gitbbon custom: Issue #68 - 추천 모델 리스트 및 다운로드 상태
	recommendedModels?: RecommendedModel[];
	modelPullStatus?: ModelPullStatus | null;
	// Issue #77: 모델별 capabilities
	modelCapabilities?: Record<string, ModelCapabilities>;
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

// 정지(Stop) 아이콘 SVG
const StopIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="currentColor"
		stroke="none"
	>
		<rect x="6" y="6" width="12" height="12" rx="2" />
	</svg>
);

const ChatInput: React.FC<ChatInputProps> = ({ inputValue, setInputValue, isSending, isReceiving, onSubmit, onCancel, inputRef, onCompositionChange, modelType, setModelType, selectedModel, setSelectedModel, ollamaModels, recommendedModels, modelPullStatus, modelCapabilities }) => {
	const internalRef = useRef<HTMLTextAreaElement>(null);
	const textareaRef = inputRef || internalRef;
	const isLoading = isSending || isReceiving;
	// IME 조합 중 여부를 추적 (한글 등 CJK 입력 시 발생하는 타이밍 문제 방지)
	const isComposingRef = useRef(false);

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

	// IME 조합 시작 핸들러
	const handleCompositionStart = () => {
		isComposingRef.current = true;
		onCompositionChange?.(true);
	};

	// IME 조합 종료 핸들러
	const handleCompositionEnd = () => {
		isComposingRef.current = false;
		onCompositionChange?.(false);
	};

	// Enter로 전송, Shift+Enter로 줄바꿈 (처리 중에도 입력은 가능하지만 전송은 불가)
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// isComposingRef로 IME 조합 중 여부를 직접 확인
		// (nativeEvent.isComposing은 브라우저/OS에 따라 타이밍이 다를 수 있음)
		if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
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
					onCompositionStart={handleCompositionStart}
					onCompositionEnd={handleCompositionEnd}
					placeholder="메시지를 입력하세요..."
					className="chat-input-field"
					rows={1}
				/>
				<div className="chat-input-actions">
					{/* gitbbon custom: 모델타입/모델명 셀렉트박스 */}
					<div className="chat-model-selects">
						<select
							className="chat-model-select"
							value={modelType}
							onChange={(e) => setModelType(e.target.value as ModelType)}
							disabled={isLoading}
							aria-label="모델 타입"
						>
							<option value="gitbbon">Gitbbon AI</option>
							<option value="ondevice">온디바이스 (무료)</option>
							<option value="byok">BYOK</option>
						</select>
						<select
							className="chat-model-select"
							value={selectedModel}
							onChange={(e) => setSelectedModel(e.target.value)}
							disabled={isLoading || modelType !== 'ondevice' || !!modelPullStatus}
							aria-label="모델 이름"
						>
							{modelType === 'ondevice' ? (
								recommendedModels && recommendedModels.length > 0 ? (
									<>
										{/* gitbbon custom: Issue #68 - 설치된 모델 그룹 */}
										{/* Issue #77: capabilities 뱃지 표시 */}
										{recommendedModels.filter(m => m.installed).length > 0 && (
											<optgroup label="설치됨">
												{recommendedModels.filter(m => m.installed).map((m) => {
													const caps = modelCapabilities?.[m.name] || modelCapabilities?.[`${m.name}:latest`];
													const badges: string[] = [];
													if (caps?.thinking) badges.push('T');
													if (caps?.tools) badges.push('F');
													const badgeStr = badges.length > 0 ? ` [${badges.join('+')}]` : '';
													return (
														<option key={m.name} value={m.name}>
															{m.name}{badgeStr}
														</option>
													);
												})}
											</optgroup>
										)}
										{/* gitbbon custom: Issue #68 - 미설치 추천 모델 그룹 */}
										{recommendedModels.filter(m => !m.installed).length > 0 && (
											<optgroup label="다운로드 가능">
												{recommendedModels.filter(m => !m.installed).map((m) => (
													<option key={m.name} value={m.name}>
														⬇ {m.name} ({m.sizeGB > 0 ? `${m.sizeGB.toFixed(1)}GB` : '크기 미확인'})
													</option>
												))}
											</optgroup>
										)}
									</>
								) : (
									ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)
								)
							) : modelType === 'byok' ? (
								<option value="">준비 중</option>
							) : (
								<option value="">기본 모델</option>
							)}
						</select>
					</div>
					{isLoading ? (
						<button
							type="button"
							onClick={onCancel}
							className="chat-submit-btn stop"
							aria-label="중단"
						>
							<StopIcon />
						</button>
					) : (
						<button
							type="submit"
							disabled={isSubmitDisabled}
							className={getButtonClass()}
							aria-label="전송"
						>
							<SendIcon />
						</button>
					)}
				</div>
			</div>
		</form>
	);
};

export default ChatInput;
