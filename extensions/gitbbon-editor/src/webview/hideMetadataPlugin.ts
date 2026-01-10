/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

/**
 * gitbbon custom: Hide Gitbbon Metadata Plugin
 *
 * 파일 끝에 있는 <!-- gitbbon:... --> 메타데이터 주석을 UI에서 숨김.
 * 문서 데이터에는 그대로 존재하여 저장 시 보존됨.
 */

// 메타데이터 패턴: <!-- gitbbon:... --> 주석
const GITBBON_METADATA_REGEX = /<!--\s*gitbbon:[\s\S]*?\s*-->/;

const hideMetadataPluginKey = new PluginKey('hideGitbbonMetadata');

// 초기화 로그
// 초기화 로그 제거됨 (과도한 출력 방지)

/**
 * Hide Gitbbon Metadata ProseMirror Plugin
 */
export const hideGitbbonMetadataPlugin = $prose(() => {
	// 플러그인 생성 로그 제거됨

	return new Plugin({
		key: hideMetadataPluginKey,
		props: {
			decorations(state) {
				const { doc } = state;
				const decorations: Decoration[] = [];
				const fullText = doc.textContent;

				// 매번 호출되는지 확인 (첫 호출만 로그)
				// 첫 호출 로그 제거됨 (과도한 출력 방지)

				// 문서 내 모든 노드 순회
				doc.descendants((node: any, pos: number) => {
					// 텍스트 노드에서 메타데이터 패턴 찾기
					if (node.isText && node.text) {
						const text = node.text;
						const match = text.match(GITBBON_METADATA_REGEX);

						if (match && match.index !== undefined) {
							const from = pos + match.index;
							const to = from + match[0].length;


							decorations.push(
								Decoration.inline(from, to, {
									class: 'gitbbon-hidden-metadata',
									style: 'display: none !important;'
								})
							);
						}
					}

					// Paragraph나 다른 블록 노드의 textContent 확인
					if (node.isBlock && !node.isText) {
						const blockText = node.textContent;
						if (blockText && GITBBON_METADATA_REGEX.test(blockText)) {

							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, {
									class: 'gitbbon-hidden-metadata-block',
									style: 'display: none !important;'
								})
							);
							return false;
						}
					}

					return true;
				});

				if (decorations.length > 0) {
					return DecorationSet.create(doc, decorations);
				}

				return DecorationSet.empty;
			}
		}
	});
});

// CSS 스타일
export const hideMetadataStyles = `
.gitbbon-hidden-metadata,
.gitbbon-hidden-metadata-block {
	display: none !important;
	visibility: hidden !important;
}
`;
