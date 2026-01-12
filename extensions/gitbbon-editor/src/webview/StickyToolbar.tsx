import React, { FC } from 'react';
import { useInstance } from '@milkdown/react';
import { editorViewCtx } from '@milkdown/core';
import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { wrapInList } from 'prosemirror-schema-list';

// Icons
const Icons = {
	Bold: <b>B</b>,
	Italic: <i>I</i>,
	Strike: <s>S</s>,
	H1: <span>H1</span>,
	H2: <span>H2</span>,
	H3: <span>H3</span>,
	Quote: <span>""</span>,
	Code: <span>&lt;&gt;</span>,
	BulletList: <span>• List</span>,
	OrderedList: <span>1. List</span>,
	Undo: <span>↩</span>,
	Redo: <span>↪</span>,
	Paragraph: <span>¶</span>,
};

export const StickyToolbar: FC = () => {
	const [loading, getEditor] = useInstance();

	// Execute a ProseMirror command via editorViewCtx
	const runCommand = (commandFn: (state: any, dispatch?: any, view?: any) => boolean) => (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (loading) return;
		const editor = getEditor();
		if (!editor) return;

		try {
			editor.action((ctx: any) => {
				const view = ctx.get(editorViewCtx);
				commandFn(view.state, view.dispatch, view);
			});
		} catch (err) {
			console.error('[gitbbon-editor][StickyToolbar] Error:', err);
		}
	};

	// Toggle mark (Bold, Italic, Code, Strike)
	const runToggleMark = (markName: string) => (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (loading) return;
		const editor = getEditor();
		if (!editor) return;

		try {
			editor.action((ctx: any) => {
				const view = ctx.get(editorViewCtx);
				const { schema, state, dispatch } = { schema: view.state.schema, state: view.state, dispatch: view.dispatch };
				const markType = schema.marks[markName];
				if (markType) {
					toggleMark(markType)(state, dispatch);
				}
			});
		} catch (err) {
			console.error('[gitbbon-editor][StickyToolbar] Error toggling mark:', err);
		}
	};

	// Set block type (Heading, Paragraph)
	const runSetBlockType = (nodeName: string, attrs?: any) => (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (loading) return;
		const editor = getEditor();
		if (!editor) return;

		try {
			editor.action((ctx: any) => {
				const view = ctx.get(editorViewCtx);
				const { schema, state, dispatch } = { schema: view.state.schema, state: view.state, dispatch: view.dispatch };
				const nodeType = schema.nodes[nodeName];
				if (nodeType) {
					setBlockType(nodeType, attrs)(state, dispatch);
				}
			});
		} catch (err) {
			console.error('[gitbbon-editor][StickyToolbar] Error setting block type:', err);
		}
	};

	// Wrap in list
	const runWrapInList = (listType: string) => (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (loading) return;
		const editor = getEditor();
		if (!editor) return;

		try {
			editor.action((ctx: any) => {
				const view = ctx.get(editorViewCtx);
				const { schema, state, dispatch } = { schema: view.state.schema, state: view.state, dispatch: view.dispatch };
				const nodeType = schema.nodes[listType];
				if (nodeType) {
					wrapInList(nodeType)(state, dispatch);
				}
			});
		} catch (err) {
			console.error('[gitbbon-editor][StickyToolbar] Error wrapping in list:', err);
		}
	};

	// Wrap in blockquote
	const runWrapInBlockquote = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (loading) return;
		const editor = getEditor();
		if (!editor) return;

		try {
			editor.action((ctx: any) => {
				const view = ctx.get(editorViewCtx);
				const { schema, state, dispatch } = { schema: view.state.schema, state: view.state, dispatch: view.dispatch };
				const nodeType = schema.nodes.blockquote;
				if (nodeType) {
					wrapIn(nodeType)(state, dispatch);
				}
			});
		} catch (err) {
			console.error('[gitbbon-editor][StickyToolbar] Error wrapping in blockquote:', err);
		}
	};

	return (
		<div className="gitbbon-sticky-toolbar">
			<button onMouseDown={runCommand(undo)} title="Undo">{Icons.Undo}</button>
			<button onMouseDown={runCommand(redo)} title="Redo">{Icons.Redo}</button>
			<div className="separator" />

			<button onMouseDown={runSetBlockType('heading', { level: 1 })} title="H1">{Icons.H1}</button>
			<button onMouseDown={runSetBlockType('heading', { level: 2 })} title="H2">{Icons.H2}</button>
			<button onMouseDown={runSetBlockType('heading', { level: 3 })} title="H3">{Icons.H3}</button>
			<button onMouseDown={runSetBlockType('paragraph')} title="Paragraph">{Icons.Paragraph}</button>
			<div className="separator" />

			<button onMouseDown={runToggleMark('strong')} title="Bold">{Icons.Bold}</button>
			<button onMouseDown={runToggleMark('em')} title="Italic">{Icons.Italic}</button>
			<button onMouseDown={runToggleMark('strike')} title="Strikethrough">{Icons.Strike}</button>
			<button onMouseDown={runToggleMark('inlineCode')} title="Inline Code">{Icons.Code}</button>
			<div className="separator" />

			<button onMouseDown={runWrapInList('bullet_list')} title="Bullet List">{Icons.BulletList}</button>
			<button onMouseDown={runWrapInList('ordered_list')} title="Ordered List">{Icons.OrderedList}</button>
			<button onMouseDown={runWrapInBlockquote} title="Quote">{Icons.Quote}</button>
		</div>
	);
};
