import * as assert from 'assert';
import * as vscode from 'vscode';

suite('gitbbon-chat Extension', () => {
  test('Extension이 활성화된다', async () => {
    // [debug:#113] Extension 활성화 확인 테스트
    console.log('[debug:#113] Extension 목록:', vscode.extensions.all.map(e => e.id));

    const ext = vscode.extensions.getExtension('gitbbon.gitbbon-chat');
    assert.ok(ext, 'Extension이 존재해야 한다');

    await ext!.activate();
    assert.ok(ext!.isActive, 'Extension이 활성화되어야 한다');

    console.log('[debug:#113] Extension 활성화 성공');
  });
});
