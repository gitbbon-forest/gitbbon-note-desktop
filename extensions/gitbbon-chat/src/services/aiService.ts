import { streamText, type CoreMessage } from 'ai';
// import * as dotenv from 'dotenv';
// import * as path from 'path';
import { MODELS_TO_TRY } from '../config/constants';

export class AIService {
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
		const envPath = path.join(__dirname, '..', '..', '.env');

		const result = dotenv.config({ path: envPath });
		if (result.error) {
			console.error(`[GitbbonChat] Failed to load .env from: ${envPath}`, result.error);
		} else {
			console.log(`[GitbbonChat] Loaded .env from: ${envPath}`);
		}
		*/

		// 우선순위: VERCEL_AI_GATE_API_KEY -> AI_GATEWAY_API_KEY -> Hardcoded
		this.apiKey = process.env.VERCEL_AI_GATE_API_KEY || process.env.AI_GATEWAY_API_KEY || HARDCODED_KEY;

		if (this.apiKey) {
			process.env.AI_GATEWAY_API_KEY = this.apiKey;
			console.log('[GitbbonChat] Initialized with API Key (Hardcoded fallback active)');
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
