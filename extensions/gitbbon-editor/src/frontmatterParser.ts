/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as yaml from 'yaml';

/**
 * YAML Frontmatter Parser
 * 마크다운 문서의 YAML Frontmatter를 파싱하고 생성
 */
export class FrontmatterParser {
	private static readonly FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
	// 파일 끝에 위치하는 한 줄 메타데이터 (gitbbon-search extension)
	// \n* : 앞에 줄바꿈이 없거나 여러 개일 수 있음
	// \s*-->\s*$ : 주석 끝 뒤에 공백이나 줄바꿈이 있어도 매칭
	// [\s\S]*? : content 안에 줄바꿈이 있어도 매칭 (DotAll)
	private static readonly METADATA_REGEX = /\n*<!--\s*gitbbon:([\s\S]*?)\s*-->\s*$/;

	/**
	 * 마크다운 문서를 Frontmatter와 Content로 분리
	 * (메타데이터 주석이 있으면 제거하고 별도로 반환)
	 */
	public static parse(text: string): { frontmatter: Record<string, any>; content: string; metadata?: string } {
		const result: { frontmatter: Record<string, any>; content: string; metadata?: string } = {
			frontmatter: {},
			content: text
		};

		// 1. Frontmatter 분리
		const match = text.match(this.FRONTMATTER_REGEX);
		if (match) {
			const frontmatterText = match[1];
			result.content = text.slice(match[0].length);

			try {
				result.frontmatter = yaml.parse(frontmatterText) || {};
			} catch (error) {
				// console.error('Failed to parse frontmatter:', error);
			}
		}

		// 2. Metadata 분리 (Content 끝에서 제거)
		// 반복적으로 매칭하여 누적된 중복 메타데이터까지 모두 제거
		while (true) {
			const metadataMatch = result.content.match(this.METADATA_REGEX);
			if (!metadataMatch) {
				break;
			}

			// 가장 마지막(맨 끝)에 있는 메타데이터만 유효한 것으로 저장
			if (!result.metadata) {
				result.metadata = metadataMatch[0];
			}

			// 매칭된 메타데이터 제거 및 공백 정리
			result.content = result.content.replace(this.METADATA_REGEX, '').trimEnd();
		}

		return result;
	}

	/**
	 * Frontmatter와 Content를 마크다운 문서로 결합
	 */
	public static stringify(frontmatter: Record<string, any>, content: string, metadata?: string): string {
		let result = content;

		// Frontmatter가 있으면 앞에 추가
		if (Object.keys(frontmatter).length > 0) {
			const frontmatterText = yaml.stringify(frontmatter);
			result = `---\n${frontmatterText}---\n${result}`;
		}

		// Metadata가 있으면 뒤에 추가
		if (metadata) {
			// content 끝에 줄바꿈이 없으면 추가
			if (!result.endsWith('\n')) {
				result += '\n';
			}
			// metadata가 줄바꿈으로 시작하지 않으면 추가
			if (!metadata.startsWith('\n')) {
				result += '\n';
			}
			result += metadata;
		}

		return result;
	}

	/**
	 * Frontmatter에서 특정 필드 추출
	 */
	public static getField(frontmatter: Record<string, any>, field: string): any {
		return frontmatter[field];
	}

	/**
	 * Frontmatter에 필드 설정
	 */
	public static setField(
		frontmatter: Record<string, any>,
		field: string,
		value: any
	): Record<string, any> {
		return {
			...frontmatter,
			[field]: value
		};
	}
}
