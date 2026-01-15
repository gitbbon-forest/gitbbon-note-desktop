/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * 벡터 유틸리티 함수들
 * - 해시 생성
 * - 벡터 인코딩/디코딩 (Float32 Base64)
 */

import * as crypto from 'crypto';

/**
 * 간단한 해시 함수 (SHA-256 기반)
 * modelHost.ts의 구현과 일치시켜야 함 (Web Crypto API vs Node Crypto)
 */
export function simpleHash(text: string): string {
	const hash = crypto.createHash('sha256').update(text).digest();
	// 첫 8바이트만 사용하여 짧은 해시 생성 (modelHost.ts와 동일하게)
	return Array.from(hash.subarray(0, 8))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
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
