/// <reference lib="dom" />
/**
 * gitbbon custom: Issue #29 - 컨텍스트 메뉴 포맷 선택 드롭다운 플러그인
 *
 * 텍스트를 선택했을 때 나타나는 Crepe Toolbar(.milkdown-toolbar)에
 * H1~H6, Paragraph 포맷 선택 드롭다운을 삽입한다.
 *
 * 구현 방식:
 * - ProseMirror Plugin view를 활용해 state 변경 시 드롭다운을 갱신
 * - MutationObserver로 .milkdown-toolbar DOM 생성을 감지하고 드롭다운 삽입
 * - setBlockType(prosemirror-commands)으로 블록 타입 변경
 *
 * 참고: $prose 래핑은 MilkdownEditor.tsx에서 수행한다.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { setBlockType } from 'prosemirror-commands';

// 포맷 옵션 목록
const FORMAT_OPTIONS = [
	{ label: '본문', value: 'paragraph', attrs: null },
	{ label: '제목 1', value: 'heading', attrs: { level: 1 } },
	{ label: '제목 2', value: 'heading', attrs: { level: 2 } },
	{ label: '제목 3', value: 'heading', attrs: { level: 3 } },
	{ label: '제목 4', value: 'heading', attrs: { level: 4 } },
	{ label: '제목 5', value: 'heading', attrs: { level: 5 } },
	{ label: '제목 6', value: 'heading', attrs: { level: 6 } },
] as const;

/**
 * 현재 선택 위치의 블록 노드 타입과 속성을 가져온다.
 */
function getCurrentBlockFormat(state: any): { type: string; level?: number } {
	const { $from } = state.selection;
	const node = $from.node($from.depth);
	if (!node) { return { type: 'paragraph' }; }
	if (node.type.name === 'heading') {
		return { type: 'heading', level: node.attrs.level };
	}
	return { type: node.type.name };
}

/**
 * 드롭다운에 표시할 현재 포맷 레이블 반환
 */
function getCurrentLabel(state: any): string {
	const fmt = getCurrentBlockFormat(state);
	if (fmt.type === 'heading') {
		return `제목 ${fmt.level}`;
	}
	if (fmt.type === 'paragraph') {
		return '본문';
	}
	return '포맷';
}

/**
 * 드롭다운 DOM 요소 생성
 */
function createDropdown(view: any): HTMLElement {
	console.log('[debug:#29] formatDropdownPlugin: 드롭다운 생성');

	const wrapper = document.createElement('div');
	wrapper.className = 'gitbbon-format-dropdown-wrapper';
	wrapper.setAttribute('data-gitbbon-format-dropdown', 'true');

	const select = document.createElement('select');
	select.className = 'gitbbon-format-select';
	select.title = '포맷 선택';

	FORMAT_OPTIONS.forEach(opt => {
		const option = document.createElement('option');
		option.value = JSON.stringify({ value: opt.value, attrs: opt.attrs });
		option.textContent = opt.label;
		select.appendChild(option);
	});

	// 현재 포맷으로 초기 값 설정
	updateDropdownValue(select, view.state);

	// 포맷 선택 이벤트
	select.addEventListener('mousedown', (e) => {
		e.stopPropagation();
	});

	select.addEventListener('change', (e) => {
		e.preventDefault();
		e.stopPropagation();

		const parsed = JSON.parse((e.target as HTMLSelectElement).value);
		console.log('[debug:#29] formatDropdownPlugin: 포맷 변경 ->', parsed);

		const { schema, state, dispatch } = {
			schema: view.state.schema,
			state: view.state,
			dispatch: view.dispatch,
		};

		const nodeType = schema.nodes[parsed.value];
		if (!nodeType) {
			console.warn('[debug:#29] formatDropdownPlugin: 노드 타입을 찾을 수 없음 ->', parsed.value);
			return;
		}

		const cmd = setBlockType(nodeType, parsed.attrs || undefined);
		const applied = cmd(state, dispatch);
		console.log('[debug:#29] formatDropdownPlugin: setBlockType 적용 결과 ->', applied);

		// 에디터 포커스 복구
		view.focus();
	});

	wrapper.appendChild(select);
	return wrapper;
}

