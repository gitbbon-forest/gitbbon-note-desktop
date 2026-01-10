/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

/**
 * 마크다운 파일에서 제목 추출
 * 우선순위:
 * 1. YAML frontmatter의 `title` 필드
 * 2. 첫 번째 `# ` 헤더
 * 3. 파일명 (확장자 제외)
 */
export function extractTitle(content: string, filePath: string): string {
	// 1. YAML frontmatter에서 title 추출
	const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (yamlMatch) {
		const frontmatter = yamlMatch[1];
		const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
		if (titleMatch) {
			return titleMatch[1].trim();
		}
	}

	// 2. 첫 번째 # 헤더에서 추출
	const headerMatch = content.match(/^#\s+(.+)$/m);
	if (headerMatch) {
		return headerMatch[1].trim();
	}

	// 3. 파일명 사용 (확장자 제외)
	return path.basename(filePath, path.extname(filePath));
}

/**
 * YAML frontmatter 제거
 * 임베딩 시 불필요한 메타데이터를 제외하기 위해 사용
 */
export function stripFrontmatter(content: string): string {
	return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

/**
 * 마크다운 문법 제거하여 순수 텍스트로 변환
 * 검색 미리보기용
 */
export function cleanMarkdown(content: string): string {
	return stripFrontmatter(content)
		// 헤더 (# ~ ######)
		.replace(/^#{1,6}\s+/gm, '')
		// 굵게/기울임 (**text**, *text*, __text__, _text_)
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		// 취소선 (~~text~~)
		.replace(/~~(.*?)~~/g, '$1')
		// 인라인 코드 (`code`)
		.replace(/`([^`]+)`/g, '$1')
		// 링크 [text](url)
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		// 이미지 ![alt](url)
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		// 리스트 마커 (-, *, +, 숫자.)
		.replace(/^[\s]*[-*+]\s+/gm, '')
		.replace(/^[\s]*\d+\.\s+/gm, '')
		// 블록 인용 (>)
		.replace(/^>\s?/gm, '')
		// 수평선 (---, ***)
		.replace(/^[-*]{3,}\s*$/gm, '')
		// 연속 공백/줄바꿈 정리
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
