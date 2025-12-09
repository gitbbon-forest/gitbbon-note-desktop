/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { history } from '@milkdown/plugin-history';
import { nord } from '@milkdown/theme-nord';

/**
 * Milkdown Editor 생성
 */
export async function createEditor(
	container: HTMLElement,
	onChange: (content: string) => void
): Promise<any> {
	const editor = await Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, container);
			ctx.set(defaultValueCtx, '');

			// Listener 설정
			ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
				if (markdown !== prevMarkdown) {
					onChange(markdown);
				}
			});
		})
		.use(nord)
		.use(commonmark)
		.use(gfm)
		.use(history)
		.use(listener)
		.create();

	return {
		setContent: (content: string) => {
			editor.action((ctx) => {
				const view = ctx.get(rootCtx);
				if (view) {
					ctx.set(defaultValueCtx, content);
				}
			});
		},
		getContent: () => {
			let content = '';
			editor.action((ctx) => {
				const view = ctx.get(rootCtx);
				if (view) {
					// Get markdown content from editor
					content = ctx.get(defaultValueCtx);
				}
			});
			return content;
		},
		destroy: () => {
			editor.destroy();
		}
	};
}
