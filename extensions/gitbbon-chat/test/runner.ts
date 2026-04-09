#!/usr/bin/env node
// gitbbon custom: Issue #111 - TDE 테스트 러너 (MockContextService 주입 + aiService.streamAgentChat() 직접 호출)

/**
 * 사용법:
 *   node out/test/runner.js
 *   node out/test/runner.js --scenario file-summary
 *   node out/test/runner.js --tag smoke --repeat 3
 *   node out/test/runner.js --scenario file-summary --repeat 2 --tag smoke
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModelMessage } from 'ai';
import { MockContextService, type MockContextData } from '../src/services/MockContextService';
import { evaluateAll, printSummary } from './evaluator';
import { fileSummaryScenario } from './scenarios/file-summary.scenario';
import { editNoteScenario } from './scenarios/edit-note.scenario';
import { textOnlyResponseScenario } from './scenarios/text-only-response.scenario';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

/** 시나리오 기대값 */
export interface ScenarioExpected {
	/** 이 툴들 중 하나 이상 호출 (OR 조건) */
	toolsShouldBeCalled?: string[];
	/** 이 툴들이 모두 반드시 호출 (AND 조건) */
	toolsMustBeCalled?: string[];
	/** 호출되면 안 되는 툴 */
	toolsShouldNotBeCalled?: string[];
	/** 파일 변경 발생 여부 */
	shouldModifyFiles?: boolean;
	/** 텍스트 응답 여부 */
	shouldHaveTextResponse?: boolean;
}

/** 테스트 시나리오 정의 */
export interface TestScenario {
	id: string;
	description: string;
	tags: string[];
	mockContext: MockContextData & { activeFileContent?: string | null };
	input: string;
	expected: ScenarioExpected;
}

/** 시나리오 실행 결과 */
export interface ScenarioResult {
	scenarioId: string;
	/** 호출된 툴 이름 목록 */
	toolCallNames: string[];
	/** 수정된 파일 목록 */
	fileModifications: string[];
	/** 수집된 텍스트 응답 전체 */
	textContent: string;
	/** 오류 메시지 (있을 경우) */
	error?: string;
	/** 실행 시간(ms) */
	durationMs: number;
	/** raw 스트림 이벤트 */
	events: unknown[];
}

// ─────────────────────────────────────────────
// 시나리오 목록
// ─────────────────────────────────────────────

const ALL_SCENARIOS: TestScenario[] = [
	fileSummaryScenario,
	editNoteScenario,
	textOnlyResponseScenario,
];

// ─────────────────────────────────────────────
// AIService를 vscode 없이 실행하기 위한 최소 stub
// ─────────────────────────────────────────────

/**
 * vscode.SecretStorage 최소 stub
 * TDE 환경에서는 환경변수 AI_GATEWAY_API_KEY만 사용
 */
const mockSecrets = {
	async get(key: string): Promise<string | undefined> {
		if (key === 'AI_GATEWAY_API_KEY') {
			return process.env.AI_GATEWAY_API_KEY;
		}
		if (key === 'CHAT_BACKEND') {
			return process.env.TDE_BACKEND ?? 'api';
		}
		return undefined;
	},
	async store(key: string, value: string): Promise<void> {
		console.log(`[debug:#111] mockSecrets.store: ${key}`);
	},
	async delete(key: string): Promise<void> { },
	onDidChange: { event: () => ({ dispose: () => {} }) },
} as unknown as import('vscode').SecretStorage;

// ─────────────────────────────────────────────
// 단일 시나리오 실행
// ─────────────────────────────────────────────

