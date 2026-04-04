import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

/** OS별 gitbbon 실행파일 경로 (.build/electron/ 기준) */
function getGitbbonExecutablePath(): string {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const buildElectron = path.join(repoRoot, '.build', 'electron');

  switch (process.platform) {
    case 'darwin':
      return path.join(buildElectron, 'Gitbbon.app', 'Contents', 'MacOS', 'Electron');
    case 'win32':
      return path.join(buildElectron, 'Gitbbon.exe');
    default: // linux
      return path.join(buildElectron, 'gitbbon');
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const gitbbonExecutablePath = getGitbbonExecutablePath();

  // 임시 워크스페이스 생성
  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbbon-test-'));

  console.log('[debug:test:gitbbon] repoRoot:', repoRoot);
  console.log('[debug:test:gitbbon] gitbbonExecutablePath:', gitbbonExecutablePath);
  console.log('[debug:test:gitbbon] extensionDevelopmentPath:', extensionDevelopmentPath);
  console.log('[debug:test:gitbbon] extensionTestsPath:', extensionTestsPath);
  console.log('[debug:test:gitbbon] tmpWorkspace:', tmpWorkspace);

  // VSCODE_DEV=1, NODE_ENV=development: npm run start와 동일하게 out/ 소스를 로드
  process.env.VSCODE_DEV = '1';
  process.env.NODE_ENV = 'development';
  // gitbbon이 리포 루트의 out/를 소스로 찾도록 APP_ROOT 설정
  process.env.VSCODE_DEV_EXTENSIONS_PATH = path.join(repoRoot, 'extensions');

  await runTests({
    vscodeExecutablePath: gitbbonExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-gpu', tmpWorkspace],
  });
}

main().catch(err => {
  console.error('테스트 실행 실패 (gitbbon):', err);
  process.exit(1);
});