/**
 * 드롭다운의 현재 선택 값을 에디터 상태에 맞게 업데이트
 */
function updateDropdownValue(select: HTMLSelectElement, state: any): void {
	const fmt = getCurrentBlockFormat(state);
	const options = Array.from(select.options);
	for (const option of options) {
		const parsed = JSON.parse(option.value);
		if (parsed.value === fmt.type) {
			if (fmt.type === 'heading') {
				if (parsed.attrs && parsed.attrs.level === fmt.level) {
					select.value = option.value;
					return;
				}
			} else {
				select.value = option.value;
				return;
			}
		}
	}
	// 매칭 없으면 첫 번째 선택
	if (options.length > 0) {
		select.value = options[0].value;
	}
}

/**
 * 툴바에 드롭다운 삽입 또는 업데이트
 */
function ensureDropdownInToolbar(toolbar: HTMLElement, view: any): void {
	let wrapper = toolbar.querySelector('[data-gitbbon-format-dropdown]') as HTMLElement | null;

	if (!wrapper) {
		console.log('[debug:#29] formatDropdownPlugin: 툴바에 드롭다운 삽입');
		wrapper = createDropdown(view);
		// 툴바의 첫 번째 자식으로 삽입
		toolbar.insertBefore(wrapper, toolbar.firstChild);
	} else {
		// 기존 드롭다운 값 업데이트
		const select = wrapper.querySelector('.gitbbon-format-select') as HTMLSelectElement | null;
		if (select) {
			updateDropdownValue(select, view.state);
		}
	}
}

/**
 * 포맷 드롭다운 ProseMirror 플러그인 factory
 * MilkdownEditor.tsx에서 $prose(() => createFormatDropdownPlugin()) 형태로 사용한다.
 */
export function createFormatDropdownPlugin(): Plugin {
	let observer: MutationObserver | null = null;
	let currentView: any = null;

	// MutationObserver로 .milkdown-toolbar DOM 감시
	function startObserver(view: any): void {
		if (observer) { return; }

		console.log('[debug:#29] formatDropdownPlugin: MutationObserver 시작');

		observer = new MutationObserver(() => {
			const toolbar = document.querySelector('.milkdown-toolbar') as HTMLElement | null;
			if (toolbar && currentView) {
				const { from, to } = currentView.state.selection;
				if (from !== to) {
					ensureDropdownInToolbar(toolbar, currentView);
				}
			}
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: false,
		});
	}

	return new Plugin({
		key: new PluginKey('formatDropdownPlugin'),
		view: (editorView: any) => {
			currentView = editorView;
			startObserver(editorView);

			return {
				update: (view: any, _prevState: any) => {
					currentView = view;

					const toolbar = document.querySelector('.milkdown-toolbar') as HTMLElement | null;
					if (!toolbar) { return; }

					const { from, to } = view.state.selection;
					if (from === to) {
						// 선택 없으면 드롭다운 제거
						const existing = toolbar.querySelector('[data-gitbbon-format-dropdown]');
						if (existing) {
							console.log('[debug:#29] formatDropdownPlugin: 선택 해제 - 드롭다운 제거');
							existing.remove();
						}
						return;
					}

					// 선택이 있으면 드롭다운 삽입/업데이트
					ensureDropdownInToolbar(toolbar, view);
				},
				destroy: () => {
					console.log('[debug:#29] formatDropdownPlugin: 플러그인 해제');
					if (observer) {
						observer.disconnect();
						observer = null;
					}
					currentView = null;
					// 드롭다운 정리
					const existing = document.querySelector('[data-gitbbon-format-dropdown]');
					if (existing) { existing.remove(); }
				},
			};
		},
	});
}
