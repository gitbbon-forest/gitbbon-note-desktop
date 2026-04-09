---
name: test-electron-gitbbon-chat
description: gitbbon-chat Extension Host 테스트 실행. 실패 시 원인 분석 → 코드 수정 → 재실행 루프 수행.
---

# /test-electron-gitbbon-chat — gitbbon-chat Extension 테스트 러너

`@vscode/test-electron`으로 gitbbon-chat Extension을 실제 VS Code Extension Host 환경에서 테스트한다.
실패 시 원인을 분석해 코드를 수정하고 재실행하는 루프를 수행한다.

## 실행 프로세스

### 1단계: 테스트 실행

```bash
cd extensions/gitbbon-chat
npm run test:electron
```

### 2단계: 결과 분석

**통과 시**: 결과 요약 출력 후 종료

**실패 시** (자동 수정 루프):

1. **실패 원인 파악**
   - 테스트 출력에서 실패한 테스트명, AssertionError, 스택 트레이스 확인
   - 단순 오류(경로, 타입)인지 로직 오류인지 구분

2. **코드 탐색**
   - 실패한 테스트 파일 읽기 (`test/suite/*.test.ts`)
   - 테스트가 호출하는 소스 파일 추적 (Read, Grep)
   - 관련 인터페이스/타입 확인

3. **원인 추론 및 가설 설정**
   - 실패 메시지와 코드를 대조해 원인 1순위 가설 수립
   - 가설을 한 줄로 명시 ("~이기 때문에 ~가 실패한 것으로 추정")

4. **코드 수정**
   - 가설에 따라 최소 범위로 수정 (Edit)
   - 수정 이유를 주석으로 명시
   - 동작 확인이 필요한 분기·변환 지점에 디버깅 로그 추가:
     ```typescript
     console.log('[debug:test] 입력값:', input);
     console.log('[debug:test] 처리 결과:', result);
     ```
   - `[debug:test]` prefix로 임시 로그임을 명시한다

5. **재실행**
   ```bash
   npm run test:electron
   ```

6. **반복 또는 종료**
   - 통과 시 → 수정한 코드를 커밋 후 3단계로
     ```bash
     git add extensions/gitbbon-chat
     git commit -m "fix: [실패한 테스트명] 수정 — [원인 한 줄 요약]"
     ```
   - 실패 시 → 다른 가설로 2번부터 반복
   - **최대 3회** 반복 후에도 실패 시 → 현재까지 수정 내용을 커밋·푸시 후 PR 생성, 원인 분석 요약 보고 후 종료
     ```bash
     git add extensions/gitbbon-chat
     git commit -m "wip: [실패한 테스트명] 수정 시도 — 3회 미해결"
     git push origin HEAD
     gh pr create \
       --title "wip: test-electron [실패한 테스트명] 수정 시도" \
       --body "## 미해결 테스트
     [테스트명]

     ## 시도한 가설 및 수정 내역
     1. [1차 가설 및 수정]
     2. [2차 가설 및 수정]
     3. [3차 가설 및 수정]

     ## 마지막 에러 메시지
     \`\`\`
     [에러 출력]
     \`\`\`

     ## 다음 시도 방향
     [추가 분석이 필요한 부분]" \
       --draft
     ```

### 3단계: 결과 보고

```
## 테스트 결과 — YYYY-MM-DD HH:MM

| 대상 | 결과 | 통과/전체 | 시도횟수 | 비고 |
|------|------|-----------|----------|------|
| gitbbon-chat | ✅ | 3/3 | 1 | - |
```

실패로 종료된 경우 원인 가설과 시도한 수정 내역, 생성된 이슈 번호를 함께 출력한다.
