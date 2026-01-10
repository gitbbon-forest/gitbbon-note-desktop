import React, { forwardRef, useImperativeHandle } from 'react';
import { MilkdownProvider, useEditor, Milkdown } from '@milkdown/react';
import { Crepe } from '@milkdown/crepe';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { editorViewCtx, parserCtx } from '@milkdown/core';
import { $prose } from '@milkdown/utils';
import "@milkdown/crepe/theme/common/style.css";
// import "@milkdown/crepe/theme/frame.css"; // Optional: Frame theme

// gitbbon custom: Inline Suggestion
import { suggestionPlugin, suggestionInsertMark, suggestionDeleteMark, applyAISuggestions, directApplyAISuggestions } from './suggestionPlugin';
import './suggestion.css';

// gitbbon custom: Search functionality
import { search, SearchQuery, setSearchState, findNext, findPrev, getSearchState, getMatchHighlights, replaceNext, replaceAll } from 'prosemirror-search';
import './SearchBar.css';

// gitbbon custom: Hide metadata comments
import { hideGitbbonMetadataPlugin } from './hideMetadataPlugin';

// Milkdown 호환 search 플러그인 래핑
const searchPlugin = $prose(() => search());

// gitbbon custom: 외부 콘텐츠 업데이트 중인지 추적 (루프 방지)
let isSettingContentExternally = false;

interface MilkdownEditorProps {
	initialContent: string;
	onChange: (markdown: string) => void;
	onAskAI?: (selectedText: string) => void;
}

export interface MilkdownEditorRef {
	setContent: (markdown: string) => void;
	getSelectedText: () => string | null;
	getSelectionDetail: () => { text: string; before: string; after: string } | null;
	getCursorContext: () => string | null;
	applySuggestions: (changes: any[]) => void;
	directApply: (changes: any[]) => void;
	focus: () => void;
	// gitbbon custom: Search functionality
	setSearch: (query: string, replace?: string) => void;
	findNextMatch: () => void;
	findPrevMatch: () => void;
	getSearchInfo: () => { matchCount: number; currentMatch: number };
	clearSearch: () => void;
	// gitbbon custom: Replace functionality
	replaceNextMatch: () => void;
	replaceAllMatches: () => void;
}

// gitbbon custom: AI 물어보기 버튼 아이콘 (sparkle)
const askAIIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
	<path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/>
