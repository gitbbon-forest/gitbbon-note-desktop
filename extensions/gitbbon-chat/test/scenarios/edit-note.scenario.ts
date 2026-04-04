// gitbbon custom: Issue #111 - 파일 편집 시나리오 (TDE 파이프라인)

import type { TestScenario } from '../runner';

/**
 * 파일 편집 요청 시나리오.
 * 사용자가 현재 파일의 특정 내용을 수정 요청하면
 * LLM이 edit_note 툴을 호출해야 한다.
 */
export const editNoteScenario: TestScenario = {
	id: 'edit-note',
	description: '파일 편집 요청 시 edit_note 툴을 호출해야 한다',
	tags: ['smoke', 'write'],

	// mock 컨텍스트: 편집 대상 파일
	mockContext: {
		activeFileName: 'notes/todo.md',
		activeFileContent: `# 할 일 목록

- [ ] 장보기
- [ ] 운동하기
- [ ] 책 읽기`,
		openTabs: ['notes/todo.md'],
		files: {
			'notes/todo.md': `# 할 일 목록\n\n- [ ] 장보기\n- [ ] 운동하기\n- [ ] 책 읽기`,
		},
	},

	// 입력 메시지
	input: '장보기를 완료 처리해줘',

	// 기대값
	expected: {
		// edit_note 툴이 반드시 호출되어야 함
		toolsMustBeCalled: ['edit_note'],
		// 파일 변경이 발생해야 함
		shouldModifyFiles: true,
		// 텍스트 응답이 있어야 함
		shouldHaveTextResponse: true,
	},
};
