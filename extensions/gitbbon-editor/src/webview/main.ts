/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createEditor } from './editor';

/**
 * Webview 진입점
 * VS Code Webview 내에서 실행되는 코드
 */

// VS Code API 타입 정의
declare const acquireVsCodeApi: () => {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
};

const vscode = acquireVsCodeApi();

let editor: any = null;
let titleInput: HTMLInputElement | null = null;
let currentFrontmatter: Record<string, any> = {};
let currentContent: string = '';

// 한글 조합 상태 플래그
let isComposing = false;

/**
 * 초기화
 */
async function init() {
	// 제목 입력 필드 초기화
	titleInput = document.getElementById('title-input') as HTMLInputElement;
	if (titleInput) {
		// 한글 조합 시작
		titleInput.addEventListener('compositionstart', () => {
			isComposing = true;
		});

		// 한글 조합 종료
		titleInput.addEventListener('compositionend', (e) => {
			isComposing = false;
			// 조합이 완료된 최종 값을 반영
			const target = e.target as HTMLInputElement;
			currentFrontmatter.title = target.value;
			sendUpdate();
		});

		titleInput.addEventListener('input', (e) => {
			// 조합 중일 때도 업데이트는 보내되(실시간 반영),
			// 돌아오는 업데이트에 의해 덮어씌워지지 않도록 isComposing 플래그로 보호됨
			const target = e.target as HTMLInputElement;
			currentFrontmatter.title = target.value;
			sendUpdate();
		});
	}

	// Milkdown Editor 초기화
	const editorContainer = document.getElementById('editor');
	if (editorContainer) {
		editor = await createEditor(editorContainer, (content) => {
			currentContent = content;
			sendUpdate();
		});
	}

	// Extension에 준비 완료 알림
	vscode.postMessage({ type: 'ready' });
}

/**
 * Extension으로 업데이트 전송
 */
function sendUpdate() {
	vscode.postMessage({
		type: 'update',
		frontmatter: currentFrontmatter,
		content: currentContent
	});
}

/**
 * Extension으로부터 메시지 수신
 */
window.addEventListener('message', (event) => {
	const message = event.data;

	switch (message.type) {
		case 'init':
		case 'update':
			currentFrontmatter = message.frontmatter || {};
			currentContent = message.content || '';

			// 제목 필드 업데이트 방어 로직
			if (titleInput) {
				const newTitle = currentFrontmatter.title || '';
				const currentInputValue = titleInput.value;

				// 1. 값이 다를 때만 업데이트 시도
				if (newTitle !== currentInputValue) {
					// 2. 조합(Composition) 중이 아니고, 포커스가 없을 때만 안전하게 업데이트
					// (포커스가 있어도 값이 다르면 업데이트해야 할 수 있지만,
					// 입력 루프에 의한 깜빡임을 막기 위해 입력 포커스 중에는 업데이트를 무시하는 것이 안전)
					if (!isComposing && document.activeElement !== titleInput) {
						titleInput.value = newTitle;
					}
				}
			}

			// Milkdown Editor 업데이트
			if (editor) {
				editor.setContent(currentContent);
			}
			break;
	}
});

// 초기화 실행
init().catch(console.error);
