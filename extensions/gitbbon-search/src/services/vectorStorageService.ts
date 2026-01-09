/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 벡터 청크 정보
 */
export interface VectorChunk {
	range: [number, number];
	hash: string;
	vector: string; // Base64 인코딩된 Int16 벡터
}

/**
 * 벡터 데이터 (JSON 파일 저장 형식)
 */
export interface VectorData {
	model: string;
	dim: number;
	contentHash: string;
	chunks: VectorChunk[];
}

/**
 * 벡터 저장소 서비스
 *
 * 마크다운 파일의 임베딩 벡터를 .gitbbon/vectors/ 디렉토리에 JSON 파일로 관리합니다.
 */
export class VectorStorageService {

	// ====== 경로 함수 ======

	/**
	 * 워크스페이스 루트 경로 반환
	 */
	getWorkspaceRoot(): vscode.Uri | null {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return null;
		}
		return folders[0].uri;
	}

	/**
	 * 마크다운 파일에 대응하는 벡터 JSON 파일 경로 반환
	 * @param mdUri 마크다운 파일 URI
	 * @returns 벡터 파일 경로 (예: {root}/.gitbbon/vectors/notes/hello.md.json)
	 */
	getVectorFilePath(mdUri: vscode.Uri): vscode.Uri | null {
		const root = this.getWorkspaceRoot();
		if (!root) {
			return null;
		}

		// 워크스페이스 루트 기준 상대 경로 계산
		const relativePath = path.relative(root.fsPath, mdUri.fsPath);
		if (relativePath.startsWith('..')) {
			// 워크스페이스 외부 파일
			console.warn('[VectorStorage] File is outside workspace:', mdUri.fsPath);
			return null;
		}

		// .gitbbon/vectors/{relativePath}.json
		const vectorPath = path.join(root.fsPath, '.gitbbon', 'vectors', `${relativePath}.json`);
		return vscode.Uri.file(vectorPath);
	}

	/**
	 * 벡터 파일 경로에서 디렉토리 부분 추출
	 * @param vectorUri 벡터 파일 URI
	 */
	getVectorDirPath(vectorUri: vscode.Uri): vscode.Uri {
		const dirPath = path.dirname(vectorUri.fsPath);
		return vscode.Uri.file(dirPath);
	}

	// ====== CRUD 함수 ======

	/**
	 * 벡터 데이터 저장
	 * @param mdUri 마크다운 파일 URI
	 * @param data 저장할 벡터 데이터
	 */
	async saveVectorData(mdUri: vscode.Uri, data: VectorData): Promise<void> {
		const vectorUri = this.getVectorFilePath(mdUri);
		if (!vectorUri) {
			console.error('[VectorStorage] Cannot get vector file path for:', mdUri.fsPath);
			return;
		}

		// 디렉토리 생성
		const dirUri = this.getVectorDirPath(vectorUri);
		try {
			await vscode.workspace.fs.createDirectory(dirUri);
		} catch {
			// 이미 존재하면 무시
		}

		// JSON 저장
		const encoder = new TextEncoder();
		const content = JSON.stringify(data, null, 2);
		await vscode.workspace.fs.writeFile(vectorUri, encoder.encode(content));
		console.log(`[VectorStorage] Saved: ${vectorUri.fsPath}`);
	}

	/**
	 * 벡터 데이터 로드
	 * @param mdUri 마크다운 파일 URI
	 * @returns 벡터 데이터 또는 null (파일 없거나 파싱 실패 시)
	 */
	async loadVectorData(mdUri: vscode.Uri): Promise<VectorData | null> {
		const vectorUri = this.getVectorFilePath(mdUri);
		if (!vectorUri) {
			return null;
		}

		try {
			const content = await vscode.workspace.fs.readFile(vectorUri);
			const decoder = new TextDecoder();
			const json = decoder.decode(content);
			return JSON.parse(json) as VectorData;
		} catch {
			// 파일이 없거나 파싱 실패
			return null;
		}
	}

	/**
	 * 벡터 데이터 삭제
	 * @param mdUri 마크다운 파일 URI
	 */
	async deleteVectorData(mdUri: vscode.Uri): Promise<void> {
		const vectorUri = this.getVectorFilePath(mdUri);
		if (!vectorUri) {
			return;
		}

		try {
			await vscode.workspace.fs.delete(vectorUri);
			console.log(`[VectorStorage] Deleted: ${vectorUri.fsPath}`);
		} catch {
			// 파일이 없으면 무시
		}
	}

	/**
	 * 유효한 캐시가 있는지 확인
	 * @param mdUri 마크다운 파일 URI
	 * @param contentHash 현재 콘텐츠의 해시
	 * @param model 현재 사용 중인 모델명
	 * @returns 캐시 사용 가능 여부
	 */
	async hasValidCache(mdUri: vscode.Uri, contentHash: string, model: string): Promise<boolean> {
		const data = await this.loadVectorData(mdUri);
		if (!data) {
			return false;
		}

		// 모델이 다르면 재임베딩 필요
		if (data.model !== model) {
			console.log('[VectorStorage] Model mismatch, re-embedding needed');
			return false;
		}

		// 콘텐츠가 변경되었으면 재임베딩 필요
		if (data.contentHash !== contentHash) {
			console.log('[VectorStorage] Content changed, re-embedding needed');
			return false;
		}

		return true;
	}

	/**
	 * 전체 vectors 폴더 삭제 (재인덱싱 시 사용)
	 */
	async clearAllVectors(): Promise<void> {
		const root = this.getWorkspaceRoot();
		if (!root) {
			return;
		}

		const vectorsDir = vscode.Uri.file(path.join(root.fsPath, '.gitbbon', 'vectors'));
		try {
			await vscode.workspace.fs.delete(vectorsDir, { recursive: true });
			console.log('[VectorStorage] Cleared all vectors:', vectorsDir.fsPath);
		} catch {
			// 폴더가 없으면 무시
			console.log('[VectorStorage] No vectors folder to clear');
		}
	}
}

// 싱글톤 인스턴스
export const vectorStorageService = new VectorStorageService();
