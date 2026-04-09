// gitbbon custom: Issue #111 - 파일 요약 시나리오 (TDE 파이프라인)

import type { TestScenario } from '../runner';

/**
 * 파일 요약 요청 시나리오.
 * 사용자가 현재 열린 파일의 요약을 요청하면
 * LLM이 get_current_file 또는 read_file 툴을 호출해야 한다.
 */
export const fileSummaryScenario: TestScenario = {
	id: 'file-summary',
	description: '현재 파일 요약 요청 시 파일 읽기 툴을 호출해야 한다',
	tags: ['smoke', 'read'],

	// mock 컨텍스트: 현재 열린 파일 정보
	mockContext: {
		activeFileName: 'notes/chapter-1.md',
		activeFileContent: `# 1장: 인공지능의 역사

인공지능(AI)은 1956년 다트머스 회의에서 공식적으로 시작되었습니다.
초기에는 규칙 기반 시스템이 주류였으나, 머신러닝의 등장으로 패러다임이 바뀌었습니다.
딥러닝의 발전으로 현재는 LLM 시대를 맞이하고 있습니다.

## 주요 이정표
- 1956: 다트머스 회의 (AI 용어 최초 사용)
- 1997: Deep Blue가 체스 챔피언 카스파로프를 이김
- 2012: AlexNet으로 딥러닝 혁명 시작
- 2022: ChatGPT 출시로 LLM 대중화`,
		openTabs: ['notes/chapter-1.md', 'notes/chapter-2.md'],
		files: {
			'notes/chapter-1.md': `# 1장: 인공지능의 역사\n\n인공지능(AI)은 1956년 다트머스 회의에서 공식적으로 시작되었습니다.`,
		},
	},

	// 입력 메시지
	input: '현재 파일을 요약해줘',

	// 기대값
	expected: {
		// 이 툴들 중 하나 이상 호출되어야 함
		toolsShouldBeCalled: ['get_current_file', 'read_file'],
		// 이 툴은 호출되면 안 됨
		toolsShouldNotBeCalled: ['edit_note'],
		// 파일 변경이 발생하면 안 됨
		shouldModifyFiles: false,
		// 텍스트 응답이 있어야 함
		shouldHaveTextResponse: true,
	},
};
