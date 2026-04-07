/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import gulp from 'gulp';
import * as util from './lib/util.ts';
import * as date from './lib/date.ts';
import * as task from './lib/task.ts';
import * as compilation from './lib/compilation.ts';

function makeCompileBuildTask(disableMangle: boolean) {
	return task.series(
		util.rimraf('out-build'),
		date.writeISODate('out-build'),
		compilation.compileApiProposalNamesTask,
		// gitbbon custom: esbuild 트랜스파일 활성화로 릴리즈 빌드 속도 단축 (Issue #144)
		compilation.compileTask('src', 'out-build', true, { disableMangle, esbuild: true })
	);
}

// Local/PR compile, including nls and inline sources in sourcemaps, minification, no mangling
export const compileBuildWithoutManglingTask = task.define('compile-build-without-mangling', makeCompileBuildTask(true));
gulp.task(compileBuildWithoutManglingTask);

// CI compile, including nls and inline sources in sourcemaps, mangling, minification, for build
export const compileBuildWithManglingTask = task.define('compile-build-with-mangling', makeCompileBuildTask(false));
gulp.task(compileBuildWithManglingTask);
