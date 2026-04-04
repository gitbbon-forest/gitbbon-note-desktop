// gitbbon custom: Issue #111 - TDE 평가 로직 (Judge 평가기)

import type { ScenarioResult, TestScenario } from './runner';

/**
 * 시나리오 실행 결과를 기대값과 비교해 pass/fail 판정
 */
export interface EvaluationResult {
	scenarioId: string;
	passed: boolean;
	failures: string[];
	warnings: string[];
}

/**
 * 단일 시나리오 결과를 평가
 */
export function evaluateScenario(scenario: TestScenario, result: ScenarioResult): EvaluationResult {
	const failures: string[] = [];
	const warnings: string[] = [];
	const { expected } = scenario;

	console.log(`[debug:#111] 평가 시작: ${scenario.id}`);

	// 1. 반드시 호출되어야 할 툴 확인 (mustBeCalled)
	const calledTools = result.toolCallNames ?? [];
	if (expected.toolsMustBeCalled) {
		for (const toolName of expected.toolsMustBeCalled) {
			if (!calledTools.includes(toolName)) {
				failures.push(`툴 "${toolName}"이 호출되지 않았습니다 (필수). 실제 호출: [${calledTools.join(', ')}]`);
			}
		}
	}

	// 2. 하나 이상 호출되어야 할 툴 확인 (shouldBeCalled - OR 조건)
	if (expected.toolsShouldBeCalled && expected.toolsShouldBeCalled.length > 0) {
		const anyMatch = expected.toolsShouldBeCalled.some(t => calledTools.includes(t));
		if (!anyMatch) {
			failures.push(
				`다음 툴 중 하나는 호출되어야 합니다: [${expected.toolsShouldBeCalled.join(', ')}]. ` +
				`실제 호출: [${calledTools.join(', ')}]`
			);
		}
	}

	// 3. 호출되면 안 되는 툴 확인
	if (expected.toolsShouldNotBeCalled) {
		for (const toolName of expected.toolsShouldNotBeCalled) {
			if (calledTools.includes(toolName)) {
				failures.push(`툴 "${toolName}"이 호출되었으나 호출되면 안 됩니다`);
			}
		}
	}

	// 4. 파일 변경 여부 확인
	if (expected.shouldModifyFiles !== undefined) {
		const didModify = (result.fileModifications ?? []).length > 0;
		if (expected.shouldModifyFiles && !didModify) {
			failures.push('파일 수정이 발생해야 하지만 발생하지 않았습니다');
		} else if (!expected.shouldModifyFiles && didModify) {
			failures.push(`파일 수정이 발생하면 안 되지만 발생했습니다: [${result.fileModifications?.join(', ')}]`);
		}
	}

	// 5. 텍스트 응답 여부 확인
	if (expected.shouldHaveTextResponse !== undefined) {
		const hasText = (result.textContent ?? '').trim().length > 0;
		if (expected.shouldHaveTextResponse && !hasText) {
			failures.push('텍스트 응답이 있어야 하지만 없습니다');
		} else if (!expected.shouldHaveTextResponse && hasText) {
			warnings.push(`텍스트 응답이 없어야 하지만 있습니다: "${result.textContent?.slice(0, 100)}..."`);
		}
	}

	// 6. 오류 발생 여부 확인
	if (result.error) {
		failures.push(`시나리오 실행 중 오류 발생: ${result.error}`);
	}

	const passed = failures.length === 0;
	console.log(`[debug:#111] 평가 완료: ${scenario.id} → ${passed ? 'PASS' : 'FAIL'}`);
	if (failures.length > 0) {
		console.log(`[debug:#111] 실패 원인:`, failures);
	}

	return {
		scenarioId: scenario.id,
		passed,
		failures,
		warnings,
	};
}

/**
 * 여러 시나리오 결과를 일괄 평가
 */
export function evaluateAll(
	scenarios: TestScenario[],
	results: ScenarioResult[]
): EvaluationResult[] {
	const resultMap = new Map(results.map(r => [r.scenarioId, r]));
	return scenarios.map(scenario => {
		const result = resultMap.get(scenario.id);
		if (!result) {
			return {
				scenarioId: scenario.id,
				passed: false,
				failures: ['시나리오 결과를 찾을 수 없습니다'],
				warnings: [],
			};
		}
		return evaluateScenario(scenario, result);
	});
}

/**
 * 평가 결과 요약 출력
 */
export function printSummary(evaluations: EvaluationResult[]): void {
	const total = evaluations.length;
	const passed = evaluations.filter(e => e.passed).length;
	const failed = total - passed;

	console.log('\n' + '='.repeat(60));
	console.log(`TDE 평가 결과: ${passed}/${total} 통과`);
	console.log('='.repeat(60));

	for (const eval_ of evaluations) {
		const icon = eval_.passed ? '✅' : '❌';
		console.log(`${icon} ${eval_.scenarioId}`);
		if (!eval_.passed) {
			for (const failure of eval_.failures) {
				console.log(`   └─ ${failure}`);
			}
		}
		if (eval_.warnings.length > 0) {
			for (const warning of eval_.warnings) {
				console.log(`   ⚠️  ${warning}`);
			}
		}
	}

	console.log('='.repeat(60));
	if (failed > 0) {
		console.log(`❌ ${failed}개 시나리오 실패`);
	} else {
		console.log('✅ 모든 시나리오 통과');
	}
}
