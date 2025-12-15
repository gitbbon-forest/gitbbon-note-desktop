import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MilkdownEditor, MilkdownEditorRef } from './MilkdownEditor';
import { ReallyFinalButton, SaveStatus } from './ReallyFinalButton';

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
		<div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
			<div className="title-container">
				<input
					id="title-input"
					className="title-input"
					value={title}
					onChange={handleTitleChange}
					placeholder="Title"
				/>
			</div>
			<div className="milkdown-editor" style={{ flexGrow: 1, overflowY: 'auto' }}>
				<MilkdownEditor
					ref={editorRef}
					initialContent={editorContent}
					onChange={handleEditorChangeWithTitle}
				/>
			</div>
			<ReallyFinalButton
				status={saveStatus}
				onReallyFinal={handleReallyFinal}
			/>
		</div>
	);
};

