---
name: test-electron-gitbbon-chat
description: gitbbon-chat Extension Host 테스트 실행. 실패 시 원인 분석 → 코드 수정 → 재실행 루프 수행.
---

# /test-electron-gitbbon-chat — gitbbon-chat Extension 테스트 러너

`@vscode/test-electron`으로 gitbbon-chat Extension을 실제 VS Code Extension Host 환경에서 테스트한다.
실패 시 원인을 분석해 코드를 수정하고 재실행하는 루프를 수행한다.

## 실행 프로세스

### 1단계: 컴파일 + 테스트 실행

```bash
cd extensions/gitbbon-chat
npm run compile:test
npm run test:electron
```

### 2단계: 결과 분석

**통과 시**: 결과 요약 출력 후 종료

**실패 시** (자동 수정 루프):
1. 실패 메시지 분석 → 원인 추론
2. 관련 소스 파일 탐색 (Read, Grep)
3. 코드 수정 (Edit)
4. 재컴파일 후 재실행
5. 최대 3회 반복 후에도 실패 시 → 원인 요약 보고

### 3단계: 결과 보고

```
## 테스트 결과 — YYYY-MM-DD HH:MM

| 대상 | 결과 | 통과/전체 | 비고 |
|------|------|-----------|------|
| gitbbon-chat | ✅ | 1/1 | - |
```

## 환경변수

`AI_GATEWAY_API_KEY`는 `.claude/settings.local.json`에 등록되어 있어 자동 주입된다.
