import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  // [debug:#113] 테스트 경로 설정
  // __dirname = out/, 따라서 ../ 로 extensionDevelopmentPath = extensions/gitbbon-chat/
  const extensionDevelopmentPath = path.resolve(__dirname, '../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  console.log('[debug:#113] extensionDevelopmentPath:', extensionDevelopmentPath);
  console.log('[debug:#113] extensionTestsPath:', extensionTestsPath);

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    // --disable-extensions 는 gitbbon-chat 자신도 비활성화하므로 제거
    launchArgs: ['--disable-gpu']
  });
}

main().catch(err => {
  console.error('테스트 실행 실패:', err);
  process.exit(1);
});
