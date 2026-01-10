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
