import * as path from 'path';
import Mocha from 'mocha';
import * as fs from 'fs';

export async function run(): Promise<void> {
  // [debug:#113] Mocha 진입점 실행
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
  const testsRoot = path.resolve(__dirname, '.');

  console.log('[debug:#113] testsRoot:', testsRoot);

  // glob 패키지 없이 직접 파일 탐색
  const files = fs.readdirSync(testsRoot).filter(f => f.endsWith('.test.js'));
  console.log('[debug:#113] 발견된 테스트 파일:', files);

  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures}개 테스트 실패`));
      } else {
        resolve();
      }
    });
  });
}
