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

/**
 * Execute search logic - extracted for reuse with progress tracking
 */
export async function executeSearch({ query, isRegex, filePattern, context, maxResults }: SearchArgs): Promise<string> {
	console.log('[searchTool] executing', { query, isRegex, filePattern, context, maxResults });

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return "Error: No workspace open.";
	}

	const matches: string[] = [];
	const MAX_RESULTS = maxResults ?? 3;
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
		console.error('[searchTool] failed:', e);
		return `Error: Search failed - ${e}`;
	}

	if (matches.length === 0) {
		return `No results found for "${query}".`;
	}

	return `Found ${matches.length} files with matches:\n\n` + matches.join('\n\n');
}
