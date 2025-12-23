/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
// import * as dotenv from 'dotenv';
// import * as path from 'path';

export class CommitMessageGenerator {
	private anthropic: ReturnType<typeof createAnthropic> | null = null;
	private apiKey: string | undefined;

	constructor() {
		this.initializeApiKey();
	}

	private initializeApiKey(): void {
		// [WARNING] TEMPORARY HARDCODED API KEY
		// This key is paid via credit and is intended for internal testing only.
		// TODO: Remove this before public release or when env loading is fixed.
		const HARDCODED_KEY = 'vck_4XdyhTvmnGMqyMBjZSTfGjgTTw0OfkKanAuoABTT2mJhFd49bt4YtYL5';

		// .env 로드 로직 제거됨 (하드코딩으로 대체)
		/*
		// .env 파일 경로: 확장 기능 루트 디렉토리
		const envPath = path.join(__dirname, '..', '.env');

		const result = dotenv.config({ path: envPath });
		if (result.error) {
			console.error(`[CommitMessageGenerator] Failed to load .env from: ${envPath}`, result.error);
		} else {
			console.log(`[CommitMessageGenerator] Loaded .env from: ${envPath}`);
		}
		*/

		// 우선순위: Env Var -> Hardcoded
		if (!process.env.AI_GATEWAY_API_KEY) {
			process.env.AI_GATEWAY_API_KEY = HARDCODED_KEY;
			console.log('[CommitMessageGenerator] Using temporary hardcoded API Key.');
		}

		if (!process.env.AI_GATEWAY_API_KEY) {
			console.error('AI_GATEWAY_API_KEY is not configured. Please check your .env.template file.');
		}
	}

	/**
	 * Git diff를 분석하여 커밋 메시지를 생성합니다.
	 * @param diff Git diff 내용
	 * @returns 생성된 커밋 메시지 또는 null (API 키가 없거나 오류 발생 시)
	 */
	public async generateCommitMessage(diff: string): Promise<string | null> {
		if (!process.env.AI_GATEWAY_API_KEY) {
			console.error('AI_GATEWAY_API_KEY is not configured. Please check your .env.template file.');
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
		return process.env.AI_GATEWAY_API_KEY !== undefined;
	}
}
