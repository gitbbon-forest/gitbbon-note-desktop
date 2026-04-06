/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

export class CommitMessageGenerator {
	private anthropic: ReturnType<typeof createAnthropic> | null = null;
	private apiKey: string | undefined;
	private initialized = false;

	constructor(private readonly secrets: vscode.SecretStorage) { }

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) {
			return;
		}
		await this.initializeApiKey();
		this.initialized = true;
	}

	private async initializeApiKey(): Promise<void> {
		// 우선순위: SecretStorage -> 시스템 환경변수 -> 사용자 입력

		// 1. SecretStorage에서 먼저 확인
		this.apiKey = await this.secrets.get('AI_GATEWAY_API_KEY');

		// 2. SecretStorage에 없으면 시스템 환경변수 확인
		if (!this.apiKey) {
			this.apiKey = process.env.AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY;
		}

		// 3. 둘 다 없으면 사용자에게 입력받기
		if (!this.apiKey) {
			const userInput = await vscode.window.showInputBox({
				prompt: 'Vercel AI Gateway API 키를 입력해주세요',
				password: true,
				placeHolder: 'API Key'
			});

			if (userInput) {
				await this.secrets.store('AI_GATEWAY_API_KEY', userInput);
				this.apiKey = userInput;
				console.log('[CommitMessageGenerator] API Key stored in SecretStorage');
			}
		}

		if (this.apiKey) {
			// 호환성을 위해 AI_GATEWAY_API_KEY도 설정
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
		} else {
			console.error('AI_GATEWAY_API_KEY is not configured.');
		}
	}

	/**
	 * Git diff를 분석하여 커밋 메시지를 생성합니다.
	 * @param diff Git diff 내용
	 * @returns 생성된 커밋 메시지 또는 null (API 키가 없거나 오류 발생 시)
	 */
	public async generateCommitMessage(diff: string): Promise<string | null> {
		// Ensure initialized (lazy check)
		await this.ensureInitialized();

		if (!this.apiKey && !process.env.AI_GATE_API_KEY) {
			console.error('AI_GATE_API_KEY is not configured.');
			return null;
		}

		if (!diff || diff.trim().length === 0) {
			console.log('[CommitMessageGenerator] Empty diff, skipping message generation');
			return null;
		}

		// 여러 모델을 fallback 방식으로 시도
		const modelsToTry = [
			'claude-sonnet-4-20250514',
			'claude-3-5-sonnet-20241022',
			'claude-3-opus-20240229'
		];

		for (const modelName of modelsToTry) {
			try {
				console.log(`[CommitMessageGenerator] Trying model: ${modelName}`);

				const { text } = await generateText({
					model: modelName,
					prompt: `다음 Git diff를 분석하여 간결하고 명확한 한글 커밋 메시지를 작성해주세요.

규칙:
변경 사항을 충실하게 설명
커밋 메시지만 출력하고 다른 설명은 하지 마세요

Git diff:
\`\`\`
${diff.substring(0, 3000)}
\`\`\`

커밋 메시지:`,
				});

				const generatedMessage = text.trim();

				if (generatedMessage) {
					console.log(`[CommitMessageGenerator] Successfully generated message with ${modelName}: ${generatedMessage}`);
					return generatedMessage;
				}
			} catch (error: any) {
				// gitbbon custom: GatewayAuthenticationError 후 auth 상태 초기화 (#127)
				// GatewayAuthenticationError는 모든 모델에서 동일하게 실패하므로 즉시 중단하고 인증 상태를 초기화
				const isAuthError =
					error?.name === 'GatewayAuthenticationError' ||
					error?.constructor?.name === 'GatewayAuthenticationError' ||
					(typeof error?.message === 'string' && error.message.includes('Unauthenticated request to AI Gateway'));

				if (isAuthError) {
					console.warn(`[CommitMessageGenerator] GatewayAuthenticationError detected — clearing cached auth state`);
					await this.secrets.delete('AI_GATEWAY_API_KEY');
					this.apiKey = undefined;
					this.initialized = false;
					process.env.AI_GATEWAY_API_KEY = '';
					return null;
				}

				console.warn(`[CommitMessageGenerator] Failed with model ${modelName}:`, error.message);
				// 다음 모델로 계속 시도
				continue;
			}
		}

		// 모든 모델이 실패한 경우
		console.error('[CommitMessageGenerator] All models failed to generate commit message');
		return null;
	}

	/**
	 * API 키가 설정되어 있는지 확인합니다.
	 */
	public async isConfigured(): Promise<boolean> {
		await this.ensureInitialized();
		return this.apiKey !== undefined || process.env.AI_GATEWAY_API_KEY !== undefined || process.env.AI_GATE_API_KEY !== undefined;
	}
}
