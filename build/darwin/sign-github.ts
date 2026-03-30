/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// gitbbon custom: GitHub Actions용 코드 서명 스크립트 (Azure Pipelines sign.ts 대신 사용)
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { sign, type SignOptions } from '@electron/osx-sign';

const root = path.dirname(path.dirname(import.meta.dirname));
const baseDir = path.dirname(import.meta.dirname);
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const helperAppBaseName = product.nameShort;
const gpuHelperAppName = helperAppBaseName + ' Helper (GPU).app';
const rendererHelperAppName = helperAppBaseName + ' Helper (Renderer).app';
const pluginHelperAppName = helperAppBaseName + ' Helper (Plugin).app';

function getElectronVersion(): string {
	const npmrc = fs.readFileSync(path.join(root, '.npmrc'), 'utf8');
	const target = /^target="(.*)"$/m.exec(npmrc)![1];
	return target;
}

function getEntitlementsForFile(filePath: string): string {
	if (filePath.includes(gpuHelperAppName)) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist');
	} else if (filePath.includes(rendererHelperAppName)) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist');
	} else if (filePath.includes(pluginHelperAppName)) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist');
	}
	return path.join(baseDir, 'azure-pipelines', 'darwin', 'app-entitlements.plist');
}

/**
 * GitHub Actions secrets에서 인증서를 임시 키체인에 설치
 */
function setupKeychain(keychainPath: string, p12Path: string, p12Password: string): string {
	const keychainPassword = Math.random().toString(36).slice(2);

	execSync(`security create-keychain -p "${keychainPassword}" "${keychainPath}"`);
	execSync(`security set-keychain-settings -lut 21600 "${keychainPath}"`);
	execSync(`security unlock-keychain -p "${keychainPassword}" "${keychainPath}"`);

	execSync(`security import "${p12Path}" -k "${keychainPath}" -P "${p12Password}" -T /usr/bin/codesign -T /usr/bin/security`);
	execSync(`security set-key-partition-list -S apple-tool:,apple: -s -k "${keychainPassword}" "${keychainPath}"`);

	// 기본 키체인 검색 목록에 추가
	const currentList = execSync('security list-keychains -d user').toString().trim()
		.split('\n')
		.map(l => l.trim().replace(/^"|"$/g, ''));
	execSync(`security list-keychains -d user -s "${keychainPath}" ${currentList.join(' ')}`);

	return keychainPath;
}

async function retrySignOnKeychainError<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isKeychainError = errorMessage.includes('The specified item could not be found in the keychain.');

			if (!isKeychainError || attempt === maxRetries) {
				throw error;
			}

			const delay = 1000 * Math.pow(2, attempt - 1);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

async function notarize(appPath: string, arch: string): Promise<void> {
	const appleId = process.env['APPLE_ID'];
	const applePassword = process.env['APPLE_APP_SPECIFIC_PASSWORD'];
	const teamId = process.env['APPLE_TEAM_ID'];

	if (!appleId || !applePassword || !teamId) {
		return;
	}

	const zipPath = `/tmp/gitbbon-notarize-${arch}.zip`;
	execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`);

	execSync(
		`xcrun notarytool submit "${zipPath}" ` +
		`--apple-id "${appleId}" ` +
		`--password "${applePassword}" ` +
		`--team-id "${teamId}" ` +
		`--wait`,
		{ stdio: 'inherit' }
	);

	execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });

	fs.unlinkSync(zipPath);
}

async function main(buildDir?: string): Promise<void> {
	const arch = process.env['VSCODE_ARCH'];
	const cscLink = process.env['CSC_LINK'];           // base64 인코딩된 .p12
	const cscPassword = process.env['CSC_KEY_PASSWORD'];

	if (!buildDir) {
		throw new Error('빌드 디렉토리가 지정되지 않았습니다 (첫 번째 인자)');
	}

	if (!arch) {
		throw new Error('VSCODE_ARCH 환경변수가 설정되지 않았습니다');
	}

	const keychainPath = `/tmp/gitbbon-build-${arch}.keychain-db`;
	let tempP12Path: string | undefined;

	try {
		if (cscLink && cscPassword) {
			// GitHub Actions secrets에서 인증서 설치
			tempP12Path = `/tmp/cert-${arch}.p12`;
			fs.writeFileSync(tempP12Path, Buffer.from(cscLink, 'base64'));
			setupKeychain(keychainPath, tempP12Path, cscPassword);
		} else {
		}

		const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
		const appName = product.nameLong + '.app';
		const appPath = path.join(appRoot, appName);


		const appOpts: SignOptions = {
			app: appPath,
			platform: 'darwin',
			optionsForFile: (filePath) => ({
				entitlements: getEntitlementsForFile(filePath),
				hardenedRuntime: true,
			}),
			preAutoEntitlements: false,
			preEmbedProvisioningProfile: false,
			...(cscLink && cscPassword ? { keychain: keychainPath } : {}),
			version: getElectronVersion(),
		};

		await retrySignOnKeychainError(() => sign(appOpts));

		// 공증 (APPLE_ID 등이 설정된 경우에만)
		await notarize(appPath, arch);

	} finally {
		// 임시 파일 정리
		if (tempP12Path && fs.existsSync(tempP12Path)) {
			fs.unlinkSync(tempP12Path);
		}
		// 키체인 삭제
		try {
			execSync(`security delete-keychain "${keychainPath}"`, { stdio: 'ignore' });
		} catch {
			// 무시 (키체인이 없을 수도 있음)
		}
	}
}

if (import.meta.main) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
