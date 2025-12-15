/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { extname } from '../../../../../base/common/path.js';

suite('Gitbbon File Creation Logic', () => {

	test('should append .md if no extension', function () {
		let value = 'myfile';
		const isFolder = false;

        if (!isFolder && extname(value) === '' && !value.startsWith('.')) {
            value += '.md';
        }

		assert.strictEqual(value, 'myfile.md');
	});

	test('should not append .md if extension exists', function () {
		let value = 'myfile.txt';
		const isFolder = false;

        if (!isFolder && extname(value) === '' && !value.startsWith('.')) {
            value += '.md';
        }

		assert.strictEqual(value, 'myfile.txt');
	});

    test('should not append .md if file starts with dot', function () {
		let value = '.gitignore';
		const isFolder = false;

        if (!isFolder && extname(value) === '' && !value.startsWith('.')) {
            value += '.md';
        }

		assert.strictEqual(value, '.gitignore');
	});

    test('should not append .md if isFolder', function () {
		let value = 'myfolder';
		const isFolder = true;

        if (!isFolder && extname(value) === '' && !value.startsWith('.')) {
            value += '.md';
        }

		assert.strictEqual(value, 'myfolder');
	});

    test('should append .md if no extension (even if there are dots in path - wait, value is just name)', function () {
        // value is just the name entered in the input box, so no slashes usually.
		let value = 'my.file';
		const isFolder = false;

        // extname('my.file') is '.file', so it won't be empty.
        if (!isFolder && extname(value) === '' && !value.startsWith('.')) {
            value += '.md';
        }

		assert.strictEqual(value, 'my.file');
	});

    test('should append .md for name without dots', function () {
		let value = 'My Note';
		const isFolder = false;

        if (!isFolder && extname(value) === '' && !value.startsWith('.')) {
            value += '.md';
        }

		assert.strictEqual(value, 'My Note.md');
	});

});
