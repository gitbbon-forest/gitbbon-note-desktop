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

async function setupWorktree() {
	const WORKTREE_DIR = path.join(ROOT_DIR, '..', 'git-note-build');

	logStep('WORKTREE', 'Setting up build worktree...');

	// Check if worktree already exists
	if (fs.existsSync(WORKTREE_DIR)) {
		log('Worktree already exists, syncing with local repository...', colors.yellow);
		// Fetch latest from local main branch
		exec(`cd "${WORKTREE_DIR}" && git fetch "${ROOT_DIR}" main:main`, { silent: false });
		exec(`cd "${WORKTREE_DIR}" && git reset --hard main`, { silent: false });
	} else {
		log('Creating new worktree...', colors.yellow);
		exec(`git worktree add "${WORKTREE_DIR}"`, { silent: false });

		// Install dependencies in worktree
		log('Installing dependencies in worktree (this may take a while)...', colors.yellow);
		exec(`cd "${WORKTREE_DIR}" && npm ci`, { silent: false });
	}

	return WORKTREE_DIR;
}

async function runBuild(platform, worktreeDir) {
	logStep('BUILD', `Building ${platform} in worktree...`);
	return new Promise((resolve, reject) => {
		const child = spawn('npm', ['run', 'gulp', `vscode-${platform}-min`], {
			cwd: worktreeDir,
			shell: true,
			stdio: 'inherit',
			env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=16384', GH_TOKEN: process.env.GH_TOKEN }
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

async function createGitHubRelease(version, changelogEntry, worktreeDir) {
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
		const artifactPath = path.join(worktreeDir, artifact);
		if (fs.existsSync(artifactPath)) {
			const basename = path.basename(artifact);
			if (artifact.includes('linux')) {
				const tarPath = path.join(worktreeDir, '..', `${basename}.tar.gz`);
				exec(`tar -czf "${tarPath}" -C "${artifactPath}" .`);
				releaseFiles.push(tarPath);
			} else {
				const zipPath = path.join(worktreeDir, '..', `${basename}.zip`);
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

	// Step 3: Run standard-version to generate CHANGELOG
	logStep('CHANGELOG', 'Generating CHANGELOG from git commits...');
	try {
		exec(`npx standard-version --release-as ${newVersion} --skip.commit --skip.tag`, { silent: false });
	} catch (error) {
		log('Failed to generate CHANGELOG. Make sure you have conventional commits.', colors.red);
		process.exit(1);
	}

	// Read generated changelog for this version
	const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
	const changelog = fs.readFileSync(changelogPath, 'utf8');
	const versionMatch = changelog.match(new RegExp(`## \\[${newVersion}\\][\\s\\S]*?(?=\\n## |$)`));
	const changelogEntry = versionMatch ? versionMatch[0] : `Release ${newVersion}`;

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
		// Step 5: Update package.json (CHANGELOG already updated by standard-version)
		logStep('1/6', 'Updating package.json...');
		updatePackageVersion(newVersion);

		// Step 6: Git commit and tag
		logStep('2/6', 'Creating git commit and tag...');
		exec(`git add package.json CHANGELOG.md`);
		exec(`git commit -m "chore: Release v${newVersion}"`);
		exec(`git tag v${newVersion}`);

		// Step 3: Confirm push to GitHub
		log('\n⚠️  Ready to push to GitHub:', colors.yellow);
		log(`  - Commit: chore: Release v${newVersion}`);
		log(`  - Tag: v${newVersion}`);
		const pushConfirm = await prompt('\nPush to GitHub? (y/N): ');
		if (pushConfirm.toLowerCase() !== 'y') {
			log('Push cancelled. Rolling back...', colors.yellow);
			exec(`git reset HEAD~1`);
			exec(`git tag -d v${newVersion}`);
			process.exit(0);
		}

		logStep('3/6', 'Pushing to GitHub...');
		exec('git push origin main');
		exec('git push origin --tags');

		// Step 4: Setup worktree for building
		const worktreeDir = await setupWorktree();

		// Step 5: Build macOS ARM64
		logStep('5/6', 'Building for macOS ARM64 in worktree...');
		await runBuild('darwin-arm64', worktreeDir);
		log('\n⚠️  Building ARM64 only for beta testing. Other platforms will be added later.', colors.yellow);

		// Step 6: Create GitHub Release
		logStep('6/6', 'Creating GitHub Release and uploading artifacts...');
		await createGitHubRelease(newVersion, changelogEntry, worktreeDir);

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
