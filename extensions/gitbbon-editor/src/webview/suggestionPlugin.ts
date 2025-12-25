import { $prose, $mark } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import { editorViewCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';

export const suggestionPluginKey = new PluginKey('inline-suggestion');

// 1. 마크 정의 (Insert/Delete)
export const suggestionInsertMark = $mark('suggestion_insert', () => ({
	attrs: { id: { default: '' }, groupId: { default: '' } },
	toDOM: (mark) => ['ins', { class: 'suggestion-insert', 'data-group-id': mark.attrs.groupId }, 0],
	parseDOM: [{ tag: 'ins.suggestion-insert', getAttrs: (dom) => ({ groupId: (dom as HTMLElement).getAttribute('data-group-id') }) }],
	toMarkdown: {
		match: (mark) => mark.type.name === 'suggestion_insert',
		runner: (state, mark, node) => {
			// 마크다운 변환 시에는 시각적 요소만 제거하고 텍스트는 남길지, 아니면 별도 문법을 쓸지 결정해야 함.
			// 여기서는 일반 텍스트로 처리하거나 HTML 태그로 남길 수 있음.
			// 하지만 지금은 기능 구현이 우선이므로 빈 runner (텍스트만 렌더링됨)
		}
	},
	parseMarkdown: {
		match: (node) => false, // 마크다운 파싱은 지원하지 않음 (일시적 뷰 전용)
		runner: (state, node, type) => { }
	}
}));

export const suggestionDeleteMark = $mark('suggestion_delete', () => ({
	attrs: { id: { default: '' }, groupId: { default: '' } },
	toDOM: (mark) => ['del', { class: 'suggestion-delete', 'data-group-id': mark.attrs.groupId }, 0],
	parseDOM: [{ tag: 'del.suggestion-delete', getAttrs: (dom) => ({ groupId: (dom as HTMLElement).getAttribute('data-group-id') }) }],
	toMarkdown: {
		match: (mark) => mark.type.name === 'suggestion_delete',
		runner: (state, mark, node) => { }
	},
	parseMarkdown: {
		match: (node) => false,
		runner: (state, node, type) => { }
	}
}));

// 2. 수락/거절 핵심 로직 (ID 기반 동적 검측)
function findMarksByGroupId(view: EditorView, groupId: string) {
	const results: any[] = [];
	view.state.doc.descendants((node, pos) => {
		node.marks.forEach(mark => {
			if (mark.attrs.groupId === groupId) {
				results.push({ from: pos, to: pos + node.nodeSize, name: mark.type.name });
			}
		});
		return true;
	});
	return results;
}

// 3. 플러그인 본체
export const suggestionPlugin = $prose(() => new Plugin({
	key: suggestionPluginKey,
	state: {
		init: (_, state) => ({ decorations: DecorationSet.create(state.doc, []) }),
		apply(tr, value, oldState, newState) {
			const decorations: Decoration[] = [];
			const processedGroups = new Set();
			newState.doc.descendants((node, pos) => {
				node.marks.forEach(mark => {
					if (mark.type.name.startsWith('suggestion_')) {
						const gid = mark.attrs.groupId;
						if (gid && processedGroups.has(gid)) {
							return;
						}
						if (gid) {
							processedGroups.add(gid);
						}

						// 버튼 UI 생성 (Decoration.widget)
						decorations.push(Decoration.widget(pos + node.nodeSize, (view) => {
							const dom = document.createElement('div');
							dom.className = 'suggestion-hover-menu';
							dom.innerHTML = `<button class="suggestion-btn accept">✓</button><button class="suggestion-btn reject">✕</button>`;

							const acceptBtn = dom.querySelector('.accept');
							const rejectBtn = dom.querySelector('.reject');

							acceptBtn?.addEventListener('click', () => {
								const ranges = findMarksByGroupId(view, gid);
								let currentTr = view.state.tr;
								// 역순 정렬 (인덱스 꼬임 방지)
								ranges.sort((a, b) => b.from - a.from).forEach(r => {
									if (r.name === 'suggestion_insert') {
										currentTr = currentTr.removeMark(r.from, r.to, view.state.schema.marks.suggestion_insert);
									} else if (r.name === 'suggestion_delete') {
										currentTr = currentTr.delete(r.from, r.to);
									}
								});
								view.dispatch(currentTr);
							});

							rejectBtn?.addEventListener('click', () => {
								const ranges = findMarksByGroupId(view, gid);
								let currentTr = view.state.tr;
								ranges.sort((a, b) => b.from - a.from).forEach(r => {
									if (r.name === 'suggestion_insert') {
										currentTr = currentTr.delete(r.from, r.to); // 삽입 제안 거절 -> 삭제
									} else if (r.name === 'suggestion_delete') {
										currentTr = currentTr.removeMark(r.from, r.to, view.state.schema.marks.suggestion_delete); // 삭제 제안 거절 -> 마크만 제거 (복구)
									}
								});
								view.dispatch(currentTr);
							});

							return dom;
						}, { side: 1 }));
					}
				});
			});
			return { decorations: DecorationSet.create(newState.doc, decorations) };
		}
	},
	props: { decorations(state) { return this.getState(state).decorations; } }
}));

// 4. AI 제안 적용 함수
export function applyAISuggestions(ctx: Ctx, changes: any[]) {
	const view = ctx.get(editorViewCtx);
	const { state } = view;
	let tr = state.tr;

	// 텍스트 검색으로 위치 찾기
	const findPos = (searchText: string): { from: number; to: number } | null => {
		let res: { from: number; to: number } | null = null;
		// 전체 문서 스캔
		state.doc.descendants((node, pos) => {
			if (node.isText && node.text?.includes(searchText)) {
				if (res) {
					return false;
				}

				const idx = node.text.indexOf(searchText);
				res = { from: pos + idx, to: pos + idx + searchText.length };
				return false; // Stop iteration
			}
			return true;
		});
		return res;
	};

	changes.reverse().forEach(change => {
		const pos = findPos(change.oldText);
		const gid = `g-${Math.random().toString(36).substr(2, 9)}`;

		if (pos) {
			// 기존 텍스트: 삭제 제안 마크
			tr = tr.addMark(pos.from, pos.to, state.schema.marks.suggestion_delete.create({ groupId: gid }));

			// 새 텍스트: 그 뒤에 삽입 제안 마크와 함께 삽입
			if (change.newText) {
				tr = tr.insert(pos.to, state.schema.text(change.newText, [
					state.schema.marks.suggestion_insert.create({ groupId: gid })
				]));
			}
		} else if (!change.oldText && change.newText) {
			// Insert only case handling if needed
		}
	});

	view.dispatch(tr);
}

// 5. Direct Edit Implementation (No Suggestions)
export function directApplyAISuggestions(ctx: Ctx, changes: any[]) {
	const view = ctx.get(editorViewCtx);
	const { state } = view;
	let tr = state.tr;

	const findPos = (searchText: string): { from: number; to: number } | null => {
		let res: { from: number; to: number } | null = null;
		state.doc.descendants((node, pos) => {
			if (node.isText && node.text?.includes(searchText)) {
				if (res) { return false; }
				const idx = node.text.indexOf(searchText);
				res = { from: pos + idx, to: pos + idx + searchText.length };
				return false;
			}
			return true;
		});
		return res;
	};

	changes.forEach(change => {
		if (change.oldText) {
			const pos = findPos(change.oldText);
			if (pos) {
				tr = tr.delete(pos.from, pos.to);
				if (change.newText) {
					tr = tr.insert(pos.from, state.schema.text(change.newText));
				}
			}
		} else if (change.newText) {
			// Append if no oldText (fallback behavior for new content)
			tr = tr.insert(tr.doc.content.size, state.schema.text(change.newText));
		}
	});

	view.dispatch(tr);
}
