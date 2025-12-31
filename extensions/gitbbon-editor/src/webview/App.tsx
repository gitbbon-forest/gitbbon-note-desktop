import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MilkdownEditor, MilkdownEditorRef } from './MilkdownEditor';
import { SaveStatus } from './ReallyFinalButton';

declare const acquireVsCodeApi: () => {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
};

const vscode = acquireVsCodeApi();

// Debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	return ((...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			fn(...args);
			timeoutId = null;
		}, delay);
	}) as T;
}

export const App = () => {
	const [title, setTitle] = useState('');
	const [editorContent, setEditorContent] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('committed');
	console.log("🚀 ~ App ~ saveStatus:", saveStatus)
	const editorRef = useRef<MilkdownEditorRef>(null);
	const titleRef = useRef('');
	const contentRef = useRef<string | null>(null);

	// Keep titleRef in sync for callbacks
	useEffect(() => {
		titleRef.current = title;
	}, [title]);

	// Keep contentRef in sync
	useEffect(() => {
		contentRef.current = editorContent;
	}, [editorContent]);

	// Notify extension host when saveStatus changes
	useEffect(() => {
		vscode.postMessage({
			type: 'saveStatusChanged',
			status: saveStatus,
		});
	}, [saveStatus]);

	// Debounced send update (0.5s throttle)
	const debouncedSendUpdate = useMemo(
		() =>
			debounce((newTitle: string, newContent: string) => {
				vscode.postMessage({
					type: 'update',
					frontmatter: { title: newTitle },
					content: newContent,
				});
				// After sending update, status becomes 'autoSaved' (file saved)
				setSaveStatus('autoSaved');
			}, 500),
		[]
	);

	const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newTitle = e.target.value;
		setTitle(newTitle);
		setSaveStatus('unsaved');
		debouncedSendUpdate(newTitle, editorContent || '');
	};

	const handleEditorChangeWithTitle = useCallback((markdown: string) => {
		setEditorContent(markdown);
		setSaveStatus('unsaved');
		debouncedSendUpdate(titleRef.current, markdown);
	}, [debouncedSendUpdate]);

	const handleReallyFinal = useCallback(() => {
		// Send message to extension to perform "Really Final" commit
		vscode.postMessage({
			type: 'reallyFinal',
		});
		// Optimistically set status to committed
		setSaveStatus('committed');
	}, []);

	// gitbbon custom: AI에게 물어보기 기능 - 선택된 텍스트를 채팅으로 전송
	const handleAskAI = useCallback((text?: string) => {
		const selectedText = text || editorRef.current?.getSelectedText();
		if (selectedText) {
			vscode.postMessage({
				type: 'askAI',
				text: selectedText,
			});
		}
	}, []);

	// Cmd+L / Ctrl+L 단축키 처리
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
				e.preventDefault();
				handleAskAI();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleAskAI]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			switch (message.type) {
				case 'init':
				case 'update':
					const remoteTitle = message.frontmatter?.title || '';
					const remoteContent = message.content || '';

					// Update Title
					setTitle(remoteTitle);

					// Update Editor
					const contentChanged = remoteContent !== contentRef.current;

					if (contentRef.current === null) {
						// First load
						setEditorContent(remoteContent);
					} else if (editorRef.current && contentChanged) {
						// Subsequent updates (only if content changed)
						editorRef.current.setContent(remoteContent);
						setEditorContent(remoteContent);
					}
					break;
				case 'statusUpdate':
					// Extension can send status updates
					if (message.status) {
						setSaveStatus(message.status as SaveStatus);
					}
					break;
				// gitbbon-chat에서 선택 텍스트 요청
				case 'getSelection':
					const selectedText = editorRef.current?.getSelectedText() || null;
					vscode.postMessage({
						type: 'selectionResponse',
						text: selectedText,
					});
					break;
				// [New] gitbbon-chat에서 선택 텍스트 + 문맥 요청
				case 'getSelectionDetail':
					const detail = editorRef.current?.getSelectionDetail() || null;
					vscode.postMessage({
						type: 'selectionDetailResponse',
						detail: detail,
					});
					break;
				// gitbbon-chat에서 커서 문맥 요청 (선택 없을 시)
				case 'getCursorContext':
					const cursorContext = editorRef.current?.getCursorContext() || null;
					vscode.postMessage({
						type: 'selectionResponse', // selectionResponse와 같은 채널(타입)을 사용하거나 cursorContextResponse 등으로 분리 가능하지만, Promise 관리가 되어있는 editorProvider쪽 로직 재사용을 위해선 타입을 맞추거나 변경해야 함.
						// EditorProvider.ts의 handleSelectionResponse가 범용적으로 텍스트를 받으므로, 여기서 같은 타입을 재사용하는 것이 가장 효율적임.
						text: cursorContext,
					});
					break;
				// [New] AI 제안 적용
				case 'applySuggestions':
					if (message.changes && Array.isArray(message.changes)) {
						editorRef.current?.applySuggestions(message.changes);
					}
					break;
				// [New] AI 제안 바로 적용 (Direct Edit)
				case 'directApply':
					if (message.changes && Array.isArray(message.changes)) {
						editorRef.current?.directApply(message.changes);
					}
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		vscode.postMessage({ type: 'ready' });

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	if (editorContent === null) {
		return <div className="loading">Loading...</div>;
	}

	return (
		<div className="app" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
			<div className="title-container">
				<input
					id="title-input"
					className="title-input"
					value={title}
					onChange={handleTitleChange}
					placeholder="Title"
				/>
			</div>
			<div className="milkdown-editor" style={{ flexGrow: 1 }}>
				<MilkdownEditor
					ref={editorRef}
					initialContent={editorContent}
					onChange={handleEditorChangeWithTitle}
					onAskAI={handleAskAI}
				/>
			</div>
		</div>
	);
};

