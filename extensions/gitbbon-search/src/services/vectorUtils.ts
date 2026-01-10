/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * 벡터 유틸리티 함수들
 * - 해시 생성
 * - 벡터 인코딩/디코딩 (Float32 Base64)
 */

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
 * Float32 벡터를 Base64 인코딩 (양자화 없이 원본 정밀도 유지)
 */
export function encodeVector(vector: number[]): string {
	const float32Array = new Float32Array(vector);
	const bytes = new Uint8Array(float32Array.buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Base64 인코딩된 Float32 벡터를 디코딩
 */
export function decodeVector(base64: string): number[] {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	const float32Array = new Float32Array(bytes.buffer);
	return Array.from(float32Array);
}