async function runScenario(scenario: TestScenario): Promise<ScenarioResult> {
	console.log(`\n[debug:#111] 시나리오 실행: ${scenario.id} - "${scenario.description}"`);

	const startTime = Date.now();
	const events: unknown[] = [];
	const toolCallNames: string[] = [];
	let textContent = '';
	let error: string | undefined;

	// MockContextService 생성 (시나리오별 컨텍스트 주입)
	const mockCtxService = new MockContextService(scenario.mockContext);

	try {
		// API 키 확인 (없으면 graceful 실패)
		const apiKey = process.env.AI_GATEWAY_API_KEY;
		if (!apiKey) {
			console.warn('[debug:#111] AI_GATEWAY_API_KEY 환경변수가 없습니다. 시나리오를 건너뜁니다.');
			return {
				scenarioId: scenario.id,
				toolCallNames: [],
				fileModifications: [],
				textContent: '',
				error: 'API_KEY_MISSING: AI_GATEWAY_API_KEY 환경변수가 설정되지 않았습니다',
				durationMs: Date.now() - startTime,
				events: [],
			};
		}

		// AIService를 동적으로 import (vscode 없이 실행 가능하도록 조건부 로드)
		const { AIService } = await import('../src/services/aiService.js');
		const aiService = new AIService(mockSecrets, mockCtxService);

		const messages: ModelMessage[] = [
			{ role: 'user', content: scenario.input }
		];

		// streamAgentChat 실행 및 이벤트 수집
		for await (const event of aiService.streamAgentChat(messages)) {
			events.push(event);
			const e = event as { type: string; toolName?: string; content?: string };

			if (e.type === 'tool-start' && e.toolName && e.toolName !== 'Thinking...') {
				// 툴 이름을 TOOL_LABELS 역방향으로 추적
				// editorTools의 TOOL_LABELS에 정의된 실제 툴 이름으로 매핑
				const toolName = resolveToolName(e.toolName);
				if (toolName) {
					toolCallNames.push(toolName);
					console.log(`[debug:#111] 툴 호출: ${toolName} (label: ${e.toolName})`);
				}
			} else if (e.type === 'text' && e.content) {
				textContent += e.content;
			}
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[debug:#111] 시나리오 실행 오류:`, msg);
		error = msg;
	}

	// 파일 수정 여부 확인 (appliedChanges + createdNotes + deletedNotes)
	const snapshot = mockCtxService.getSnapshot();
	const fileModifications: string[] = [
		...(snapshot.appliedChanges ?? []).map(c => c.filePath),
		...(snapshot.createdNotes ?? []).map(n => n.filePath),
		...(snapshot.deletedNotes ?? []),
	];

	const durationMs = Date.now() - startTime;
	console.log(`[debug:#111] 시나리오 완료: ${scenario.id} (${durationMs}ms)`);
	console.log(`[debug:#111] 호출된 툴: [${toolCallNames.join(', ')}]`);
	console.log(`[debug:#111] 수정된 파일: [${fileModifications.join(', ')}]`);
	console.log(`[debug:#111] 텍스트 응답 길이: ${textContent.length}자`);

	return {
		scenarioId: scenario.id,
		toolCallNames,
		fileModifications,
		textContent,
		error,
		durationMs,
		events,
	};
}

/**
 * tool-start 이벤트의 toolName(label)을 실제 tool ID로 변환
 */
function resolveToolName(label: string): string | null {
	const LABEL_TO_TOOL: Record<string, string> = {
		'Reading selection': 'get_selection',
		'Reading current file': 'get_current_file',
		'Loading chat history': 'get_chat_history',
		'Searching files': 'search_in_workspace',
		'Reading file': 'read_file',
		'Editing note': 'edit_note',
	};
	return LABEL_TO_TOOL[label] ?? null;
}

// ─────────────────────────────────────────────
// CLI 파라미터 파싱
// ─────────────────────────────────────────────

function parseArgs(): { scenarioId?: string; tags?: string[]; repeat: number } {
	const args = process.argv.slice(2);
	let scenarioId: string | undefined;
	let tags: string[] | undefined;
	let repeat = 1;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--scenario' && args[i + 1]) {
			scenarioId = args[++i];
		} else if (args[i] === '--tag' && args[i + 1]) {
			tags = args[++i].split(',');
		} else if (args[i] === '--repeat' && args[i + 1]) {
			repeat = parseInt(args[++i], 10) || 1;
		}
	}

	return { scenarioId, tags, repeat };
}

// ─────────────────────────────────────────────
// 결과 저장
// ─────────────────────────────────────────────

function saveResults(results: ScenarioResult[], evaluations: ReturnType<typeof evaluateAll>): void {
	const reportsDir = path.join(__dirname, 'reports');
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir, { recursive: true });
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filePath = path.join(reportsDir, `result-${timestamp}.json`);

	const report = {
		timestamp: new Date().toISOString(),
		summary: {
			total: evaluations.length,
			passed: evaluations.filter(e => e.passed).length,
			failed: evaluations.filter(e => !e.passed).length,
		},
		evaluations,
		results: results.map(r => ({
			...r,
			// 이벤트는 너무 크므로 개수만 기록
			eventCount: r.events.length,
			events: undefined,
		})),
	};

	fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
	console.log(`\n[debug:#111] 결과 저장: ${filePath}`);
}

// ─────────────────────────────────────────────
// 메인 실행
// ─────────────────────────────────────────────

async function main(): Promise<void> {
	const { scenarioId, tags, repeat } = parseArgs();

	// 실행할 시나리오 필터링
	let scenarios = ALL_SCENARIOS;
	if (scenarioId) {
		scenarios = scenarios.filter(s => s.id === scenarioId);
		if (scenarios.length === 0) {
			console.error(`시나리오를 찾을 수 없습니다: ${scenarioId}`);
			process.exit(1);
		}
	}
	if (tags && tags.length > 0) {
		scenarios = scenarios.filter(s => tags.some(tag => s.tags.includes(tag)));
		if (scenarios.length === 0) {
			console.error(`태그와 일치하는 시나리오가 없습니다: ${tags.join(', ')}`);
			process.exit(1);
		}
	}

	console.log(`\n${'='.repeat(60)}`);
	console.log(`TDE 러너 시작: ${scenarios.length}개 시나리오 × ${repeat}회 반복`);
	console.log('='.repeat(60));

	const allResults: ScenarioResult[] = [];

	// 각 시나리오 실행 (repeat 횟수만큼 반복)
	for (let run = 1; run <= repeat; run++) {
		if (repeat > 1) {
			console.log(`\n--- 실행 ${run}/${repeat} ---`);
		}
		for (const scenario of scenarios) {
			const result = await runScenario(scenario);
			allResults.push(result);
		}
	}

	// 평가
	const evaluations = evaluateAll(scenarios, allResults);
	printSummary(evaluations);

	// 결과 저장
	saveResults(allResults, evaluations);

	// 실패한 시나리오가 있으면 exit code 1
	const hasFailed = evaluations.some(e => !e.passed);
	process.exit(hasFailed ? 1 : 0);
}

main().catch(err => {
	console.error('[debug:#111] Runner 오류:', err);
	process.exit(1);
});
