/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';
import { modelService } from './modelService';

interface SearchResult {
	filePath: string;
	range: [number, number];
	score: number;
	snippet: string;
}

interface VSCodeAPI {
	postMessage: (message: unknown) => void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

export function App() {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [loadProgress, setLoadProgress] = useState(0);
	const [indexingCount, setIndexingCount] = useState(0);

	// 문서를 청크로 분할
	const chunkDocument = (text: string, chunkSize = 500, overlap = 100): Array<{ text: string; range: [number, number] }> => {
		const chunks: Array<{ text: string; range: [number, number] }> = [];
		let start = 0;

		while (start < text.length) {
			const end = Math.min(start + chunkSize, text.length);
			chunks.push({
				text: text.slice(start, end),
				range: [start, end]
			});
			start += chunkSize - overlap;
		}

		return chunks;
	};

	// 모델 초기화
	useEffect(() => {
		modelService.init((progress, message) => {
			setLoadProgress(progress);
			console.log('[App]', message);
		}).then(() => {
			setModelStatus('ready');
			console.log('[App] Model ready');
			// Extension에 Webview 준비 완료 알림
			vscode.postMessage({ type: 'webviewReady' });
		}).catch((err) => {
			console.error('[App] Model init error:', err);
			setModelStatus('error');
			setError('모델 로딩 실패');
		});
	}, []);

	// VS Code 메시지 수신
	useEffect(() => {
		const handleMessage = async (event: MessageEvent) => {
			const message = event.data;
			console.log('[App] Received message from Extension:', message.type);

			switch (message.type) {
				case 'embedDocument':
					// Extension에서 파일 임베딩 요청
					if (modelService.isReady()) {
						console.log('[App] Embedding document:', message.filePath);
						try {
							const chunks = chunkDocument(message.content);
							const embeddedChunks: Array<{ chunkIndex: number; range: [number, number]; vector: number[] }> = [];

							for (let i = 0; i < chunks.length; i++) {
								const chunk = chunks[i];
								const vector = await modelService.embedDocument(chunk.text);
								embeddedChunks.push({
									chunkIndex: i,
									range: chunk.range,
									vector
								});
							}

							// 콘텐츠 해시 생성
							const simpleHash = (text: string): string => {
								let hash = 0;
								for (let i = 0; i < text.length; i++) {
									const char = text.charCodeAt(i);
									hash = ((hash << 5) - hash) + char;
									hash = hash & hash;
								}
								return Math.abs(hash).toString(16);
							};

							// Extension에 임베딩 결과 전송
							vscode.postMessage({
								type: 'embeddingResult',
								filePath: message.filePath,
								chunks: embeddedChunks,
								contentHash: simpleHash(message.content)
							});

							setIndexingCount(prev => prev + 1);
							console.log(`[App] Indexed ${message.filePath} (${embeddedChunks.length} chunks)`);
						} catch (err) {
							console.error('[App] Embedding error:', err);
						}
					}
					break;
				case 'searchResults':
					console.log('[App] Search results received:', message.data?.length || 0, 'items');
					setResults(message.data || []);
					setIsSearching(false);
					break;
				case 'searchError':
					console.error('[App] Search error:', message.message);
					setError(message.message);
					setIsSearching(false);
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	// 검색 실행
	const handleSearch = useCallback(async () => {
		if (!query.trim() || modelStatus !== 'ready') return;

		setIsSearching(true);
		setError(null);

		try {
			// 쿼리 임베딩
			console.log('[App] Starting query embedding for:', query.trim());
			const queryVector = await modelService.embedQuery(query.trim());
			console.log('[App] Query embedding complete, vector length:', queryVector.length);

			// Extension에 벡터 전송하여 Orama 검색
			console.log('[App] Sending vectorSearch message to Extension');
			vscode.postMessage({
				type: 'vectorSearch',
				vector: queryVector
			});
		} catch (err) {
			console.error('[App] Search error:', err);
			setError('검색 중 오류 발생');
			setIsSearching(false);
		}
	}, [query, modelStatus]);

	// Enter 키로 검색
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSearch();
		}
	};

	// 파일 열기
	const handleResultClick = (result: SearchResult) => {
		vscode.postMessage({
			type: 'openFile',
			filePath: result.filePath,
			range: result.range
		});
	};

	// 파일명 추출
	const getFileName = (filePath: string): string => {
		return filePath.split('/').pop() || filePath;
	};

	return (
		<div className="search-container">
			{/* 모델 로딩 상태 */}
			{modelStatus === 'loading' && (
				<div className="model-loading">
					<div className="loading-text">모델 로딩 중... {Math.round(loadProgress)}%</div>
					<div className="progress-bar">
						<div className="progress-fill" style={{ width: `${loadProgress}%` }} />
					</div>
				</div>
			)}

			{modelStatus === 'error' && (
				<div className="error-message">모델 로딩 실패. 페이지를 새로고침해주세요.</div>
			)}

			{modelStatus === 'ready' && (
				<>
					<div className="search-input-wrapper">
						<input
							type="text"
							className="search-input"
							placeholder="시맨틱 검색..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
						/>
						<button
							className="search-button"
							onClick={handleSearch}
							disabled={isSearching || !query.trim()}
						>
							{isSearching ? '...' : '검색'}
						</button>
					</div>

					{error && (
						<div className="error-message">{error}</div>
					)}

					<div className="results-container">
						{results.length === 0 && !isSearching && query && (
							<div className="no-results">검색 결과가 없습니다.</div>
						)}

						{results.map((result, index) => (
							<div
								key={`${result.filePath}-${index}`}
								className="result-item"
								onClick={() => handleResultClick(result)}
							>
								<div className="result-header">
									<span className="result-filename">{getFileName(result.filePath)}</span>
									<span className="result-score">
										{(result.score * 100).toFixed(0)}%
									</span>
								</div>
								<div className="result-snippet">
									{result.snippet.slice(0, 150)}
									{result.snippet.length > 150 ? '...' : ''}
								</div>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
