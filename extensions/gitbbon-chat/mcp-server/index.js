#!/usr/bin/env node
/**
 * gitbbon MCP stdio 서버
 *
 * Issue #90: 에디터 컨텍스트를 MCP tools로 노출한다.
 * JSON-RPC 2.0 over stdio 방식으로 동작하며,
 * 워크스페이스 루트의 .gitbbon-context.json 을 읽어 아래 3개 tool을 제공한다.
 *
 *   - getActiveFile  : 현재 활성 파일 경로 + 내용
 *   - getSelection   : 선택된 텍스트 + 라인 범위
 *   - getOpenFiles   : 열린 탭 목록
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── 컨텍스트 파일 경로 결정 ──────────────────────────────────────────────────
// 환경변수 GITBBON_CONTEXT_FILE 이 있으면 그것을, 없으면 cwd 기준으로 탐색.
function findContextFile() {
	if (process.env.GITBBON_CONTEXT_FILE) {
		return process.env.GITBBON_CONTEXT_FILE;
	}
	// cwd 부터 상위로 올라가며 .gitbbon-context.json 탐색
	let dir = process.cwd();
	for (let i = 0; i < 10; i++) {
		const candidate = path.join(dir, '.gitbbon-context.json');
		if (fs.existsSync(candidate)) {
			return candidate;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	// 찾지 못한 경우 cwd 기준 경로 반환 (파일이 없을 수 있음)
	return path.join(process.cwd(), '.gitbbon-context.json');
}

function readContext() {
	const contextPath = findContextFile();
	try {
		const raw = fs.readFileSync(contextPath, 'utf-8');
		return JSON.parse(raw);
	} catch (e) {
		return null;
	}
}

function readFileContent(filePath) {
	if (!filePath || filePath === 'None') {
		return null;
	}
	// 절대경로가 아닌 경우 cwd 기준으로 해석
	const resolved = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);
	try {
		return fs.readFileSync(resolved, 'utf-8');
	} catch {
		return null;
	}
}

// ─── MCP tool 정의 ────────────────────────────────────────────────────────────
const TOOLS = [
	{
		name: 'getActiveFile',
		description: '현재 에디터에서 열려있는 파일 경로와 내용을 반환합니다.',
		inputSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	},
	{
		name: 'getSelection',
		description: '현재 에디터에서 선택된 텍스트와 라인 범위를 반환합니다.',
		inputSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	},
	{
		name: 'getOpenFiles',
		description: '현재 열려있는 탭 목록을 반환합니다.',
		inputSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}
];

// ─── tool 실행 핸들러 ──────────────────────────────────────────────────────────
function handleToolCall(name) {
	const ctx = readContext();

	if (name === 'getActiveFile') {
		if (!ctx) {
			return { content: [{ type: 'text', text: '컨텍스트 파일을 읽을 수 없습니다. gitbbon 에디터가 실행 중인지 확인해 주세요.' }] };
		}
		const filePath = ctx.activeFile || 'None';
		const fileContent = readFileContent(filePath);
		const result = {
			path: filePath,
			content: fileContent ?? '(파일 내용을 읽을 수 없습니다.)'
		};
		return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
	}

	if (name === 'getSelection') {
		if (!ctx) {
			return { content: [{ type: 'text', text: '컨텍스트 파일을 읽을 수 없습니다. gitbbon 에디터가 실행 중인지 확인해 주세요.' }] };
		}
		const selection = ctx.selection ?? null;
		if (!selection) {
			return { content: [{ type: 'text', text: '현재 선택된 텍스트가 없습니다.' }] };
		}
		const result = {
			text: selection.text,
			start: selection.start,
			end: selection.end
		};
		return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
	}

	if (name === 'getOpenFiles') {
		if (!ctx) {
			return { content: [{ type: 'text', text: '컨텍스트 파일을 읽을 수 없습니다. gitbbon 에디터가 실행 중인지 확인해 주세요.' }] };
		}
		const openFiles = ctx.openFiles ?? [];
		return { content: [{ type: 'text', text: JSON.stringify(openFiles, null, 2) }] };
	}

	return { isError: true, content: [{ type: 'text', text: `알 수 없는 tool: ${name}` }] };
}

// ─── JSON-RPC 2.0 메시지 처리 ─────────────────────────────────────────────────
function send(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

function handleMessage(msg) {
	if (!msg || typeof msg !== 'object') {
		return;
	}

	const { id, method } = msg;

	if (method === 'initialize') {
		send({
			jsonrpc: '2.0',
			id,
			result: {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'gitbbon-ide', version: '1.0.0' }
			}
		});
		return;
	}

	if (method === 'notifications/initialized') {
		// 알림 메시지에는 응답하지 않음
		return;
	}

	if (method === 'tools/list') {
		send({
			jsonrpc: '2.0',
			id,
			result: { tools: TOOLS }
		});
		return;
	}

	if (method === 'tools/call') {
		const toolName = msg.params && msg.params.name;
		if (!toolName) {
			send({
				jsonrpc: '2.0',
				id,
				error: { code: -32602, message: 'tool name이 누락되었습니다.' }
			});
			return;
		}
		const result = handleToolCall(toolName);
		send({ jsonrpc: '2.0', id, result });
		return;
	}

	// 알 수 없는 메서드
	if (id !== undefined) {
		send({
			jsonrpc: '2.0',
			id,
			error: { code: -32601, message: `알 수 없는 메서드: ${method}` }
		});
	}
}

// ─── stdin 스트림 처리 ────────────────────────────────────────────────────────
process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', (chunk) => {
	buffer += chunk;
	const lines = buffer.split('\n');
	buffer = lines.pop(); // 마지막 불완전한 줄 보존
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const msg = JSON.parse(trimmed);
			handleMessage(msg);
		} catch (e) {
			// 파싱 오류는 무시 (서버 stability 유지)
			process.stderr.write(`[gitbbon-mcp] JSON 파싱 오류: ${e.message}\n`);
		}
	}
});

process.stdin.on('end', () => {
	process.exit(0);
});
