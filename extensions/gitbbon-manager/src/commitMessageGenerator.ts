/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env 파일 로드
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export class CommitMessageGenerator {
	private anthropic: ReturnType<typeof createAnthropic> | null = null;
	private apiKey: string | undefined;

	constructor() {
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY;
		if (this.apiKey) {
			// Vercel AI Gateway는 AI_GATEWAY_API_KEY 환경변수를 사용
			process.env.AI_GATEWAY_API_KEY = this.apiKey;

			// Anthropic 프로바이더 생성
			this.anthropic = createAnthropic();
			console.log('[CommitMessageGenerator] Initialized with Vercel AI Gate');
		} else {
			console.warn('[CommitMessageGenerator] No API key found. Commit message generation will be disabled.');
		}
	}

	/**
	 * Git diff를 분석하여 커밋 메시지를 생성합니다.
	 * @param diff Git diff 내용
	 * @returns 생성된 커밋 메시지 또는 null (API 키가 없거나 오류 발생 시)
	 */
	public async generateCommitMessage(diff: string): Promise<string | null> {
		if (!this.anthropic || !this.apiKey) {
			console.log('[CommitMessageGenerator] API key not configured, skipping message generation');
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
					model: this.anthropic(modelName),
					maxTokens: 200,
					temperature: 0.3,
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
	public isConfigured(): boolean {
		return !!this.apiKey;
	}
}
