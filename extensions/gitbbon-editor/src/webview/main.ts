/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createEditor } from './editor';
import { FrontmatterEditor } from './frontmatterEditor';

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
let frontmatterEditor: FrontmatterEditor | null = null;
let currentFrontmatter: Record<string, any> = {};
let currentContent: string = '';

/**
 * 초기화
 */
async function init() {
	// Frontmatter Editor 초기화
	const frontmatterContainer = document.getElementById('frontmatter-editor');
	if (frontmatterContainer) {
		frontmatterEditor = new FrontmatterEditor(frontmatterContainer, (frontmatter) => {
			currentFrontmatter = frontmatter;
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

			// Frontmatter Editor 업데이트
			if (frontmatterEditor) {
				frontmatterEditor.setFrontmatter(currentFrontmatter);
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
