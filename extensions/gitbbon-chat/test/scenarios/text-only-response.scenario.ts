// gitbbon custom: Issue #111 - 텍스트 전용 응답 시나리오 (TDE 파이프라인)

import type { TestScenario } from '../runner';

/**
 * 텍스트만 응답해야 할 시나리오.
 * 파일과 무관한 일반적인 질문을 하면
 * LLM이 파일 편집 툴을 호출하지 않고 텍스트만 응답해야 한다.
 */
export const textOnlyResponseScenario: TestScenario = {
	id: 'text-only-response',
	description: '일반 지식 질문에는 툴 호출 없이 텍스트만 응답해야 한다',
	tags: ['smoke', 'text'],

	// mock 컨텍스트: 에디터 없음
	mockContext: {
		activeFileName: 'None',
		activeFileContent: undefined,
		openTabs: [],
		files: {},
	},

	// 입력 메시지 (파일과 무관한 일반 질문)
	input: '마크다운이 무엇인가요? 간단히 설명해주세요.',

	// 기대값
	expected: {
		// 이 툴들은 호출되면 안 됨
		toolsShouldNotBeCalled: ['edit_note', 'get_current_file', 'read_file'],
		// 파일 변경이 발생하면 안 됨
		shouldModifyFiles: false,
		// 텍스트 응답이 있어야 함
		shouldHaveTextResponse: true,
	},
};
