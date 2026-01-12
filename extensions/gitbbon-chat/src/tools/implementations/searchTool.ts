import * as vscode from 'vscode';

// findTextInFiles API definition (runtime check)
interface TextSearchMatch {
	uri: vscode.Uri;
	ranges: vscode.Range[];
	preview: { text: string };
}

type FindTextInFilesFunc = (
	query: { pattern: string; isRegExp?: boolean; isCaseSensitive?: boolean; isWordMatch?: boolean },
	options: { include?: vscode.GlobPattern; exclude?: string },
	callback: (result: TextSearchMatch) => void
) => Thenable<void>;

interface SearchArgs {
	query: string;
	isRegex?: boolean;
	filePattern?: string;
	context?: number;
	maxResults?: number;
}

// Interface for Gitbbon Search API (Duck typing)
interface SearchResult {
	filePath: string;
	range: [number, number];
	score: number;
	snippet: string;
}

interface GitbbonSearchAPI {
	search(query: string, limit?: number): Promise<SearchResult[]>;
}

/**
 * Execute search logic - extracted for reuse with progress tracking
 */
export async function executeSearch({ query, isRegex, filePattern, context, maxResults }: SearchArgs): Promise<string> {
	console.log('[gitbbon-chat][searchTool] Executing search:', query, { isRegex, filePattern });

	const MAX_RESULTS = maxResults ?? 5;

	// 1. Try Semantic Search (Orama) (if not regex)
	if (!isRegex) {
		try {
			const extension = vscode.extensions.getExtension<GitbbonSearchAPI>('gitbbon.gitbbon-search');
			console.log('[gitbbon-chat][searchTool] Searching for extension "gitbbon.gitbbon-search". Found:', !!extension);

			if (extension) {
				if (!extension.isActive) {
					await extension.activate();
				}

				const api = extension.exports;
				if (api && typeof api.search === 'function') {
					console.log('[gitbbon-chat][searchTool] Using Semantic Search (Orama)...');
					const results = await api.search(query, MAX_RESULTS);

					if (results && results.length > 0) {
						return `Found ${results.length} semantic matches:\n\n` +
							results.map(r => {
								const relativePath = vscode.workspace.asRelativePath(r.filePath);
								// Add score indication for debugging/transparency if needed, effectively optional
								return `[${relativePath}] (Score: ${r.score.toFixed(2)})\n${r.snippet}`;
							}).join('\n\n');
					}
					console.log('[gitbbon-chat][searchTool] Semantic search (Orama) returned no results, falling back to ripgrep.');
				} else {
					console.log('[gitbbon-chat][searchTool] Gitbbon Search API not found, skipping Orama.');
				}
			} else {
				console.log('[gitbbon-chat][searchTool] Gitbbon Search extension not found, skipping Orama.');
			}
		} catch (e) {
			console.warn('[gitbbon-chat][searchTool] Semantic search (Orama) failed, falling back:', e);
		}
	}

	// 2. Fallback to Ripgrep (findTextInFiles)
	console.log('[gitbbon-chat][searchTool] Using Ripgrep fallback...');

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return "Error: No workspace open.";
	}

	const matches: string[] = [];
	const CONTEXT_LENGTH = context ?? 100;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const workspaceAny = vscode.workspace as any;

	// Map to collect matches per file
	const fileMatches = new Map<string, { uri: vscode.Uri; lines: { lineNum: number; text: string }[] }>();

	try {
		if (typeof workspaceAny.findTextInFiles !== 'function') {
			return "Error: VS Code 'findTextInFiles' API is not available.";
		}

		const findTextInFiles: FindTextInFilesFunc = workspaceAny.findTextInFiles.bind(vscode.workspace);

		await findTextInFiles(
			{
				pattern: query,
				isRegExp: !!isRegex,
				isCaseSensitive: false,
				isWordMatch: false,
			},
			{
				include: filePattern
					? new vscode.RelativePattern(workspaceFolders[0], filePattern)
					: undefined,
				exclude: '**/{node_modules,.git,dist,out}/**',
			},
			(result: TextSearchMatch) => {
				if (matches.length >= MAX_RESULTS) return;

				const relativePath = vscode.workspace.asRelativePath(result.uri);

				if (!fileMatches.has(relativePath)) {
					fileMatches.set(relativePath, { uri: result.uri, lines: [] });
				}

				const fileData = fileMatches.get(relativePath)!;

				for (const range of result.ranges) {
					const lineNum = range.start.line + 1;
					const previewText = result.preview.text.trim().slice(0, CONTEXT_LENGTH * 2);
					fileData.lines.push({ lineNum, text: previewText });
				}
			}
		);

		// Format results
		for (const [relativePath, data] of fileMatches) {
			if (matches.length >= MAX_RESULTS) break;

			const linesInfo = data.lines
				.slice(0, 5) // Max 5 matches per file
				.map(l => `  (Line ${l.lineNum}): ${l.text}`)
				.join('\n');

			matches.push(`[${relativePath}]\n${linesInfo}`);
		}

	} catch (e) {
		console.error('[gitbbon-chat][searchTool] Search failed:', e);
		return `Error: Search failed - ${e}`;
	}

	if (matches.length === 0) {
		return `No results found for "${query}".`;
	}

	return `Found ${matches.length} files with matches (Exact/grep):\n\n` + matches.join('\n\n');
}
