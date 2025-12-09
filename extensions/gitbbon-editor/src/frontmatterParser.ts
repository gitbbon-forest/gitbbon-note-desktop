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

	/**
	 * 마크다운 문서를 Frontmatter와 Content로 분리
	 */
	public static parse(text: string): { frontmatter: Record<string, any>; content: string } {
		const match = text.match(this.FRONTMATTER_REGEX);

		if (!match) {
			return {
				frontmatter: {},
				content: text
			};
		}

		const frontmatterText = match[1];
		const content = text.slice(match[0].length);

		let frontmatter: Record<string, any> = {};
		try {
			frontmatter = yaml.parse(frontmatterText) || {};
		} catch (error) {
			console.error('Failed to parse frontmatter:', error);
		}

		return { frontmatter, content };
	}

	/**
	 * Frontmatter와 Content를 마크다운 문서로 결합
	 */
	public static stringify(frontmatter: Record<string, any>, content: string): string {
		// Frontmatter가 비어있으면 content만 반환
		if (Object.keys(frontmatter).length === 0) {
			return content;
		}

		const frontmatterText = yaml.stringify(frontmatter);
		return `---\n${frontmatterText}---\n${content}`;
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
