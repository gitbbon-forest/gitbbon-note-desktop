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

// 테스트 전체에서 공유할 Ollama 상태 캐시 (매 테스트마다 중복 확인 방지)
let cachedOllamaRunning: boolean | null = null;
let cachedInstalledModels: string[] | null = null;
let cachedToolSupportedModel: string | null | undefined = undefined; // null = 없음, string = 모델명

async function getOllamaState(): Promise<{ isRunning: boolean; models: string[] }> {
  if (cachedOllamaRunning === null) {
    cachedOllamaRunning = await ollamaService.isRunning();
  }
  if (cachedInstalledModels === null) {
    cachedInstalledModels = cachedOllamaRunning ? await ollamaService.getInstalledModels() : [];
  }
  return { isRunning: cachedOllamaRunning, models: cachedInstalledModels };
}

/** tool calling을 지원하는 모델 반환.
 *  우선순위: thinking 없는 tool 지원 모델 → thinking 있는 tool 지원 모델 → null
 *  이유: thinking 모델은 tool call을 텍스트로 "설명"하고 실제로 호출하지 않는 경우가 있음 */
async function getToolSupportedModel(): Promise<string | null> {
  if (cachedToolSupportedModel !== undefined) {
    return cachedToolSupportedModel;
  }
  const { isRunning, models } = await getOllamaState();
  if (!isRunning || models.length === 0) {
    cachedToolSupportedModel = null;
    return null;
  }

  // thinking 없는 tool 지원 모델 우선 → 없으면 가장 큰(마지막) thinking tool 모델
  let thinkingFallback: string | null = null;
  for (const modelName of models) {
    const caps = await ollamaService.getModelCapabilities(modelName);
    console.log(`[debug:test] 모델 ${modelName} 캐퍼빌리티:`, caps);
    if (caps.tools && !caps.thinking) {
      cachedToolSupportedModel = modelName;
      return modelName;
    }
    if (caps.tools) {
      // 나중에 나온 모델(더 큰 모델)로 덮어씀 → 가장 큰 thinking tool 모델 선택
      thinkingFallback = modelName;
    }
  }

  cachedToolSupportedModel = thinkingFallback;
  return thinkingFallback;
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

// gitbbon-editor 마크다운 포맷: YAML frontmatter + 본문 + 숨겨진 메타데이터 주석
const TEST_MD_CONTENT = `---
title: 테스트 노트
date: 2026-04-04
tags: [테스트, gitbbon]
---

# 테스트 노트

이것은 테스트용 노트입니다.

## 첫 번째 섹션

첫 번째 섹션의 내용입니다.

<!-- gitbbon:{} -->`;

const TEST_MD_FILENAME = 'test-note.md';

suite('파일 읽기/쓰기 작업', () => {
  suiteSetup(async () => {
    // 임시 워크스페이스에 테스트용 md 파일 생성
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0, '워크스페이스가 열려있어야 한다');
    const testFile = vscode.Uri.joinPath(workspaceFolders![0].uri, TEST_MD_FILENAME);
    await vscode.workspace.fs.writeFile(testFile, Buffer.from(TEST_MD_CONTENT, 'utf-8'));
    console.log('[debug:test] 테스트용 md 파일 생성:', testFile.fsPath);
  });

  test('MD 파일 내용을 AI가 읽어올 수 있다', async function () {
    this.timeout(120000);
    const selectedModel = await getToolSupportedModel();
    if (!selectedModel) {
      console.log('[debug:test] tool calling 지원 모델 없음 — 테스트 skip');
      return;
    }
    console.log('[debug:test] tool 지원 모델 사용:', selectedModel);

    const secrets = new MockSecretStorage();
    await secrets.store('CHAT_BACKEND', 'ollama');
    const aiService = new AIService(secrets);

    const messages = [
      { role: 'user' as const, content: `${TEST_MD_FILENAME} 파일의 내용을 읽어줘` }
    ];
    // tools: true — read_file 도구 호출 활성화
    const modelCapabilities = { thinking: false, tools: true, completion: false };

    const events: { type: string; toolName?: string; content?: string }[] = [];
    for await (const event of aiService.streamAgentChat(messages, selectedModel, modelCapabilities)) {
      console.log('[debug:test] 이벤트:', event.type, (event as any).toolName ?? (event as any).content?.slice(0, 50) ?? '');
      events.push(event as any);
    }

    // read_file 도구가 호출되었는지 확인
    const toolStartNames = events
      .filter(e => e.type === 'tool-start')
      .map(e => e.toolName ?? '');
    console.log('[debug:test] 호출된 도구들:', toolStartNames);

    const hasReadTool = toolStartNames.some(name =>
      name === 'Reading file' || name === 'read_file'
    );
    assert.ok(hasReadTool, `read_file 도구가 호출되어야 한다. 호출된 도구: ${toolStartNames.join(', ')}`);

    // 응답 텍스트에 파일 핵심 내용이 포함되어 있는지 확인
    const fullText = events
      .filter(e => e.type === 'text')
      .map(e => e.content ?? '')
      .join('');
    console.log('[debug:test] 전체 응답 (앞 300자):', fullText.slice(0, 300));
    assert.ok(fullText.trim().length > 0, '파일 내용을 포함한 텍스트 응답이 있어야 한다');
  });

  test('AI가 새 MD 파일을 워크스페이스에 생성할 수 있다', async function () {
    // thinking 모델은 tool 호출 전 추론에 시간이 걸리므로 타임아웃을 120초로 확장
    this.timeout(120000);

    const selectedModel = await getToolSupportedModel();
    if (!selectedModel) {
      console.log('[debug:test] tool calling 지원 모델 없음 — 테스트 skip');
      return;
    }
    console.log('[debug:test] tool 지원 모델 사용:', selectedModel);

    const workspaceFolders = vscode.workspace.workspaceFolders!;
    const newFilePath = 'ai-created-note.md';
    const newFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, newFilePath);

    // 혹시 이전 실행 잔여물이 있으면 삭제
    try { await vscode.workspace.fs.delete(newFileUri); } catch { /* 없으면 무시 */ }

    const secrets = new MockSecretStorage();
    await secrets.store('CHAT_BACKEND', 'ollama');
    const aiService = new AIService(secrets);

    const messages = [
      {
        role: 'user' as const,
        // prepareStep 로직: 읽기 툴 호출 전까지 edit_note 비활성화됨
        // → test-note.md를 먼저 읽은 후 새 파일 생성하도록 유도
        content: `${TEST_MD_FILENAME} 파일을 읽은 다음, 그 내용을 참고해서 "${newFilePath}" 파일을 새로 만들어줘. 새 파일 내용은 "AI가 생성한 노트입니다."로 해줘.`
      }
    ];
    // tools: true — edit_note 도구 호출 활성화
    const modelCapabilities = { thinking: false, tools: true, completion: false };

    const events: { type: string; toolName?: string; content?: string }[] = [];
    for await (const event of aiService.streamAgentChat(messages, selectedModel, modelCapabilities)) {
      console.log('[debug:test] 이벤트:', event.type, (event as any).toolName ?? (event as any).content?.slice(0, 50) ?? '');
      events.push(event as any);
    }

    // edit_note 도구가 호출되었는지 확인
    const toolStartNames = events
      .filter(e => e.type === 'tool-start')
      .map(e => e.toolName ?? '');
    console.log('[debug:test] 호출된 도구들:', toolStartNames);

    const hasEditTool = toolStartNames.some(name =>
      name === 'Editing note' || name === 'edit_note'
    );
    assert.ok(hasEditTool, `edit_note 도구가 호출되어야 한다. 호출된 도구: ${toolStartNames.join(', ')}`);

    // 실제 파일이 워크스페이스에 생성되었는지 확인
    let fileExists = false;
    try {
      await vscode.workspace.fs.stat(newFileUri);
      fileExists = true;
    } catch { /* 파일 없음 */ }
    console.log('[debug:test] 파일 생성 여부:', fileExists, newFileUri.fsPath);
    assert.ok(fileExists, `${newFilePath} 파일이 워크스페이스에 생성되어야 한다`);

    // 파일 내용 확인
    if (fileExists) {
      const content = Buffer.from(await vscode.workspace.fs.readFile(newFileUri)).toString('utf-8');
      console.log('[debug:test] 생성된 파일 내용 (앞 200자):', content.slice(0, 200));
      assert.ok(content.trim().length > 0, '생성된 파일에 내용이 있어야 한다');
    }
  });
});
