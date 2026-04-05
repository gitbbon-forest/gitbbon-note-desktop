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

// 각 suggestion group의 위치 정보 타입
export interface SuggestionGroupInfo {
	groupId: string;
	anchorPos: number; // 그룹의 첫 번째 마크 시작 위치 (coordsAtPos 계산용)
	deleteText: string;
	insertText: string;
}

// 외부에서 카드 정보를 구독하기 위한 콜백 타입
export type SuggestionCardsUpdateCallback = (cards: SuggestionGroupInfo[]) => void;

// 카드 업데이트 콜백 저장소 (에디터 인스턴스별로 하나)
let cardsUpdateCallback: SuggestionCardsUpdateCallback | null = null;

export function setSuggestionCardsCallback(cb: SuggestionCardsUpdateCallback | null) {
	cardsUpdateCallback = cb;
}

// 수락/거절 함수 (외부에서 groupId로 호출)
export function acceptSuggestion(view: EditorView, groupId: string) {
	const ranges = findMarksByGroupId(view, groupId);
	let currentTr = view.state.tr;
	ranges.sort((a, b) => b.from - a.from).forEach(r => {
		if (r.name === 'suggestion_insert') {
			currentTr = currentTr.removeMark(r.from, r.to, view.state.schema.marks.suggestion_insert);
		} else if (r.name === 'suggestion_delete') {
			currentTr = currentTr.delete(r.from, r.to);
		}
	});
	view.dispatch(currentTr);
}

export function rejectSuggestion(view: EditorView, groupId: string) {
	const ranges = findMarksByGroupId(view, groupId);
	let currentTr = view.state.tr;
	ranges.sort((a, b) => b.from - a.from).forEach(r => {
		if (r.name === 'suggestion_insert') {
			currentTr = currentTr.delete(r.from, r.to); // 삽입 제안 거절 -> 삭제
		} else if (r.name === 'suggestion_delete') {
			currentTr = currentTr.removeMark(r.from, r.to, view.state.schema.marks.suggestion_delete); // 삭제 제안 거절 -> 마크만 제거 (복구)
		}
	});
	view.dispatch(currentTr);
}

// 3. 플러그인 본체 (인라인 버튼 위젯 제거, 마진 카드용 정보만 추출)
export const suggestionPlugin = $prose(() => new Plugin({
	key: suggestionPluginKey,
	state: {
		init: (_, state) => ({ decorations: DecorationSet.create(state.doc, []), cards: [] as SuggestionGroupInfo[] }),
		apply(tr, value, oldState, newState) {
			const processedGroups = new Set<string>();
			const cards: SuggestionGroupInfo[] = [];
			// 각 그룹별 텍스트 수집용 맵
			const groupDeleteText: Record<string, string> = {};
			const groupInsertText: Record<string, string> = {};
			const groupAnchorPos: Record<string, number> = {};

			newState.doc.descendants((node, pos) => {
				node.marks.forEach(mark => {
					if (!mark.type.name.startsWith('suggestion_')) return;
					const gid = mark.attrs.groupId;
					if (!gid) return;

					const text = node.isText ? (node.text ?? '') : '';

					if (mark.type.name === 'suggestion_delete') {
						if (!(gid in groupDeleteText)) groupDeleteText[gid] = '';
						groupDeleteText[gid] += text;
						if (!(gid in groupAnchorPos)) groupAnchorPos[gid] = pos;
					} else if (mark.type.name === 'suggestion_insert') {
						if (!(gid in groupInsertText)) groupInsertText[gid] = '';
						groupInsertText[gid] += text;
						if (!(gid in groupAnchorPos)) groupAnchorPos[gid] = pos;
					}
				});
				return true;
			});

			// 그룹별 카드 생성 (anchorPos 순서 정렬)
			const allGroupIds = new Set([...Object.keys(groupDeleteText), ...Object.keys(groupInsertText)]);
			allGroupIds.forEach(gid => {
				cards.push({
					groupId: gid,
					anchorPos: groupAnchorPos[gid] ?? 0,
					deleteText: groupDeleteText[gid] ?? '',
					insertText: groupInsertText[gid] ?? '',
				});
			});

			cards.sort((a, b) => a.anchorPos - b.anchorPos);


			// 콜백으로 카드 정보 전달 (다음 tick에서 React 상태 업데이트)
			if (cardsUpdateCallback) {
				setTimeout(() => cardsUpdateCallback && cardsUpdateCallback(cards), 0);
			}

			return { decorations: DecorationSet.create(newState.doc, []), cards };
		}
	},
	props: { decorations(state) { return this.getState(state)?.decorations ?? DecorationSet.empty; } }
}));

// 4. AI 제안 적용 함수
export function applyAISuggestions(ctx: Ctx, changes: any[]) {
	const view = ctx.get(editorViewCtx);
	const { state } = view;
	let tr = state.tr;

	// 텍스트 검색으로 위치 찾기 (단일 노드 내)
	// gitbbon custom: Issue #109 - 마크다운 리스트 프리픽스(- , * ) 제거 후 검색 지원
	const findPos = (searchText: string): { from: number; to: number } | null => {
		// 검색 후보 목록: 원본, 리스트 프리픽스 제거
		const candidates = [searchText];
		const stripped = searchText.replace(/^[-*+]\s+/, '');
		if (stripped !== searchText) { candidates.push(stripped); }

		let res: { from: number; to: number } | null = null;
		state.doc.descendants((node, pos) => {
			if (res || !node.isText) { return !res; }
			const nodeText = node.text ?? '';
			for (const candidate of candidates) {
				if (nodeText.includes(candidate)) {
					const idx = nodeText.indexOf(candidate);
					res = { from: pos + idx, to: pos + idx + candidate.length };
					return false;
				}
			}
			return true;
		});
		return res;
	};

	// gitbbon custom: Issue #109 - 다중 줄 oldText를 줄 단위로 분리해 각각 처리
	// ProseMirror 텍스트 노드는 블록 경계를 넘지 않으므로 \n 포함 텍스트는 찾을 수 없음
	const expandChanges = (rawChanges: any[]): any[] => {
		const result: any[] = [];
		for (const change of rawChanges) {
			const oldLines = change.oldText?.split('\n') ?? [];
			const newLines = change.newText?.split('\n') ?? [];
			if (oldLines.length > 1) {
				const len = Math.max(oldLines.length, newLines.length);
				for (let i = 0; i < len; i++) {
					const oldLine = oldLines[i];
					const newLine = newLines[i];
					if (oldLine !== undefined && newLine !== undefined && oldLine !== newLine) {
						result.push({ oldText: oldLine, newText: newLine });
					}
				}
			} else {
				result.push(change);
			}
		}
		return result;
	};

	const expanded = expandChanges(changes);

	expanded.reverse().forEach(change => {
		if (!change.oldText) return;
		const pos = findPos(change.oldText);
		const gid = `g-${Math.random().toString(36).substr(2, 9)}`;

		if (pos) {
			tr = tr.addMark(pos.from, pos.to, state.schema.marks.suggestion_delete.create({ groupId: gid }));
			if (change.newText) {
				tr = tr.insert(pos.to, state.schema.text(change.newText, [
					state.schema.marks.suggestion_insert.create({ groupId: gid })
				]));
			}
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
