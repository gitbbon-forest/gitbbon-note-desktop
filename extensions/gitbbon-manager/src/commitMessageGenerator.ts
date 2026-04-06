/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// gitbbon custom: Issue #129 - AI 기능을 gitbbon-chat Extension에 위임
// 하드코딩된 모델 제거, gitbbon.generateCommitMessage 커맨드로 위임
export class CommitMessageGenerator {
	// gitbbon custom: Issue #129 - secrets 파라미터 제거 (AI는 gitbbon-chat이 전담)
	constructor() { }

	/**
	 * Git diff를 분석하여 커밋 메시지를 생성합니다.
	 * gitbbon-chat Extension의 gitbbon.generateCommitMessage 커맨드에 위임합니다.
	 * @param diff Git diff 내용
	 * @returns 생성된 커밋 메시지 또는 null
	 */
	public async generateCommitMessage(diff: string): Promise<string | null> {
		if (!diff || diff.trim().length === 0) {
			return null;
		}

		// gitbbon custom: Issue #129 - gitbbon-chat Extension 활성화 확인 후 커맨드 호출
		const chatExt = vscode.extensions.getExtension('gitbbon.gitbbon-chat');
		if (chatExt && !chatExt.isActive) {
			await chatExt.activate();
		}

		if (!chatExt) {
			return null;
		}

		try {
			const result = await vscode.commands.executeCommand<string | null>(
				'gitbbon.generateCommitMessage',
				diff
			);
			return result || null;
		} catch (error: any) {
			return null;
		}
	}

	/**
	 * gitbbon-chat Extension이 사용 가능한지 확인합니다.
	 */
	public async isConfigured(): Promise<boolean> {
		const chatExt = vscode.extensions.getExtension('gitbbon.gitbbon-chat');
		return chatExt !== undefined;
	}
}
