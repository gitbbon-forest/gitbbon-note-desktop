#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

// ANSI colors
const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	red: '\x1b[31m',
	cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
	console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
	log(`\n${colors.bold}[${step}]${colors.reset} ${message}`, colors.cyan);
}

function exec(command, options = {}) {
	try {
		return execSync(command, {
			cwd: ROOT_DIR,
			encoding: 'utf8',
			stdio: options.silent ? 'pipe' : 'inherit',
			...options
		});
	} catch (error) {
		if (!options.ignoreError) {
			log(`Command failed: ${command}`, colors.red);
			throw error;
		}
		return '';
	}
}

function prompt(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

function getCurrentVersion() {
	const packageJsonPath = path.join(ROOT_DIR, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	return packageJson.version;
}

function updatePackageVersion(newVersion) {
	const packageJsonPath = path.join(ROOT_DIR, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	packageJson.version = newVersion;
	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

function updateChangelog(version, changes) {
	const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
	const date = new Date().toISOString().split('T')[0];

	let changelog = '';
	if (fs.existsSync(changelogPath)) {
		changelog = fs.readFileSync(changelogPath, 'utf8');
	} else {
		changelog = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
	}

	const newEntry = `\n## [${version}] - ${date}\n\n${changes}\n`;

	// Insert after the header
	const headerEnd = changelog.indexOf('\n\n') + 2;
	changelog = changelog.slice(0, headerEnd) + newEntry + changelog.slice(headerEnd);

	fs.writeFileSync(changelogPath, changelog);
}

function validateVersion(version) {
	const semverRegex = /^\d+\.\d+\.\d+$/;
	return semverRegex.test(version);
}

function getSuggestedVersion(currentVersion) {
	const parts = currentVersion.split('.').map(Number);
	// Bump patch version by default
	parts[2] = parts[2] + 1;
	return parts.join('.');
}

async function runBuild(platform) {
	logStep('BUILD', `Building ${platform}...`);
	return new Promise((resolve, reject) => {
		const child = spawn('npm', ['run', 'gulp', `vscode-${platform}-min`], {
			cwd: ROOT_DIR,
			shell: true,
			stdio: 'inherit',
			env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=16384' }
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Build failed for ${platform} with code ${code}`));
			}
		});
	});
}

async function createGitHubRelease(version, changelogEntry) {
	logStep('RELEASE', 'Creating GitHub Release...');

	const artifacts = [
		'../VSCode-darwin-x64',
		'../VSCode-darwin-arm64',
		'../VSCode-win32-x64',
		'../VSCode-linux-x64'
	];

	// Create zip/tar files
	const releaseFiles = [];

	for (const artifact of artifacts) {
		const artifactPath = path.join(ROOT_DIR, artifact);
		if (fs.existsSync(artifactPath)) {
			const basename = path.basename(artifact);
			if (artifact.includes('linux')) {
				const tarPath = path.join(ROOT_DIR, '..', `${basename}.tar.gz`);
				exec(`tar -czf "${tarPath}" -C "${artifactPath}" .`);
				releaseFiles.push(tarPath);
			} else {
				const zipPath = path.join(ROOT_DIR, '..', `${basename}.zip`);
				exec(`cd "${artifactPath}" && zip -r -y "${zipPath}" .`);
				releaseFiles.push(zipPath);
			}
		}
	}

	// Generate latest.yml files for each platform
	generateUpdateMetadata(version, releaseFiles);

	// Create GitHub release
	const tag = `v${version}`;
	const releaseFileArgs = releaseFiles.map(f => `"${f}"`).join(' ');
	const latestYmlFiles = [
		path.join(ROOT_DIR, '..', 'latest-mac.yml'),
		path.join(ROOT_DIR, '..', 'latest.yml'),
		path.join(ROOT_DIR, '..', 'latest-linux.yml')
	].filter(f => fs.existsSync(f)).map(f => `"${f}"`).join(' ');

	exec(`gh release create ${tag} ${releaseFileArgs} ${latestYmlFiles} --title "Release ${tag}" --notes "${changelogEntry.replace(/"/g, '\\"')}"`);

	log(`\n✅ GitHub Release ${tag} created successfully!`, colors.green);
}

function generateUpdateMetadata(version, releaseFiles) {
	const releaseDate = new Date().toISOString();

	for (const file of releaseFiles) {
		if (!fs.existsSync(file)) continue;

		const stats = fs.statSync(file);
		const sha512 = exec(`shasum -a 512 "${file}" | awk '{print $1}'`, { silent: true }).trim();
		const filename = path.basename(file);

		let platform = '';
		if (file.includes('darwin')) platform = 'mac';
		else if (file.includes('win32')) platform = '';
		else if (file.includes('linux')) platform = 'linux';

		const yamlContent = `version: ${version}
files:
  - url: ${filename}
    sha512: ${sha512}
    size: ${stats.size}
path: ${filename}
sha512: ${sha512}
releaseDate: '${releaseDate}'
`;

		const yamlPath = path.join(ROOT_DIR, '..', platform ? `latest-${platform}.yml` : 'latest.yml');
		fs.writeFileSync(yamlPath, yamlContent);
	}
}

async function main() {
	log('\n🚀 Gitbbon Release Script', colors.bold + colors.blue);
	log('='.repeat(40), colors.blue);

	// Step 1: Show current version and suggested version
	const currentVersion = getCurrentVersion();
	const suggestedVersion = getSuggestedVersion(currentVersion);
	log(`\nCurrent version: ${colors.bold}${currentVersion}${colors.reset}`);
	log(`Suggested version: ${colors.bold}${suggestedVersion}${colors.reset}`);

	// Step 2: Get new version (default to suggested if empty)
	const inputVersion = await prompt(`\nEnter new version [${suggestedVersion}]: `);
	const newVersion = inputVersion || suggestedVersion;

	if (!validateVersion(newVersion)) {
		log('Invalid version format. Please use semantic versioning (X.Y.Z)', colors.red);
		process.exit(1);
	}

	// Step 3: Get changelog entry
	log('\nEnter changelog entry (press Enter twice to finish):', colors.yellow);
	let changelogEntry = '';
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	changelogEntry = await new Promise((resolve) => {
		let lines = [];
		let emptyLineCount = 0;

		rl.on('line', (line) => {
			if (line === '') {
				emptyLineCount++;
				if (emptyLineCount >= 1 && lines.length > 0) {
					rl.close();
					resolve(lines.join('\n'));
				}
			} else {
				emptyLineCount = 0;
				lines.push(line.startsWith('- ') ? line : `- ${line}`);
			}
		});
	});

	if (!changelogEntry) {
		log('Changelog entry is required.', colors.red);
		process.exit(1);
	}

	// Step 4: Confirm
	log('\n' + '='.repeat(40), colors.yellow);
	log('Release Summary:', colors.bold);
	log(`  Version: ${currentVersion} → ${newVersion}`);
	log(`  Changelog:\n${changelogEntry}`);
	log('='.repeat(40), colors.yellow);

	const confirm = await prompt('\nProceed with release? (y/N): ');
	if (confirm.toLowerCase() !== 'y') {
		log('Release cancelled.', colors.yellow);
		process.exit(0);
	}

	try {
		// Step 5: Update files
		logStep('1/6', 'Updating package.json...');
		updatePackageVersion(newVersion);

		logStep('2/6', 'Updating CHANGELOG.md...');
		updateChangelog(newVersion, changelogEntry);

		// Step 6: Git commit and tag
		logStep('3/6', 'Creating git commit and tag...');
		exec(`git add package.json CHANGELOG.md`);
		exec(`git commit -m "chore: Release v${newVersion}"`);
		exec(`git tag v${newVersion}`);

		// Step 7: Build all platforms
		logStep('4/6', 'Building for all platforms (this may take a while)...');
		await runBuild('darwin-x64');
		await runBuild('darwin-arm64');
		await runBuild('win32-x64');
		await runBuild('linux-x64');

		// Step 8: Create GitHub Release
		logStep('5/6', 'Creating GitHub Release and uploading artifacts...');
		await createGitHubRelease(newVersion, changelogEntry);

		// Step 9: Push to remote
		logStep('6/6', 'Pushing to remote...');
		exec('git push origin main');
		exec('git push origin --tags');

		log('\n' + '='.repeat(40), colors.green);
		log('🎉 Release completed successfully!', colors.bold + colors.green);
		log(`   Version: v${newVersion}`, colors.green);
		log('='.repeat(40), colors.green);

	} catch (error) {
		log(`\n❌ Release failed: ${error.message}`, colors.red);
		log('\nYou may need to manually revert changes:', colors.yellow);
		log('  git reset HEAD~1', colors.yellow);
		log(`  git tag -d v${newVersion}`, colors.yellow);
		process.exit(1);
	}
}

main().catch(console.error);
