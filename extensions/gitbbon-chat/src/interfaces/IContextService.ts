/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// gitbbon custom: Issue #111 - ContextService 인터페이스 분리 (TDE 파이프라인을 위한 mock 주입 지원)

/**
 * 에디터 컨텍스트 서비스 인터페이스.
 * 실제 구현(ContextService)과 테스트용 mock(MockContextService) 모두 이 인터페이스를 구현한다.
 */
export interface IContextService {
	/**
	 * Gitbbon 커스텀 에디터(Milkdown)가 활성 상태인지 반환
	 */
	isGitbbonEditor(): boolean;

	/**
	 * 현재 활성 파일의 상대 경로를 반환. 없으면 'None'
	 */
	getActiveFileName(): string;

	/**
	 * 활성 에디터에서 선택된 텍스트와 주변 컨텍스트를 반환
	 */
	getSelection(): Promise<{ text: string; before: string; after: string } | null>;

	/**
	 * 활성 파일의 전체 내용을 반환
	 */
	getActiveFileContent(): Promise<string | undefined | null>;

	/**
	 * 커서 주변 라인(±5줄)을 반환
	 */
	getCursorContext(): Promise<string | null>;

	/**
	 * 열린 탭 목록(상대 경로)을 반환
	 */
	getOpenTabs(): string[];

	/**
	 * 특정 파일을 읽어 내용을 반환. 확장자 없으면 .md 자동 추가 시도
	 */
	readFile(filePath: string): Promise<string>;

	/**
	 * 파일에 변경사항을 적용 ('direct' 또는 'suggestion' 모드)
	 */
	applySuggestions(
		filePath: string,
		changes: { oldText: string; newText: string }[],
		mode?: 'direct' | 'suggestion'
	): Promise<void>;

	/**
	 * 새 노트 파일 생성
	 */
	createNote(filePath: string, content: string, title?: string): Promise<string>;

	/**
	 * 노트 파일 삭제
	 */
	deleteNote(filePath: string): Promise<string>;
}
