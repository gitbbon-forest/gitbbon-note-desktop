/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export class DiffParser {
	/** 커밋 메시지 최대 길이 (prefix 제외) */
	public static readonly DEFAULT_MAX_LENGTH = 20;

	/**
	 * Git diff output string을 분석하여
	 * 변경된(추가된) 핵심 텍스트만 추출합니다.
	 *
	 * @param diffOutput 'git diff -U0' 등의 출력 결과
	 * @param maxLength 반환할 최대 길이
	 */
	public static extractAddedText(diffOutput: string, maxLength: number = DiffParser.DEFAULT_MAX_LENGTH): string | null {
		if (!diffOutput) {
			return null;
		}

		const lines = diffOutput.split('\n');
		let deletedBlock: string[] = [];
		let addedBlock: string[] = [];

		// 변경 내용 추출 로직 (내부 함수)
		const processBlocks = (): string | null => {
			if (addedBlock.length === 0) {
				deletedBlock = []; // 삭제만 된 경우는 무시
				return null;
			}

			const addedString = addedBlock.join('\n');

			// 1. 순수 추가 (삭제된 내용 없음)
			if (deletedBlock.length === 0) {
				addedBlock = [];
				// 빈 줄 추가 등은 무시
				return addedString.trim().length > 0 ? addedString.trim() : null;
			}

			// 2. 수정 (삭제 후 추가)
			const deletedString = deletedBlock.join('\n');

			// 공통 접두사(prefix) 제거
			let prefixLen = 0;
			const minLen = Math.min(deletedString.length, addedString.length);
			while (prefixLen < minLen && deletedString[prefixLen] === addedString[prefixLen]) {
				prefixLen++;
			}

			// 공통 접미사(suffix) 제거
			const delCore = deletedString.substring(prefixLen);
			const addCore = addedString.substring(prefixLen);

			let sLen = 0;
			const minCoreLen = Math.min(delCore.length, addCore.length);
			while (sLen < minCoreLen && delCore[delCore.length - 1 - sLen] === addCore[addCore.length - 1 - sLen]) {
				sLen++;
			}

			// 최종 추가된 부분 추출
			const finalAdded = addCore.substring(0, addCore.length - sLen).trim();

			deletedBlock = [];
			addedBlock = [];

			return finalAdded.length > 0 ? finalAdded : null;
		};

		for (const line of lines) {
			// 헤더나 메타 정보 라인은 블록 처리를 트리거하고 넘어감
			if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@ ')) {
				const res = processBlocks();
				if (res) {
					return res.substring(0, maxLength); // 첫 번째 유효한 변경 발견 시 리턴
				}
				continue;
			}

			if (line.startsWith('-')) {
				// + 라인 처리 중에 - 가 나오면 새로운 변경(혹은 섞인 변경)으로 간주하고 기존 블록 처리
				if (addedBlock.length > 0) {
					const res = processBlocks();
					if (res) {
						return res.substring(0, maxLength);
					}
				}
				deletedBlock.push(line.substring(1));
			} else if (line.startsWith('+')) {
				addedBlock.push(line.substring(1));
			}
		}

		// 마지막 블록 처리
		const res = processBlocks();
		if (res) {
			return res.substring(0, maxLength);
		}

		return null;
	}

	/**
	 * Git diff output을 분석하여 변경 타입(Create/Update/Delete)과 내용을 포함한 커밋 메시지 생성
	 *
	 * @param diffOutput 'git diff -U0' 등의 출력 결과
	 * @param maxLength 반환할 최대 길이 (prefix 제외)
	 * @returns "Create: content" | "Update: content" | "Delete: content" | null
	 */
	public static extractChange(diffOutput: string, maxLength: number = DiffParser.DEFAULT_MAX_LENGTH): string | null {
		if (!diffOutput) {
			return null;
		}

		const lines = diffOutput.split('\n');
		let deletedBlock: string[] = [];
		let addedBlock: string[] = [];

		// 변경 내용 추출 및 타입 판별 로직
		const processBlocks = (): string | null => {
			const hasDeleted = deletedBlock.length > 0;
			const hasAdded = addedBlock.length > 0;

			// 변경 없음
			if (!hasDeleted && !hasAdded) {
				return null;
			}

			const deletedString = deletedBlock.join('\n');
			const addedString = addedBlock.join('\n');

			// 초기화
			deletedBlock = [];
			addedBlock = [];

			// 1. Create: 순수 추가
			if (!hasDeleted && hasAdded) {
				// 줄바꿈을 먼저 시각적 기호로 치환 (빈 줄 추가도 감지하기 위해)
				const displayContent = addedString.replace(/\n/g, '↵').trim();
				if (displayContent.length === 0) {
					return null;
				}
				return `Create: ${displayContent.substring(0, maxLength)}`;
			}

			// 2. Delete: 순수 삭제
			if (hasDeleted && !hasAdded) {
				// 줄바꿈을 먼저 시각적 기호로 치환
				const displayContent = deletedString.replace(/\n/g, '↵').trim();
				if (displayContent.length === 0) {
					return null;
				}
				return `Delete: ${displayContent.substring(0, maxLength)}`;
			}

			// 3. Update: 수정 (삭제 + 추가)
			// 공통 접두사 제거
			let prefixLen = 0;
			const minLen = Math.min(deletedString.length, addedString.length);
			while (prefixLen < minLen && deletedString[prefixLen] === addedString[prefixLen]) {
				prefixLen++;
			}

			// 공통 접미사 제거
			const delCore = deletedString.substring(prefixLen);
			const addCore = addedString.substring(prefixLen);

			let sLen = 0;
			const minCoreLen = Math.min(delCore.length, addCore.length);
			while (sLen < minCoreLen && delCore[delCore.length - 1 - sLen] === addCore[addCore.length - 1 - sLen]) {
				sLen++;
			}

			const deletedPart = delCore.substring(0, delCore.length - sLen);
			const addedPart = addCore.substring(0, addCore.length - sLen);

			// 추가된 부분이 있으면 Update (추가 우선)
			if (addedPart.length > 0) {
				// 앞뒤 공백 제거하되, 중간 공백은 유지
				const trimmed = addedPart.trim();
				if (trimmed.length > 0) {
					return `Update: ${trimmed.substring(0, maxLength)}`;
				}
			}

			// 삭제된 부분만 있으면 Delete
			if (deletedPart.length > 0) {
				const trimmed = deletedPart.trim();
				if (trimmed.length > 0) {
					return `Delete: ${trimmed.substring(0, maxLength)}`;
				}
			}

			// 공백만 변경된 경우 등 - 변경 감지 실패
			return null;
		};

		for (const line of lines) {
			// 헤더나 메타 정보 라인은 블록 처리를 트리거
			if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@ ')) {
				const res = processBlocks();
				if (res) {
					return res;
				}
				continue;
			}

			if (line.startsWith('-')) {
				// + 라인 처리 중에 - 가 나오면 기존 블록 먼저 처리
				if (addedBlock.length > 0) {
					const res = processBlocks();
					if (res) {
						return res;
					}
				}
				deletedBlock.push(line.substring(1));
			} else if (line.startsWith('+')) {
				addedBlock.push(line.substring(1));
			}
		}

		// 마지막 블록 처리
		return processBlocks();
	}
}