</svg>`;

const EditorComponent = forwardRef<MilkdownEditorRef, MilkdownEditorProps>(({ initialContent, onChange, onAskAI }, ref) => {
	const { get: getInstance, loading } = useEditor((root) => {
		// gitbbon custom: 초기 로드 시 onChange 무시 (초기화 중 발생하는 이벤트 방지)
		isSettingContentExternally = true;
		const crepe = new Crepe({
			root,
			defaultValue: initialContent,
			features: {
				[Crepe.Feature.Placeholder]: false // Optional: Disable placeholder
			},
			// gitbbon custom: 툴바에 AI 물어보기 버튼 추가
			featureConfigs: {
				[Crepe.Feature.Toolbar]: {
					buildToolbar: (builder: any) => {
						// AI 물어보기 그룹 추가
						builder.addGroup('ai', 'AI').addItem('askAI', {
							icon: askAIIcon,
							active: () => false, // 토글 상태 없음
							onRun: (ctx: any) => {
								const view = ctx.get(editorViewCtx);
								const { state } = view;
								const { from, to } = state.selection;
								if (from !== to) {
									const selectedText = state.doc.textBetween(from, to, ' ');
									if (onAskAI && selectedText) {
										onAskAI(selectedText);
									}
								}
							}
						});
					}
				}
			}
		});

		// Configure Listener & Plugins
		crepe.editor
			.config((ctx) => {
				ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
					// gitbbon custom: 외부 업데이트 중에는 onChange 무시 (루프 방지)
					if (isSettingContentExternally) {
						console.log('[gitbbon-editor][MilkdownEditor] Ignoring onChange during external content update');
						return;
					}
					if (markdown !== prevMarkdown) {
						onChange(markdown);
					}
				});
			})
			.use(listener)
			.use(suggestionInsertMark)
			.use(suggestionDeleteMark)
			.use(suggestionPlugin)
			// gitbbon custom: Search functionality
			.use(searchPlugin)
			// gitbbon custom: Hide metadata comments
			.use(hideGitbbonMetadataPlugin);

		// gitbbon custom: 초기 로드 완료 후 플래그 해제 (다음 tick에서)
		setTimeout(() => {
			isSettingContentExternally = false;
		}, 500);

		return crepe;
	}, [onAskAI]);

	useImperativeHandle(ref, () => ({
		setContent: (markdown: string) => {
			if (loading) {
				console.log('[gitbbon-editor][MilkdownEditor] Editor is still loading');
				return;
			}
			const editor = getInstance();
			if (!editor) {
				console.log('[gitbbon-editor][MilkdownEditor] Editor instance is null/undefined');
				return;
			}

			// getInstance() returns Milkdown Editor directly (not Crepe)
			// Editor has action method directly on it
			if (typeof (editor as any).action === 'function') {
				// gitbbon custom: 외부 업데이트 플래그 설정 (루프 방지)
				isSettingContentExternally = true;
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const parser = ctx.get(parserCtx);
					const doc = parser(markdown);
					if (!doc) return;
					const { state } = view;
					view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
				});
				// 플래그 해제 (동기적으로 즉시 해제)
				setTimeout(() => {
					isSettingContentExternally = false;
				}, 0);
				console.log('[gitbbon-editor][MilkdownEditor] ✅ Content updated successfully');
			} else {
				console.error('[gitbbon-editor][MilkdownEditor] ❌ action method not found on editor');
			}
		},
		// gitbbon custom: 선택된 텍스트 가져오기 (AI에게 물어보기 기능용)
		getSelectedText: (): string | null => {
			if (loading) return null;
			const editor = getInstance();
			if (!editor) return null;

			let selectedText: string | null = null;
			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const { state } = view;
					const { from, to } = state.selection;
					if (from !== to) {
						selectedText = state.doc.textBetween(from, to, ' ');
					}
				});
			}
			return selectedText;
		},
		// gitbbon custom [New]: 선택된 텍스트와 전후 문맥 가져오기
		getSelectionDetail: (): { text: string; before: string; after: string } | null => {
			if (loading) return null;
			const editor = getInstance();
			if (!editor) return null;

			let result: { text: string; before: string; after: string } | null = null;
			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const { state } = view;
					const { from, to } = state.selection;
					if (from !== to) {
						const text = state.doc.textBetween(from, to, ' ');
						const docSize = state.doc.content.size;
						const start = Math.max(0, from - 50);
						const end = Math.min(docSize, to + 50);
						const before = state.doc.textBetween(start, from, ' ');
						const after = state.doc.textBetween(to, end, ' ');
						result = { text, before, after };
					}
				});
			}
			return result;
		},
		// gitbbon custom: 커서 주변 문맥 가져오기
		getCursorContext: (): string | null => {
			if (loading) return null;
			const editor = getInstance();
			if (!editor) return null;

			let context: string | null = null;
			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const { state } = view;
					const { from, to } = state.selection;

					// 선택 영역이 비어있을 때만 커서 컨텍스트 수집 (선택 영역이 있으면 null 반환하여 selectionPreview 우선)
					if (from === to) {
						const docSize = state.doc.content.size;
						const start = Math.max(0, from - 500); // 이전 500자 (약 5-10줄)
						const end = Math.min(docSize, to + 500);   // 이후 500자
						context = state.doc.textBetween(start, end, '\n');
					}
				});
			}
			return context;
		},
		// gitbbon custom: AI 제안 적용하기
		applySuggestions: (changes: any[]) => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					applyAISuggestions(ctx, changes);
				});
			}
		},
		// gitbbon custom: AI 제안 바로 적용하기 (Direct Edit)
		directApply: (changes: any[]) => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					directApplyAISuggestions(ctx, changes);
				});
			}
		},
		// 에디터로 포커스 이동
		focus: () => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					view.focus();
				});
			}
		},
		// gitbbon custom: Search functionality - 검색어 설정 (바꾸기 텍스트 포함)
		setSearch: (query: string, replace?: string) => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const searchQuery = new SearchQuery({ search: query, replace: replace || '' });
					const tr = setSearchState(view.state.tr, searchQuery);
					view.dispatch(tr);
				});
			}
		},
		// gitbbon custom: Search functionality - 다음 매치로 이동
		findNextMatch: () => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					findNext(view.state, view.dispatch, view);
				});
			}
		},
		// gitbbon custom: Search functionality - 이전 매치로 이동
		findPrevMatch: () => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					findPrev(view.state, view.dispatch, view);
				});
			}
		},
		// gitbbon custom: Search functionality - 현재 검색 상태 정보
		getSearchInfo: (): { matchCount: number; currentMatch: number } => {
			if (loading) return { matchCount: 0, currentMatch: 0 };
			const editor = getInstance();
			if (!editor) return { matchCount: 0, currentMatch: 0 };

			let result = { matchCount: 0, currentMatch: 0 };
			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const highlights = getMatchHighlights(view.state);
					const decorations = highlights.find();
					result.matchCount = decorations.length;

					// 현재 선택 위치와 가장 가까운 매치 찾기
					if (decorations.length > 0) {
						const { from } = view.state.selection;
						let currentIdx = 1;
						for (let i = 0; i < decorations.length; i++) {
							if (decorations[i].from <= from) {
								currentIdx = i + 1;
							}
						}
						result.currentMatch = Math.min(currentIdx, decorations.length);
					}
				});
			}
			return result;
		},
		// gitbbon custom: Search functionality - 검색 초기화
		clearSearch: () => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const emptyQuery = new SearchQuery({ search: '' });
					const tr = setSearchState(view.state.tr, emptyQuery);
					view.dispatch(tr);
				});
			}
		},
		// gitbbon custom: Replace functionality - 다음 매치 바꾸기
		replaceNextMatch: () => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					replaceNext(view.state, view.dispatch, view);
				});
			}
		},
		// gitbbon custom: Replace functionality - 모두 바꾸기
		replaceAllMatches: () => {
			if (loading) return;
			const editor = getInstance();
			if (!editor) return;

			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					replaceAll(view.state, view.dispatch, view);
				});
			}
		}
	}));

	return <Milkdown />;
});

export const MilkdownEditor = forwardRef<MilkdownEditorRef, MilkdownEditorProps>((props, ref) => {
	return (
		<MilkdownProvider>
			<EditorComponent {...props} ref={ref} />
		</MilkdownProvider>
	);
});
