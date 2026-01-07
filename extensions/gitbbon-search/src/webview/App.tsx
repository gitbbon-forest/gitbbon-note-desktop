/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';

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

	// VS Code 메시지 수신
	useEffect(() => {
		// Extension에 UI 준비 완료 알림
		vscode.postMessage({ type: 'uiReady' });

		const handleMessage = async (event: MessageEvent) => {
			const message = event.data;
			console.log('[App] Received message from Extension:', message.type);

			switch (message.type) {
				case 'modelStatus':
					// Hidden Webview의 모델 상태 수신
					if (message.status === 'ready') {
						setModelStatus('ready');
						setLoadProgress(100);
						console.log('[App] Model is ready (loaded in Hidden Webview)');
					} else if (message.status === 'loading') {
						setModelStatus('loading');
						setLoadProgress(message.progress || 0);
					} else if (message.status === 'error') {
						setModelStatus('error');
						setError('모델 로딩 실패');
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

		// Extension에 검색 요청 (Extension이 Hidden Webview를 통해 임베딩 후 검색)
		console.log('[App] Sending search request to Extension:', query.trim());
		vscode.postMessage({
			type: 'search',
			query: query.trim()
		});
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
				<div className="error-message">모델 로딩 실패. 앱을 재시작해주세요.</div>
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
