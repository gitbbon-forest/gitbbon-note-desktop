/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Progress Event Types
 */

export interface ToolStartEvent {
	type: 'tool-start';
	id: string;
	toolName: string;
	args?: Record<string, unknown>;
	timestamp: number;
}

export interface ToolEndEvent {
	type: 'tool-end';
	id: string;
	toolName: string;
	duration: number; // ms
	success: boolean;
}

export interface TextEvent {
	type: 'text';
	content: string;
}

export type StreamEvent = ToolStartEvent | ToolEndEvent | TextEvent;

/**
 * Tool Event Emitter interface
 */
export interface ToolEventEmitter {
	emit: (event: ToolStartEvent | ToolEndEvent) => void;
}

/**
 * Generate unique tool execution ID
 */
export function generateToolId(): string {
	return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
