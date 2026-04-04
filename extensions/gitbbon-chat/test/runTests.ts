import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main() {
  // [debug:#113] 테스트 경로 설정
  // __dirname = out/, 따라서 ../ 로 extensionDevelopmentPath = extensions/gitbbon-chat/
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  // 임시 워크스페이스 생성: 테스트마다 깨끗한 상태로 시작
  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbbon-test-'));
  console.log('[debug:#113] extensionDevelopmentPath:', extensionDevelopmentPath);
  console.log('[debug:#113] extensionTestsPath:', extensionTestsPath);
  console.log('[debug:#113] tmpWorkspace:', tmpWorkspace);

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    // --disable-extensions 는 gitbbon-chat 자신도 비활성화하므로 제거
    // 임시 워크스페이스를 마지막 인자로 전달 (VS Code가 해당 폴더를 열도록)
    launchArgs: ['--disable-gpu', tmpWorkspace]
  });
}

main().catch(err => {
  console.error('테스트 실행 실패:', err);
  process.exit(1);
});
