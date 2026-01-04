/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Gitbbon Release Script
 *
 * 이 스크립트는 GitHub Actions를 통한 릴리스 워크플로우를 트리거합니다.
 *
 * 사용법:
 *   npm run release      - 정식 릴리스 (태그 푸시 → GitHub Actions 빌드)
 *   npm run pre-release  - 테스트 릴리스 (workflow_dispatch → Pre-release)
 */

import { execSync } from 'child_process';
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

/**
 * @param {string} message
 * @param {string} [color]
 */
function log(message, color = colors.reset) {
	console.log(`${color}${message}${colors.reset}`);
}

/**
 * @param {string} step
 * @param {string} message
 */
function logStep(step, message) {
	log(`\n${colors.bold}[${step}]${colors.reset} ${message}`, colors.cyan);
}

/**
 * @param {string} command
 * @param {{ silent?: boolean; ignoreError?: boolean }} [options]
 * @returns {string}
 */
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

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
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

/**
 * @returns {string}
 */
function getCurrentVersion() {
	const packageJsonPath = path.join(ROOT_DIR, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	return packageJson.version;
}

/**
 * @param {string} newVersion
 */
function updatePackageVersion(newVersion) {
	const packageJsonPath = path.join(ROOT_DIR, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	packageJson.version = newVersion;
	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

/**
 * @param {string} version
 * @returns {boolean}
 */
function validateVersion(version) {
	const semverRegex = /^\d+\.\d+\.\d+$/;
	return semverRegex.test(version);
}

/**
 * @param {string} currentVersion
 * @returns {string}
 */
function getSuggestedVersion(currentVersion) {
	const parts = currentVersion.split('.').map(Number);
	// Bump patch version by default
	parts[2] = parts[2] + 1;
	return parts.join('.');
}

/**
 * Check if gh CLI is available
 * @returns {boolean}
 */
function checkGhCli() {
	try {
		exec('gh --version', { silent: true });
		return true;
	} catch {
		return false;
	}
}

/**
 * 정식 릴리스: 버전 업데이트 → 태그 생성 → 푸시 → GitHub Actions 빌드
 */
async function release() {
	log('\n🚀 Gitbbon Release Script', colors.bold + colors.blue);
	log('='.repeat(50), colors.blue);
	log('GitHub Actions가 빌드를 수행합니다.', colors.yellow);

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
	logStep('1/4', 'Generating CHANGELOG from git commits...');
	try {
		exec(`npx standard-version --release-as ${newVersion} --skip.commit --skip.tag`, { silent: false });
	} catch (error) {
		log('Failed to generate CHANGELOG. Make sure you have conventional commits.', colors.red);
		process.exit(1);
	}

	// Read generated changelog for this version
	const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
	let changelogEntry = `Release ${newVersion}`;
	if (fs.existsSync(changelogPath)) {
		const changelog = fs.readFileSync(changelogPath, 'utf8');
		const versionMatch = changelog.match(new RegExp(`## \\[${newVersion}\\][\\s\\S]*?(?=\\n## |$)`));
		changelogEntry = versionMatch ? versionMatch[0] : changelogEntry;
	}

	// Step 4: Confirm
	log('\n' + '='.repeat(50), colors.yellow);
	log('Release Summary:', colors.bold);
	log(`  Version: ${currentVersion} → ${newVersion}`);
	log(`  Mode: 정식 릴리스 (GitHub Actions 빌드)`);
	log(`  Changelog:\n${changelogEntry}`);
	log('='.repeat(50), colors.yellow);

	const confirm = await prompt('\nProceed with release? (y/N): ');
	if (confirm.toLowerCase() !== 'y') {
		log('Release cancelled.', colors.yellow);
		process.exit(0);
	}

	try {
		// Step 5: Update package.json
		logStep('2/4', 'Updating package.json...');
		updatePackageVersion(newVersion);

		// Step 6: Git commit and tag
		logStep('3/4', 'Creating git commit and tag...');
		exec(`git add package.json CHANGELOG.md`);
		exec(`git commit -m "chore: Release v${newVersion}"`);
		exec(`git tag v${newVersion}`);

		// Step 7: Push to GitHub
		logStep('4/4', 'Pushing to GitHub (triggers GitHub Actions build)...');
		exec('git push origin main');
		exec('git push origin --tags');

		log('\n' + '='.repeat(50), colors.green);
		log('🎉 Release triggered successfully!', colors.bold + colors.green);
		log(`   Version: v${newVersion}`, colors.green);
		log('', colors.green);
		log('📦 GitHub Actions에서 빌드가 진행됩니다:', colors.cyan);
		log('   https://github.com/gitbbon-forest/gitbbon-note-desktop/actions', colors.cyan);
		log('='.repeat(50), colors.green);

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log(`\n❌ Release failed: ${errorMessage}`, colors.red);
		log('\nYou may need to manually revert changes:', colors.yellow);
		log('  git reset HEAD~1', colors.yellow);
		log(`  git tag -d v${newVersion}`, colors.yellow);
		process.exit(1);
	}
}

/**
 * Get next beta version based on existing tags
 * @param {string} baseVersion
 * @returns {string}
 */
function getNextBetaVersion(baseVersion) {
	try {
		// Get existing beta tags for this version
		const tags = exec(`git tag -l "v${baseVersion}-beta.*"`, { silent: true }).trim();
		if (!tags) {
			return `${baseVersion}-beta.1`;
		}

		// Find the highest beta number
		const betaNumbers = tags.split('\n')
			.map(tag => {
				const match = tag.match(/-beta\.(\d+)$/);
				return match ? parseInt(match[1], 10) : 0;
			})
			.filter(n => n > 0);

		const maxBeta = betaNumbers.length > 0 ? Math.max(...betaNumbers) : 0;
		return `${baseVersion}-beta.${maxBeta + 1}`;
	} catch {
		return `${baseVersion}-beta.1`;
	}
}

/**
 * Pre-release: 베타 태그 생성 후 GitHub Actions 빌드 트리거
 */
async function preRelease() {
	log('\n🧪 Gitbbon Pre-Release Script', colors.bold + colors.blue);
	log('='.repeat(50), colors.blue);
	log('테스트용 Pre-release 빌드를 생성합니다.', colors.yellow);
	log('(자동 업데이트 대상에서 제외됩니다)', colors.yellow);

	// Get current version and next beta version
	const currentVersion = getCurrentVersion();
	const betaVersion = getNextBetaVersion(currentVersion);

	log(`\nCurrent version: ${colors.bold}${currentVersion}${colors.reset}`);
	log(`Beta version: ${colors.bold}v${betaVersion}${colors.reset}`);

	// Confirm
	const confirm = await prompt('\nCreate pre-release build? (y/N): ');
	if (confirm.toLowerCase() !== 'y') {
		log('Pre-release cancelled.', colors.yellow);
		process.exit(0);
	}

	try {
		// Step 1: Create beta tag (no version change in package.json)
		logStep('1/2', `Creating beta tag v${betaVersion}...`);
		exec(`git tag v${betaVersion}`);

		// Step 2: Push tag to GitHub
		logStep('2/2', 'Pushing tag to GitHub (triggers GitHub Actions build)...');
		exec('git push origin --tags');

		log('\n' + '='.repeat(50), colors.green);
		log('🧪 Pre-release triggered successfully!', colors.bold + colors.green);
		log(`   Version: v${betaVersion}`, colors.green);
		log('', colors.green);
		log('📦 GitHub Actions에서 빌드가 진행됩니다:', colors.cyan);
		log('   https://github.com/gitbbon-forest/gitbbon-note-desktop/actions', colors.cyan);
		log('', colors.yellow);
		log('⚠️  빌드 완료 후 Releases 탭에서 "Pre-release"로 표시됩니다.', colors.yellow);
		log('='.repeat(50), colors.green);

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log(`\n❌ Pre-release failed: ${errorMessage}`, colors.red);
		log('\nYou may need to manually delete the tag:', colors.yellow);
		log(`  git tag -d v${betaVersion}`, colors.yellow);
		process.exit(1);
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const isPreRelease = args.includes('--pre') || args.includes('--prerelease');

if (isPreRelease) {
	preRelease().catch(console.error);
} else {
	release().catch(console.error);
}

