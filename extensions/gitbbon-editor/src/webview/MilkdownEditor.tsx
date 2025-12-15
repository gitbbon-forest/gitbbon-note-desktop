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
			if (loading) {
				console.log('[MilkdownEditor] Editor is still loading');
				return;
			}
			const editor = getInstance();
			if (!editor) {
				console.log('[MilkdownEditor] Editor instance is null/undefined');
				return;
			}

			// getInstance() returns Milkdown Editor directly (not Crepe)
			// Editor has action method directly on it
			if (typeof (editor as any).action === 'function') {
				(editor as any).action((ctx: any) => {
					const view = ctx.get(editorViewCtx);
					const parser = ctx.get(parserCtx);
					const doc = parser(markdown);
					if (!doc) return;
					const { state } = view;
					view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
				});
				console.log('[MilkdownEditor] ✅ Content updated successfully');
			} else {
				console.error('[MilkdownEditor] ❌ action method not found on editor');
			}
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
