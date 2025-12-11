import React, { forwardRef, useImperativeHandle } from 'react';
import { MilkdownProvider, useEditor, Milkdown } from '@milkdown/react';
import { Crepe } from '@milkdown/crepe';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { editorViewCtx, parserCtx } from '@milkdown/core';
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
	const { get: getInstance, loading } = useEditor((root) => {
		const crepe = new Crepe({
			root,
			defaultValue: initialContent,
			features: {
				[Crepe.Feature.Placeholder]: false // Optional: Disable placeholder
			}
		});

		// Configure Listener
		crepe.editor
			.config((ctx) => {
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
			const instance = getInstance();
			if (!instance) return;

			// Crepe instance has 'editor' property which is the Milkdown Editor
			(instance as unknown as Crepe).editor.action((ctx) => {
				const view = ctx.get(editorViewCtx);
				const parser = ctx.get(parserCtx);
				const doc = parser(markdown);
				if (!doc) return;
				const { state } = view;
				view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
			});
		}
	}));

	return <Milkdown />;
});

export const MilkdownEditor = forwardRef<MilkdownEditorRef, MilkdownEditorProps>((props, ref) => {
	return (
		<MilkdownProvider>
			<EditorComponent {...props} ref={ref} />
		</MilkdownProvider>
	);
});
