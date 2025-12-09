/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const watch = process.argv.includes('--watch');

/**
 * Webview 번들링 설정
 */
const webviewConfig = {
	entryPoints: [path.join(__dirname, 'src', 'webview', 'main.ts')],
	bundle: true,
	outfile: path.join(__dirname, 'out', 'webview', 'main.js'),
	platform: 'browser',
	target: 'es2020',
	format: 'iife',
	sourcemap: true,
	minify: false,
	external: [],
};

async function build() {
	try {
		if (watch) {
			const ctx = await esbuild.context(webviewConfig);
			await ctx.watch();
			console.log('Watching for changes...');
		} else {
			await esbuild.build(webviewConfig);
			console.log('Build complete');
		}
	} catch (error) {
		console.error('Build failed:', error);
		process.exit(1);
	}
}

build();
