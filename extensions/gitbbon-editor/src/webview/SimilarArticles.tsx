import React from 'react';
import './SimilarArticles.css';

export interface SimilarArticle {
	title: string;
	path: string;
	score: number;
}

interface SimilarArticlesProps {
	articles: SimilarArticle[];
	onArticleClick: (path: string) => void;
}

export const SimilarArticles: React.FC<SimilarArticlesProps> = ({ articles, onArticleClick }) => {
	if (articles.length === 0) {
		return null;
	}

	return (
		<div className="similar-articles">
			<div className="similar-articles-header">Similar Articles</div>
			<ul className="similar-articles-list">
				{articles.map((article) => (
					<li key={article.path} className="similar-article-item" onClick={() => onArticleClick(article.path)}>
						<span className="article-title">{article.title}</span>
						<span className="article-score">{Math.round(article.score * 100)}%</span>
					</li>
				))}
			</ul>
		</div>
	);
};
