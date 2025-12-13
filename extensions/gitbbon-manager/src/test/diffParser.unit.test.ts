/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { DiffParser } from '../diffParser';
import * as assert from 'assert';

describe('DiffParser', () => {
	// Helper to create a unified diff format string for testing
	function createDiff(deleted: string[], added: string[]) {
		let output = 'diff --git a/file b/file\nindex 0000000..1111111 100644\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n';
		deleted.forEach(l => output += `-${l}\n`);
		added.forEach(l => output += `+${l}\n`);
		return output;
	}

	describe('extractAddedText (기존 메서드)', () => {
		it('단순 추가 ("" -> "aaa")', () => {
			const diff = createDiff([], ['aaa']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'aaa');
		});

		it('끝부분 수정 ("aaa" -> "aab")', () => {
			const diff = createDiff(['aaa'], ['aab']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'b');
		});

		it('앞부분 수정 ("aaa" -> "baa")', () => {
			const diff = createDiff(['aaa'], ['baa']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'b');
		});

		it('중간부분 수정 ("aaa" -> "aba")', () => {
			const diff = createDiff(['aaa'], ['aba']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'b');
		});

		it('단축 ("aaab" -> "aaa")', () => {
			const diff = createDiff(['aaab'], ['aaa']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, null);
		});

		it('완전 변경 ("aaa" -> "bbb")', () => {
			const diff = createDiff(['aaa'], ['bbb']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'bbb');
		});

		it('여러 줄 추가', () => {
			const diff = createDiff([], ['line1', 'line2']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'line1\nline2');
		});

		it('최대 길이 제한', () => {
			const diff = createDiff([], ['this is a very long text that exceeds limit']);
			const result = DiffParser.extractAddedText(diff, 10);
			assert.strictEqual(result, 'this is a ');
		});

		it('사용자 시나리오: "aaa" -> "aab"는 "b"를 반환해야 함', () => {
			const diff = createDiff(['aaa'], ['aab']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'b');
		});

		it('복잡한 수정 ("Const A = 1;" -> "Const B = 1;")', () => {
			const diff = createDiff(['Const A = 1;'], ['Const B = 1;']);
			const result = DiffParser.extractAddedText(diff);
			assert.strictEqual(result, 'B');
		});
	});

	describe('extractChange (새 메서드 - Create/Update/Delete)', () => {
		it('Create: 순수 추가', () => {
			const diff = createDiff([], ['새로운 내용']);
			const result = DiffParser.extractChange(diff);
			assert.strictEqual(result, 'Create: 새로운 내용');
		});

		it('Create: 여러 줄 추가', () => {
			const diff = createDiff([], ['첫 줄', '둘째 줄']);
			const result = DiffParser.extractChange(diff, 20);
			// 줄바꿈은 ↵로 표시
			assert.strictEqual(result, 'Create: 첫 줄↵둘째 줄');
		});

		it('Update: 끝부분 수정', () => {
			const diff = createDiff(['aaa'], ['aab']);
			const result = DiffParser.extractChange(diff);
			assert.strictEqual(result, 'Update: b');
		});

		it('Update: 중간 수정', () => {
			const diff = createDiff(['hello world'], ['hello beautiful world']);
			const result = DiffParser.extractChange(diff);
			// 앞뒤 공백은 trim되므로 'beautiful'만 반환
			assert.strictEqual(result, 'Update: beautiful');
		});

		it('Update: 완전 변경', () => {
			const diff = createDiff(['old'], ['new']);
			const result = DiffParser.extractChange(diff);
			assert.strictEqual(result, 'Update: new');
		});

		it('Delete: 순수 삭제', () => {
			const diff = createDiff(['삭제될 내용'], []);
			const result = DiffParser.extractChange(diff);
			assert.strictEqual(result, 'Delete: 삭제될 내용');
		});

		it('Delete: 부분 삭제 (단축)', () => {
			const diff = createDiff(['hello world'], ['hello']);
			const result = DiffParser.extractChange(diff);
			assert.strictEqual(result, 'Delete: world');
		});

		it('공백만 변경된 경우', () => {
			const diff = createDiff(['a  b'], ['a b']);
			const result = DiffParser.extractChange(diff);
			// 공백 변경은 의미있는 텍스트 변경이 아니므로 null 반환
			assert.strictEqual(result, null);
		});

		it('빈 변경 (변경 없음)', () => {
			const diff = '';
			const result = DiffParser.extractChange(diff);
			assert.strictEqual(result, null);
		});

		it('최대 길이 제한 적용', () => {
			const diff = createDiff([], ['very long content that exceeds the maximum length']);
			const result = DiffParser.extractChange(diff, 10);
			assert.strictEqual(result, 'Create: very long ');
		});
	});
});
