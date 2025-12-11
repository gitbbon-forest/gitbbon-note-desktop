/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';

/**
 * Complete list of directories where npm should be executed to install node modules
 */
export const dirs = [
	'',
	'build',
	'build/vite',
	'extensions',
	'extensions/git',
	'extensions/git-base',
	'extensions/github',
	'extensions/github-authentication',
	'extensions/json-language-features',
	'extensions/json-language-features/server',
	'extensions/markdown-language-features',
	'extensions/markdown-math',
	'extensions/media-preview',
	'extensions/merge-conflict',
	'extensions/microsoft-authentication',
	'extensions/search-result',
	'extensions/simple-browser',
	'extensions/terminal-suggest',
	'remote',
	'remote/web',
	'test/automation',
	'test/integration/browser',
	'test/monaco',
	'test/smoke',
	'test/mcp',
	'.vscode/extensions/vscode-selfhost-import-aid',
	'.vscode/extensions/vscode-selfhost-test-provider',
];

if (existsSync(`${import.meta.dirname}/../../.build/distro/npm`)) {
	dirs.push('.build/distro/npm');
	dirs.push('.build/distro/npm/remote');
	dirs.push('.build/distro/npm/remote/web');
}
