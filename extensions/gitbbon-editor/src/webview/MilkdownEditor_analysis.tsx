import React, { forwardRef, useImperativeHandle } from 'react';
import { MilkdownProvider, useEditor, Milkdown } from '@milkdown/react';
import { Crepe } from '@milkdown/crepe';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { editorViewCtx, parserCtx } from '@milkdown/core';
import { Ctx } from '@milkdown/ctx';
import "@milkdown/crepe/theme/common/style.css";
// import "@milkdown/crepe/theme/frame.css"; // Optional: Frame theme

interface MilkdownEditorProps {
	initialContent: string;
	onChange: (markdown: string) => void;
}

export interface MilkdownEditorRef {
	setContent: (markdown: string) => void;
}

const EditorComponent = forwardRef<MilkdownEditorRef, MilkdownEditorProps>(({ initialContent, onChange }, ref) => {
	// Cast to unknown then Crepe is not needed if we just treat it as any or fix the hook type if possible.
	// But simplify by casting the result.
	const { get: getInstance, loading } = useEditor((root) => {
		const crepe = new Crepe({
			root,
			defaultValue: initialContent,
		});

		// Configure Crepe here if needed
		// crepe.setReadOnly(false);

		// Access internal editor to add plugins like listener
		crepe.editor
			.config((ctx) => {
				// Listener setup
				ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
					if (markdown !== prevMarkdown) {
						onChange(markdown);
					}
				});
			})
			.use(listener);

		return crepe;
	}, []);

	useImperativeHandle(ref, () => ({
		setContent: (markdown: string) => {
			if (loading) return;
			const instance = getInstance() as unknown as Crepe;
			if (!instance) return;

			instance.editor.action((ctx: Ctx) => {
				const view = ctx.get(editorViewCtx);
				const parser = ctx.get(parserCtx);
				const doc = parser(markdown);
				if (!doc) return;
				const state = view.state;
				view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
			});
		}
	}));

	// We need to implement setContent properly.
	// Let's modify the component to import necessary context tokens.

	return <Milkdown />;
});
