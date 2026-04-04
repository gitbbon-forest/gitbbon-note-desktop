import * as assert from 'assert';
import * as vscode from 'vscode';
import { AIService } from '../../src/services/aiService';
import { ollamaService } from '../../src/services/ollamaService';

// Mock SecretStorage: 메모리 내 key-value 저장소
class MockSecretStorage implements vscode.SecretStorage {
  private _store = new Map<string, string>();
  private _emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
  onDidChange = this._emitter.event;

  async get(key: string): Promise<string | undefined> {
    return this._store.get(key);
  }
  async store(key: string, value: string): Promise<void> {
    this._store.set(key, value);
    this._emitter.fire({ key });
  }
  async delete(key: string): Promise<void> {
    this._store.delete(key);
    this._emitter.fire({ key });
  }
  async keys(): Promise<string[]> {
    return Array.from(this._store.keys());
  }
}

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

  test('Ollama 백엔드 선택 후 메시지 입력 시 텍스트 응답이 반환된다', async () => {
    // Ollama 실행 여부 확인 (미실행 시 skip)
    const isRunning = await ollamaService.isRunning();
    console.log('[debug:test] Ollama 실행 상태:', isRunning);
    if (!isRunning) {
      console.log('[debug:test] Ollama가 실행 중이 아니므로 테스트를 건너뜁니다');
      return;
    }

    // 설치된 모델 확인 (없으면 skip)
    const installedModels = await ollamaService.getInstalledModels();
    console.log('[debug:test] 설치된 모델:', installedModels);
    if (installedModels.length === 0) {
      console.log('[debug:test] 설치된 Ollama 모델이 없으므로 테스트를 건너뜁니다');
      return;
    }

    const selectedModel = installedModels[0];
    console.log('[debug:test] 선택된 모델:', selectedModel);

    // MockSecretStorage에 ollama 백엔드 저장
    const secrets = new MockSecretStorage();
    await secrets.store('CHAT_BACKEND', 'ollama');

    const aiService = new AIService(secrets);

    const messages = [
      { role: 'user' as const, content: '안녕. 딱 한 문장으로만 대답해 줘.' }
    ];

    // [debug:test] tools/think 비활성화로 단순 completion 모드 테스트
    const modelCapabilities = { thinking: false, tools: false, completion: true };

    const events: { type: string; content?: string }[] = [];
    for await (const event of aiService.streamAgentChat(messages, selectedModel, modelCapabilities)) {
      console.log('[debug:test] 이벤트 수신:', event.type, event.type === 'text' ? (event as any).content?.slice(0, 50) : '');
      events.push(event);
    }

    const textEvents = events.filter(e => e.type === 'text');
    console.log('[debug:test] 텍스트 이벤트 수:', textEvents.length);
    assert.ok(textEvents.length > 0, 'AI 응답에 텍스트 이벤트가 1개 이상 있어야 한다');

    const fullText = textEvents.map(e => (e as any).content as string).join('');
    console.log('[debug:test] 전체 응답 (앞 200자):', fullText.slice(0, 200));
    assert.ok(fullText.trim().length > 0, '응답 텍스트가 비어있지 않아야 한다');
  });
});
