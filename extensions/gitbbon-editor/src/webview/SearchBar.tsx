import React, { useEffect, useRef, useCallback, useState } from 'react';
import './SearchBar.css';

interface SearchBarProps {
	searchQuery: string;
	onSearchChange: (query: string, replace?: string) => void;
	onFindNext: () => void;
	onFindPrev: () => void;
	onClose: () => void;
	matchCount: number;
	currentMatch: number;
	// gitbbon custom: Replace functionality
	replaceText: string;
	onReplaceChange: (replace: string) => void;
	onReplaceNext: () => void;
	onReplaceAll: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
	searchQuery,
	onSearchChange,
	onFindNext,
	onFindPrev,
	onClose,
	matchCount,
	currentMatch,
	replaceText,
	onReplaceChange,
	onReplaceNext,
	onReplaceAll,
}) => {
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [showReplace, setShowReplace] = useState(false);

	// 열릴 때 자동 포커스
	useEffect(() => {
		searchInputRef.current?.focus();
		searchInputRef.current?.select();
	}, []);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) {
				onFindPrev();
			} else {
				onFindNext();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}, [onFindNext, onFindPrev, onClose]);

	const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		onSearchChange(e.target.value, replaceText);
	}, [onSearchChange, replaceText]);

	const handleReplaceInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		onReplaceChange(e.target.value);
	}, [onReplaceChange]);

	const toggleReplace = useCallback(() => {
		setShowReplace(prev => !prev);
	}, []);

	return (
		<div className="search-bar">
			<div className="search-bar-wrapper">
				{/* 토글 버튼 */}
				<button
					className="search-btn search-toggle-btn"
					onClick={toggleReplace}
					title={showReplace ? 'Hide Replace' : 'Show Replace'}
				>
					{showReplace ? '▼' : '▶'}
				</button>

				<div className="search-bar-fields">
					{/* 찾기 행 */}
					<div className="search-bar-row">
						<input
							ref={searchInputRef}
							type="text"
							className="search-input"
							value={searchQuery}
							onChange={handleSearchInputChange}
							onKeyDown={handleKeyDown}
							placeholder="Find..."
						/>
						<span className="search-match-count">
							{matchCount > 0 ? `${currentMatch}/${matchCount}` : '0'}
						</span>
						<button
							className="search-btn"
							onClick={onFindPrev}
							title="Previous (Shift+Enter)"
							disabled={matchCount === 0}
						>
							↑
						</button>
						<button
							className="search-btn"
							onClick={onFindNext}
							title="Next (Enter)"
							disabled={matchCount === 0}
						>
							↓
						</button>
						<button
							className="search-btn search-close-btn"
							onClick={onClose}
							title="Close (Esc)"
						>
							×
						</button>
					</div>

					{/* 바꾸기 행 */}
					{showReplace && (
						<div className="search-bar-row replace-row">
							<input
								type="text"
								className="search-input replace-input"
								value={replaceText}
								onChange={handleReplaceInputChange}
								onKeyDown={handleKeyDown}
								placeholder="Replace..."
							/>
							<button
								className="search-btn replace-btn"
								onClick={onReplaceNext}
								title="Replace"
								disabled={matchCount === 0}
							>
								Replace
							</button>
							<button
								className="search-btn replace-btn"
								onClick={onReplaceAll}
								title="Replace All"
								disabled={matchCount === 0}
							>
								All
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
