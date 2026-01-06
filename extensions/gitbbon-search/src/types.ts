/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * 청크 정보 - 문서의 일부분에 대한 메타데이터
 */
export interface ChunkInfo {
	/** 원본 텍스트에서의 시작/끝 문자 위치 */
	range: [number, number];
	/** 임베딩 벡터 (Float32) */
	vector: number[];
}

/**
 * 인덱싱된 문서 정보
 */
export interface IndexedDocument {
	/** 고유 ID (filePath:chunkIndex) */
	id: string;
	/** 파일 경로 */
	filePath: string;
	/** 청크 인덱스 */
	chunkIndex: number;
	/** 원본 텍스트에서의 범위 */
	range: [number, number];
	/** 임베딩 벡터 */
	vector: number[];
}

/**
 * 검색 결과
 */
export interface SearchResult {
	/** 파일 경로 */
	filePath: string;
	/** 원본 텍스트에서의 범위 */
	range: [number, number];
	/** 유사도 점수 (0-1) */
	score: number;
	/** 텍스트 스니펫 (미리보기용) */
	snippet: string;
}

/**
 * 모델 초기화 상태
 */
export type ModelStatus = 'loading' | 'ready' | 'error';

/**
 * 인덱싱 상태
 */
export interface IndexingStatus {
	/** 현재 상태 */
	status: 'idle' | 'indexing' | 'ready' | 'error';
	/** 진행률 (0-100) */
	progress: number;
	/** 현재 처리 중인 파일 */
	currentFile?: string;
	/** 전체 파일 수 */
	totalFiles?: number;
	/** 완료된 파일 수 */
	completedFiles?: number;
}
