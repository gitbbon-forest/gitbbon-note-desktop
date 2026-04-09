/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logService } from './logService';

/**
 * Issue #90: 워크스페이스를 열 때 에이전트별 MCP 설정 파일을 자동으로 생성한다.
 *
 * 핵심 원칙:
 * - 각 파일이 이미 존재하면 생성하지 않음 (덮어쓰기 금지)
 * - MCP 서버 스크립트는 .gitbbon/mcp-server/index.js로 배포
 * - context 파일 경로: .gitbbon/state/context.json
 */
export class McpSetupService {
	/**
	 * 워크스페이스 루트에 MCP 설정 파일들을 생성한다.
	 */
	public static async setup(context: vscode.ExtensionContext): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			logService.info('[debug:#90][manager] McpSetupService: 워크스페이스 없음, 스킵');
			return;
		}

		const wsRoot = workspaceFolders[0].uri.fsPath;
		logService.info(`[debug:#90][manager] McpSetupService: 워크스페이스 루트=${wsRoot}`);

		// 1. MCP 서버 스크립트를 .gitbbon/mcp-server/index.js 에 배포
		await McpSetupService._deployMcpServer(context, wsRoot);

		// 2. 에이전트별 설정 파일 생성 (존재하면 skip)
		await McpSetupService._createAgentConfigFiles(wsRoot);

		// 3. .gitignore 업데이트
		McpSetupService._updateGitignore(wsRoot);

		// 4. VS Code files.exclude 설정
		McpSetupService._updateVscodeExclude(wsRoot);

		logService.info('[debug:#90][manager] McpSetupService: 완료');
	}

	/**
	 * MCP 서버 스크립트를 .gitbbon/mcp-server/index.js 에 복사한다.
	 * 항상 최신 버전으로 덮어쓴다 (서버 스크립트는 확장 번들이므로).
	 */
	private static async _deployMcpServer(context: vscode.ExtensionContext, wsRoot: string): Promise<void> {
		const mcpServerSrc = path.join(context.extensionPath, 'mcp-server', 'index.js');
		const mcpServerDir = path.join(wsRoot, '.gitbbon', 'mcp-server');
		const mcpServerDest = path.join(mcpServerDir, 'index.js');

		try {
			fs.mkdirSync(mcpServerDir, { recursive: true });
			fs.copyFileSync(mcpServerSrc, mcpServerDest);
			logService.info(`[debug:#90][manager] MCP 서버 스크립트 배포 완료: ${mcpServerDest}`);
		} catch (e) {
			logService.warn(`[debug:#90][manager] MCP 서버 스크립트 배포 실패: ${e}`);
		}
	}

	/**
	 * 에이전트별 MCP 설정 파일을 생성한다. 파일이 이미 존재하면 skip.
	 */
	private static async _createAgentConfigFiles(wsRoot: string): Promise<void> {
		const mcpJsonContent = JSON.stringify({
			mcpServers: {
				'gitbbon-ide': {
					command: 'node',
					args: ['.gitbbon/mcp-server/index.js']
				}
			}
		}, null, 2);

		const continueJsonContent = JSON.stringify({
			mcpServers: [
				{
					name: 'gitbbon-ide',
					command: 'node',
					args: ['.gitbbon/mcp-server/index.js']
				}
			]
		}, null, 2);

		const codexTomlContent = `[mcp_servers.gitbbon-ide]\ncommand = "node .gitbbon/mcp-server/index.js"\n`;

		const agentFiles: Array<{ relPath: string; content: string }> = [
			{ relPath: '.mcp.json', content: mcpJsonContent },
			{ relPath: path.join('.cursor', 'mcp.json'), content: mcpJsonContent },
			{ relPath: path.join('.vscode', 'mcp.json'), content: mcpJsonContent },
			{ relPath: path.join('.windsurf', 'mcp.json'), content: mcpJsonContent },
			{ relPath: path.join('.gemini', 'settings.json'), content: mcpJsonContent },
			{ relPath: path.join('.codex', 'config.toml'), content: codexTomlContent },
			{ relPath: path.join('.continue', 'mcpServers', 'mcp.json'), content: continueJsonContent },
		];

		for (const { relPath, content } of agentFiles) {
			const fullPath = path.join(wsRoot, relPath);

			// 이미 존재하면 skip (덮어쓰기 금지)
			if (fs.existsSync(fullPath)) {
				logService.info(`[debug:#90][manager] 에이전트 설정 파일 이미 존재, skip: ${relPath}`);
				continue;
			}

			const dir = path.dirname(fullPath);
			try {
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(fullPath, content, 'utf-8');
				logService.info(`[debug:#90][manager] 에이전트 설정 파일 생성: ${relPath}`);
			} catch (e) {
				logService.warn(`[debug:#90][manager] 에이전트 설정 파일 생성 실패 (${relPath}): ${e}`);
			}
		}
	}

	/**
	 * .gitignore에 MCP 관련 항목을 추가한다. 이미 존재하면 skip.
	 */
	private static _updateGitignore(wsRoot: string): void {
		const gitignorePath = path.join(wsRoot, '.gitignore');
		const marker = '# gitbbon MCP 설정 (자동 생성)';
		const gitignoreEntries = [
			marker,
			'.mcp.json',
			'.cursor/mcp.json',
			'.vscode/mcp.json',
			'.windsurf/mcp.json',
			'.gemini/settings.json',
			'.codex/config.toml',
			'.continue/mcpServers/mcp.json',
			'.gitbbon/',
			''
		].join('\n');

		try {
			let existing = '';
			try {
				existing = fs.readFileSync(gitignorePath, 'utf-8');
			} catch {
				// 파일 없으면 새로 생성
			}

			if (existing.includes(marker)) {
				logService.info('[debug:#90][manager] .gitignore 이미 업데이트됨, 스킵');
				return;
			}

			const updated = existing.endsWith('\n') || existing === ''
				? existing + gitignoreEntries
				: existing + '\n' + gitignoreEntries;

			fs.writeFileSync(gitignorePath, updated, 'utf-8');
			logService.info('[debug:#90][manager] .gitignore 업데이트 완료');
		} catch (e) {
			logService.warn(`[debug:#90][manager] .gitignore 업데이트 실패: ${e}`);
		}
	}

	/**
	 * .vscode/settings.json의 files.exclude에 .gitbbon/ 등을 추가한다.
	 */
	private static _updateVscodeExclude(wsRoot: string): void {
		const settingsPath = path.join(wsRoot, '.vscode', 'settings.json');
		const excludeKeys: Record<string, boolean> = {
			'.mcp.json': true,
			'.cursor': true,
			'.windsurf': true,
			'.gemini': true,
			'.codex': true,
			'.continue': true,
			'.gitbbon': true,
		};

		try {
			fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

			let settings: Record<string, unknown> = {};
			try {
				const raw = fs.readFileSync(settingsPath, 'utf-8');
				settings = JSON.parse(raw);
			} catch {
				// 파일 없거나 파싱 실패 시 빈 객체로 시작
			}

			const existingExclude = (settings['files.exclude'] as Record<string, boolean>) ?? {};
			// 이미 모든 키가 있으면 skip
			const allExist = Object.keys(excludeKeys).every(k => k in existingExclude);
			if (allExist) {
				logService.info('[debug:#90][manager] files.exclude 이미 최신, 스킵');
				return;
			}

			const mergedExclude = { ...existingExclude, ...excludeKeys };
			settings['files.exclude'] = mergedExclude;

			fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
			logService.info('[debug:#90][manager] .vscode/settings.json files.exclude 업데이트 완료');
		} catch (e) {
			logService.warn(`[debug:#90][manager] .vscode/settings.json 업데이트 실패: ${e}`);
		}
	}
}
