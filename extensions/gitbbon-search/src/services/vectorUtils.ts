/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * 벡터 유틸리티 함수들
 * - 해시 생성
 * - 벡터 인코딩/디코딩 (Float32 ↔ Int16 Base64)
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
