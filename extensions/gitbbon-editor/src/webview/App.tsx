import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MilkdownEditor, MilkdownEditorRef } from './MilkdownEditor';
import { SaveStatus } from './ReallyFinalButton';
import { SearchBar } from './SearchBar';
import { Loader } from './Loader';

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
	// gitbbon custom: 마지막으로 Webview에서 Extension으로 보낸 콘텐츠 (루프 방지)
	const lastSentContentRef = useRef<string | null>(null);

	// gitbbon custom: Search state
	const [showSearchBar, setShowSearchBar] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [replaceText, setReplaceText] = useState('');
	const [searchInfo, setSearchInfo] = useState({ matchCount: 0, currentMatch: 0 });

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
		console.log('[gitbbon-editor][App] handleEditorChangeWithTitle called');
		setEditorContent(markdown);
		setSaveStatus('unsaved');
		// gitbbon custom: 보낸 콘텐츠 기록 (루프 방지)
		lastSentContentRef.current = markdown;
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

	// milkdown-editor 영역의 빈 공간 클릭 시 에디터로 포커스 이동
	const handleEditorAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		// 클릭 대상이 milkdown-editor div 자체일 때만 포커스 이동
		if (e.target === e.currentTarget) {
			editorRef.current?.focus();
		}
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

	// gitbbon custom: Search handlers
	const handleSearchChange = useCallback((query: string, replace?: string) => {
		setSearchQuery(query);
		if (replace !== undefined) {
			setReplaceText(replace);
		}
		editorRef.current?.setSearch(query, replace);
		// 약간의 지연 후 매치 정보 업데이트
		setTimeout(() => {
			const info = editorRef.current?.getSearchInfo() || { matchCount: 0, currentMatch: 0 };
			setSearchInfo(info);
		}, 50);
	}, []);

	const handleReplaceChange = useCallback((replace: string) => {
		setReplaceText(replace);
		editorRef.current?.setSearch(searchQuery, replace);
	}, [searchQuery]);

	const handleFindNext = useCallback(() => {
		editorRef.current?.findNextMatch();
		setTimeout(() => {
			const info = editorRef.current?.getSearchInfo() || { matchCount: 0, currentMatch: 0 };
			setSearchInfo(info);
		}, 50);
	}, []);

	const handleFindPrev = useCallback(() => {
		editorRef.current?.findPrevMatch();
		setTimeout(() => {
			const info = editorRef.current?.getSearchInfo() || { matchCount: 0, currentMatch: 0 };
			setSearchInfo(info);
		}, 50);
	}, []);

	const handleReplaceNext = useCallback(() => {
		editorRef.current?.replaceNextMatch();
		setTimeout(() => {
			const info = editorRef.current?.getSearchInfo() || { matchCount: 0, currentMatch: 0 };
			setSearchInfo(info);
		}, 50);
	}, []);

	const handleReplaceAll = useCallback(() => {
		editorRef.current?.replaceAllMatches();
		setTimeout(() => {
			const info = editorRef.current?.getSearchInfo() || { matchCount: 0, currentMatch: 0 };
			setSearchInfo(info);
		}, 50);
	}, []);

	const handleSearchClose = useCallback(() => {
		setShowSearchBar(false);
		setSearchQuery('');
		setReplaceText('');
		editorRef.current?.clearSearch();
		editorRef.current?.focus();
		setSearchInfo({ matchCount: 0, currentMatch: 0 });
	}, []);

	// Cmd+L / Ctrl+L 단축키 처리 (AI) + Cmd+F / Ctrl+F 처리 (검색)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// gitbbon custom: Cmd+F / Ctrl+F - 검색 바 열기
			if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
				e.preventDefault();
				e.stopPropagation();
				setShowSearchBar(true);
				return;
			}
			// Cmd+L / Ctrl+L - AI 물어보기
			if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
				e.preventDefault();
				handleAskAI();
			}
		};
		window.addEventListener('keydown', handleKeyDown, true); // capture phase
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [handleAskAI]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			switch (message.type) {
				case 'init':
				case 'update':
					const remoteTitle = message.frontmatter?.title || '';
					const remoteContent = message.content || '';

					console.log(`[gitbbon-editor][App] Received ${message.type} message`);
					console.log(`[gitbbon-editor][App] remoteContent length: ${remoteContent.length}, contentRef length: ${contentRef.current?.length || 'null'}`);

					// Update Title
					setTitle(remoteTitle);

					// Update Editor
					const contentChanged = remoteContent !== contentRef.current;
					console.log(`[gitbbon-editor][App] contentChanged: ${contentChanged}`);

					if (contentRef.current === null) {
						// First load
						console.log('[gitbbon-editor][App] First load, setting initial content');
						setEditorContent(remoteContent);
						lastSentContentRef.current = remoteContent;
					} else if (editorRef.current && contentChanged) {
						// gitbbon custom: 에코 감지 - 우리가 보낸 콘텐츠가 돌아온 경우 무시
						if (lastSentContentRef.current === remoteContent) {
							console.log('[gitbbon-editor][App] Ignoring echo - content matches what we sent');
							break;
						}

						// Subsequent updates (only if content changed and not echo)
						console.log('[gitbbon-editor][App] External content update detected');
						editorRef.current.setContent(remoteContent);
						setEditorContent(remoteContent);
						lastSentContentRef.current = remoteContent;
					}

					// [New] Handle initial status (e.g. if draft exists)
					if (message.type === 'init' && message.initialStatus) {
						console.log(`[gitbbon-editor][App] Setting initial status: ${message.initialStatus}`);
						setSaveStatus(message.initialStatus as SaveStatus);
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
		return <Loader />;
	}

	return (
		<div className="app" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
			{/* gitbbon custom: Search Bar */}
			{showSearchBar && (
				<SearchBar
					searchQuery={searchQuery}
					onSearchChange={handleSearchChange}
					onFindNext={handleFindNext}
					onFindPrev={handleFindPrev}
					onClose={handleSearchClose}
					matchCount={searchInfo.matchCount}
					currentMatch={searchInfo.currentMatch}
					replaceText={replaceText}
					onReplaceChange={handleReplaceChange}
					onReplaceNext={handleReplaceNext}
					onReplaceAll={handleReplaceAll}
				/>
			)}
			<div className="title-container">
				<input
					id="title-input"
					className="title-input"
					value={title}
					onChange={handleTitleChange}
					placeholder="Title"
				/>
			</div>
			<div className="milkdown-editor" style={{ flexGrow: 1 }} onClick={handleEditorAreaClick}>
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

