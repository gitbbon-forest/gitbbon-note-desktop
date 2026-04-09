/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// gitbbon custom: Issue #111 - vscode API 없이 동작하는 MockContextService (TDE 테스트 파이프라인 전용)

import * as fs from 'fs';
import * as path from 'path';
import type { IContextService } from '../interfaces/IContextService';

/**
 * 시나리오별로 주입되는 mock 컨텍스트 데이터
 */
export interface MockContextData {
	/** 현재 활성 파일 이름 (상대 경로) */
	activeFileName?: string;
	/** 현재 활성 파일 전체 내용 */
	activeFileContent?: string | null;
	/** 선택 텍스트와 주변 컨텍스트 */
	selection?: { text: string; before: string; after: string } | null;
	/** 열린 탭 목록 */
	openTabs?: string[];
	/** 파일 경로 → 파일 내용 맵 (readFile 응답용) */
	files?: Record<string, string>;
	/** applySuggestions 호출 기록 (검증용) */
	appliedChanges?: Array<{ filePath: string; changes: { oldText: string; newText: string }[]; mode: string }>;
	/** createNote 호출 기록 (검증용) */
	createdNotes?: Array<{ filePath: string; content: string; title?: string }>;
	/** deleteNote 호출 기록 (검증용) */
	deletedNotes?: string[];
}

/**
 * vscode API 없이 동작하는 ContextService mock 구현체.
 * TDE 테스트 러너에서 aiService에 주입해 실제 LLM 호출은 그대로 유지하면서
 * 파일시스템/에디터 의존성을 제거한다.
 */
export class MockContextService implements IContextService {
	private data: MockContextData;

	constructor(data: MockContextData = {}) {
		this.data = {
			activeFileName: data.activeFileName ?? 'None',
			activeFileContent: data.activeFileContent ?? undefined,
			selection: data.selection !== undefined ? data.selection : null,
			openTabs: data.openTabs ?? [],
			files: data.files ?? {},
			appliedChanges: data.appliedChanges ?? [],
			createdNotes: data.createdNotes ?? [],
			deletedNotes: data.deletedNotes ?? [],
		};
		console.log('[debug:#111] MockContextService 초기화:', {
			activeFileName: this.data.activeFileName,
			fileCount: Object.keys(this.data.files ?? {}).length,
		});
	}

	isGitbbonEditor(): boolean {
		// mock 환경에서는 Milkdown 에디터가 없으므로 항상 false
		return false;
	}

	getActiveFileName(): string {
		const name = this.data.activeFileName ?? 'None';
		console.log('[debug:#111] MockContextService.getActiveFileName:', name);
		return name;
	}

	async getSelection(): Promise<{ text: string; before: string; after: string } | null> {
		const sel = this.data.selection ?? null;
		console.log('[debug:#111] MockContextService.getSelection:', sel ? `"${sel.text.slice(0, 50)}..."` : 'null');
		return sel;
	}

	async getActiveFileContent(): Promise<string | undefined | null> {
		const content = this.data.activeFileContent ?? null;
		console.log('[debug:#111] MockContextService.getActiveFileContent:', content ? `${content.length}자` : 'null');
		return content;
	}

	async getCursorContext(): Promise<string | null> {
		// 선택된 텍스트가 없을 때 커서 주변 컨텍스트를 반환
		// mock에서는 activeFileContent의 앞 10줄을 반환
		if (!this.data.activeFileContent) return null;
		const lines = this.data.activeFileContent.split('\n').slice(0, 10).join('\n');
		console.log('[debug:#111] MockContextService.getCursorContext:', `${lines.length}자`);
		return lines || null;
	}

	getOpenTabs(): string[] {
		const tabs = this.data.openTabs ?? [];
		console.log('[debug:#111] MockContextService.getOpenTabs:', tabs);
		return tabs;
	}

	async readFile(filePath: string): Promise<string> {
		console.log('[debug:#111] MockContextService.readFile:', filePath);

		// 1. mock 파일 맵에서 먼저 조회
		const files = this.data.files ?? {};
		if (files[filePath]) {
			return files[filePath];
		}

		// 2. .md 확장자 자동 추가 시도
		if (!/\.[a-zA-Z0-9]+$/.test(filePath)) {
			const mdPath = filePath + '.md';
			if (files[mdPath]) {
				console.log(`[debug:#111] MockContextService.readFile: "${filePath}" → "${mdPath}" (.md 자동 추가)`);
				return files[mdPath];
			}
		}

		// 3. 실제 파일시스템에서 시도 (테스트 fixture 파일 지원)
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			return content;
		} catch {
			// 무시
		}

		throw new Error(`File not found in mock: "${filePath}"`);
	}

	async applySuggestions(
		filePath: string,
		changes: { oldText: string; newText: string }[],
		mode: 'direct' | 'suggestion' = 'direct'
	): Promise<void> {
		console.log('[debug:#111] MockContextService.applySuggestions:', { filePath, changes, mode });

		// 변경 기록 추적 (검증용)
		(this.data.appliedChanges ??= []).push({ filePath, changes, mode });

		// mock 파일 맵이 있으면 실제로 변경 적용 (검증 가능하도록)
		const files = this.data.files ?? {};
		if (files[filePath] !== undefined) {
			let content = files[filePath];
			for (const { oldText, newText } of changes) {
				if (!content.includes(oldText)) {
					throw new Error(`oldText not found in mock file "${filePath}": "${oldText.slice(0, 50)}"`);
				}
				content = content.replace(oldText, newText);
			}
			files[filePath] = content;
		}
	}

	async createNote(filePath: string, content: string, title?: string): Promise<string> {
		console.log('[debug:#111] MockContextService.createNote:', { filePath, title });

		const normalizedPath = /\.[a-zA-Z0-9]+$/.test(filePath) ? filePath : filePath + '.md';
		const files = this.data.files ?? {};

		if (files[normalizedPath] !== undefined) {
			return `Error: File already exists: ${normalizedPath}. Use action "update" to modify it.`;
		}

		let finalContent = content;
		if (title) {
			finalContent = `---\ntitle: ${title}\n---\n${content}`;
		}

		files[normalizedPath] = finalContent;
		(this.data.createdNotes ??= []).push({ filePath: normalizedPath, content: finalContent, title });

		return `Created: ${normalizedPath}`;
	}

	async deleteNote(filePath: string): Promise<string> {
		console.log('[debug:#111] MockContextService.deleteNote:', filePath);

		const files = this.data.files ?? {};
		if (files[filePath] !== undefined) {
			delete files[filePath];
			(this.data.deletedNotes ??= []).push(filePath);
			return `Deleted: ${filePath}`;
		}

		// .md 자동 추가 시도
		const mdPath = /\.[a-zA-Z0-9]+$/.test(filePath) ? filePath : filePath + '.md';
		if (files[mdPath] !== undefined) {
			delete files[mdPath];
			(this.data.deletedNotes ??= []).push(mdPath);
			return `Deleted: ${mdPath}`;
		}

		throw new Error(`File not found: "${filePath}"`);
	}

	/**
	 * 테스트 검증용 스냅샷 반환
	 */
	getSnapshot(): Readonly<MockContextData> {
		return { ...this.data };
	}
}
