import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import './SelectionSimilarArticles.css';

export interface SimilarArticle {
	title: string;
	path: string;
	score: number;
}

interface SelectionSimilarArticlesProps {
	articles: SimilarArticle[];
	onArticleClick: (path: string) => void;
	visible: boolean;
}

/**
 * gitbbon custom: 텍스트 선택 시 Milkdown 툴바 위에 표시되는 비슷한 글 목록
 * MutationObserver로 .milkdown-toolbar를 찾고, 그 부모에 Portal로 렌더링
 */
export const SelectionSimilarArticles: React.FC<SelectionSimilarArticlesProps> = ({
	articles,
	onArticleClick,
	visible
}) => {
	const [toolbarElement, setToolbarElement] = useState<HTMLElement | null>(null);
	const observerRef = useRef<MutationObserver | null>(null);

	useEffect(() => {
		// 툴바 요소 찾기
		const findToolbar = () => {
			const toolbar = document.querySelector('.milkdown-toolbar') as HTMLElement;
			if (toolbar) {
				// console.log('[gitbbon-editor][SelectionSimilar] Toolbar found:', toolbar);
				setToolbarElement(toolbar);
			} else {
				setToolbarElement(null);
			}
		};

		// 초기 검색
		findToolbar();

		// MutationObserver로 DOM 변경 감시
		observerRef.current = new MutationObserver(() => {
			findToolbar();
		});

		observerRef.current.observe(document.body, {
			childList: true,
			subtree: true
		});

		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
			}
		};
	}, []);

	// 툴바가 없거나 visible이 false이거나 articles가 없으면 렌더링하지 않음
	if (!toolbarElement || !visible || articles.length === 0) {
		return null;
	}

	// getComputedStyle을 사용하여 툴바가 실제로 보이는지 확인
	const toolbarStyle = window.getComputedStyle(toolbarElement);
	if (toolbarStyle.display === 'none') {
		return null;
	}

	// 툴바 위치 계산
	const toolbarRect = toolbarElement.getBoundingClientRect();

	// 기사 갯수에 따른 예상 높이 계산 (항목당 약 28px + 패딩)
	const estimatedHeight = articles.length * 28 + 8;

	// Fixed 포지셔닝으로 툴바 바로 위에 표시
	const relatedArticlesContent = (
		<div
			className="selection-similar-articles"
			data-gitbbon-related="true"
			style={{
				position: 'fixed',
				top: `${toolbarRect.top - estimatedHeight - 10}px`,
				left: `${toolbarRect.left}px`,
				width: `${toolbarRect.width}px`,
				zIndex: 10001
			}}
		>
			<ul className="selection-similar-list">
				{articles.slice(0, 3).map((article, index) => (
					<li
						key={`selection-${article.path}-${index}`}
						className="selection-similar-item"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onArticleClick(article.path);
						}}
						onMouseDown={(e) => {
							// 툴바가 닫히는 것 방지
							e.preventDefault();
						}}
						title={article.title}
					>
						<span className="selection-similar-title">{article.title}</span>
					</li>
				))}
			</ul>
		</div>
	);

	// body에 Portal로 렌더링 (fixed 포지셔닝)
	return createPortal(relatedArticlesContent, document.body);
};
