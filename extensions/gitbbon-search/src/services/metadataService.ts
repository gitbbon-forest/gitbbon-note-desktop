/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// 파일 끝에 위치하는 한 줄 메타데이터
const METADATA_REGEX = /\s*<!--\s*gitbbon:(.*?)\s*-->\s*$/;
const MODEL_NAME = 'Xenova/multilingual-e5-small';

/**
 * 청크 정보 (외부용)
 */
export interface ChunkInfo {
	range: [number, number];
	hash: string;
	vector: string; // Base64 인코딩된 Int16 벡터
}

/**
 * 모델 임베딩 정보 (외부용)
 */
export interface ModelEmbedding {
	model: string;
	vectorDimension: number;
	dtype: string;
	contentHash: string;
	chunks: ChunkInfo[];
}

/**
 * Gitbbon 메타데이터 (외부용)
 */
export interface GitbbonMetadata {
	embedding?: ModelEmbedding;
}

/**
 * 청크 정보 (저장용 - 단축)
 */
interface ShortChunkInfo {
	r: [number, number]; // range
	h: string;           // hash
	v: string;           // vector
}

/**
 * 모델 임베딩 정보 (저장용 - 단축)
 */
interface ShortEmbedding {
	model: string;
	dim: number;  // vectorDimension
	dtype: string;
	hash: string; // contentHash
	chunks: ShortChunkInfo[];
}

/**
 * 메타데이터 (저장용 - 단축)
 */
interface ShortMetadata {
	embedding?: ShortEmbedding;
}

/**
 * 간단한 해시 함수
 */
export function simpleHash(text: string): string {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(16);
}

/**
 * Float32 벡터를 Int16으로 양자화 후 Base64 인코딩
 */
export function encodeVector(vector: number[]): string {
	const int16Array = new Int16Array(vector.length);
	for (let i = 0; i < vector.length; i++) {
		// -1 ~ 1 범위를 -32768 ~ 32767로 변환
		int16Array[i] = Math.round(vector[i] * 32767);
	}
	const bytes = new Uint8Array(int16Array.buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Base64 인코딩된 Int16 벡터를 Float32로 디코딩
 */
export function decodeVector(base64: string): number[] {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	const int16Array = new Int16Array(bytes.buffer);
	const vector: number[] = [];
	for (let i = 0; i < int16Array.length; i++) {
		vector.push(int16Array[i] / 32767);
	}
	return vector;
}

/**
 * 마크다운 파일에서 메타데이터 추출
 */
export function parseMetadata(content: string): GitbbonMetadata | null {
	const match = content.match(METADATA_REGEX);
	if (!match) return null;

	try {
		const shortMetadata: ShortMetadata = JSON.parse(match[1].trim());
		if (!shortMetadata.embedding) return null;

		// Short -> Full 변환
		return {
			embedding: {
				model: shortMetadata.embedding.model,
				vectorDimension: shortMetadata.embedding.dim,
				dtype: shortMetadata.embedding.dtype,
				contentHash: shortMetadata.embedding.hash,
				chunks: shortMetadata.embedding.chunks.map(c => ({
					range: c.r,
					hash: c.h,
					vector: c.v
				}))
			}
		};
	} catch (e) {
		console.error('[Metadata] Parse error:', e);
		return null;
	}
}

/**
 * 마크다운 파일에서 메타데이터 제거 (본문만 추출)
 */
export function getContentWithoutMetadata(content: string): string {
	let cleanContent = content;
	// 반복적으로 파일 끝의 메타데이터를 제거 (누적된 메타데이터 정리)
	while (true) {
		const match = cleanContent.match(METADATA_REGEX);
		if (!match) break;
		cleanContent = cleanContent.replace(METADATA_REGEX, '');
	}
	return cleanContent.trimEnd();
}

/**
 * 메타데이터를 마크다운 파일에 저장
 */
export async function saveMetadataToFile(
	uri: vscode.Uri,
	content: string,
	embedding: ModelEmbedding
): Promise<void> {
	// Full -> Short 변환
	const shortMetadata: ShortMetadata = {
		embedding: {
			model: embedding.model,
			dim: embedding.vectorDimension,
			dtype: embedding.dtype,
			hash: embedding.contentHash,
			chunks: embedding.chunks.map(c => ({
				r: c.range,
				h: c.hash,
				v: c.vector
			}))
		}
	};

	const metadataComment = `<!-- gitbbon:${JSON.stringify(shortMetadata)} -->`;

	// 기존 메타데이터 제거 후 파일 끝에 추가
	const cleanContent = getContentWithoutMetadata(content);
	const newContent = `${cleanContent}\n\n${metadataComment}`;

	const encoder = new TextEncoder();
	await vscode.workspace.fs.writeFile(uri, encoder.encode(newContent));
	console.log(`[Metadata] Saved to ${uri.fsPath}`);
}

/**
 * 캐시된 임베딩 사용 가능 여부 확인
 */
export function canUseCachedEmbedding(
	content: string,
	metadata: GitbbonMetadata | null
): boolean {
	if (!metadata?.embedding) return false;

	const { embedding } = metadata;

	// 모델이 다르면 재임베딩 필요
	if (embedding.model !== MODEL_NAME) {
		console.log('[Metadata] Model mismatch, re-embedding needed');
		return false;
	}

	// 콘텐츠가 변경되었으면 재임베딩 필요
	const cleanContent = getContentWithoutMetadata(content);
	const currentHash = simpleHash(cleanContent);
	if (currentHash !== embedding.contentHash) {
		console.log('[Metadata] Content changed, re-embedding needed');
		return false;
	}

	return true;
}

/**
 * 현재 사용 중인 모델 이름
 */
export function getCurrentModelName(): string {
	return MODEL_NAME;
}
