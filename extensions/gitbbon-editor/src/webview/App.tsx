import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MilkdownEditor, MilkdownEditorRef } from './MilkdownEditor';

declare const acquireVsCodeApi: () => {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
};

const vscode = acquireVsCodeApi();

export const App = () => {
	const [title, setTitle] = useState('');
	const [editorContent, setEditorContent] = useState<string | null>(null);
	const editorRef = useRef<MilkdownEditorRef>(null);
	const titleRef = useRef('');

	// Keep titleRef in sync for callbacks
	useEffect(() => {
		titleRef.current = title;
	}, [title]);

	const sendUpdate = (newTitle: string, newContent: string) => {
		vscode.postMessage({
			type: 'update',
			frontmatter: { title: newTitle },
			content: newContent
		});
	};

	const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newTitle = e.target.value;
		setTitle(newTitle);
		// Use current editor content if available, otherwise empty string
		sendUpdate(newTitle, editorContent || '');
	};

	const handleEditorChangeWithTitle = useCallback((markdown: string) => {
		// Update local state without triggering re-render if possible?
		// But we need state to be consistent.
		setEditorContent(markdown);
		sendUpdate(titleRef.current, markdown);
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
					setTitle(prev => {
						// Avoid overwriting if focused?
						// For now accepting remote updates effectively
						return remoteTitle;
					});

					// Update Editor
					if (editorContent === null) {
						// First load
						setEditorContent(remoteContent);
					} else {
						// Subsequent updates
						if (editorRef.current) {
							// Only update if content is actually different to avoid cursor jumps
							// (Though Milkdown setContent might handle diffing or selection preservation? Likely not complete preservation)
							// We rely on extension not echoing back identical content
							editorRef.current.setContent(remoteContent);
							setEditorContent(remoteContent);
						}
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
		</div>
	);
};
