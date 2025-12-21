import { streamText, type CoreMessage } from 'ai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { MODELS_TO_TRY } from '../config/constants';

export class AIService {
	private apiKey: string | undefined;

	constructor() {
		this.initializeApiKey();
	}

	private initializeApiKey(): void {
		// 프로젝트 루트의 .env 파일 로드
		// 1. 배포 환경: 확장 기능 루트 디렉토리 (__dirname = .../extensions/gitbbon-chat/out/services)
		dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
		// 2. 개발 환경: 프로젝트 루트 디렉토리
		const envPath = path.join(__dirname, '..', '..', '..', '.env');
		dotenv.config({ path: envPath });

		// 우선순위: VERCEL_AI_GATE_API_KEY -> AI_GATEWAY_API_KEY
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY;

		if (this.apiKey) {
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			console.log('[GitbbonChat] Initialized with API Key');
		} else {
			console.warn('[GitbbonChat] No API key found. Chat will use demo mode.');
		}
	}

	public hasApiKey(): boolean {
		return !!this.apiKey;
	}

	public async *streamChat(messages: CoreMessage[]): AsyncGenerator<string, void, unknown> {
		for (const modelName of MODELS_TO_TRY) {
			try {
				console.log(`[GitbbonChat] Trying model: ${modelName}`);

				const result = await streamText({
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					model: modelName as any,
					messages: messages,
				});

				for await (const textPart of result.textStream) {
					yield textPart;
				}

				console.log(`[GitbbonChat] Stream finished with ${modelName}`);
				return; // Success, exit loop

			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.warn(`[GitbbonChat] Failed with model ${modelName}:`, errorMessage);
				// Continue to next model
			}
		}

		throw new Error('All models failed');
	}
}
