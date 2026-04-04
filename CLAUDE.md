# gitbbon Claude Code 지침

> Claude Code(claude.ai/claude-code)를 사용할 때 참고하는 프로젝트별 핵심 규칙입니다.
> 더 상세한 지침은 [AGENTS.md](./AGENTS.md)를 참고하세요.

---

## 언어 규칙

**모든 응답과 주석은 한국어로 작성한다.**

---

## ⚠️ [필수] VSCode 코어 수정 시 주석 규칙

VSCode OSS 코어(`src/` 등 VS Code 원본 소스)를 수정할 때는 **반드시** 아래 형식의 주석을 달아야 한다.

```
// gitbbon custom: <수정 이유>
```

### 작업 유형별 처리

| 작업 유형 | 처리 방법 |
|-----------|-----------|
| 코드 **추가** | 추가 코드 위에 `// gitbbon custom: <수정 이유>` 주석 |
| 코드 **수정** | 원본을 주석으로 보존하고 수정 코드 작성. 두 곳 모두 주석 명시 |
| 코드 **삭제** | 삭제하지 말고 주석 처리. 주석에 `// gitbbon custom: <이유>` 명시 |

### 예시

```typescript
// gitbbon custom: 노트 저장 시 gitbbon 확장으로 이벤트 전달 필요
gitbbonNoteService.onSave(document);

// gitbbon custom: 기존 단축키 비활성화 (gitbbon 단축키와 충돌)
// keybindingService.registerDefault(keybinding);
const keybinding = overrideKeybinding; // gitbbon custom: gitbbon 커스텀 단축키로 대체
```

이 규칙은 추후 vscode-oss 업스트림 병합을 위해 반드시 준수해야 한다.

---

## 아키텍처 원칙

- **Snapshot Strategy** 및 **Built-in Extension** 접근 방식을 유지한다
- 코어 수정은 **최소화**하고, 기능은 Extension 형태로 구현한다
- VS Code와의 **디커플링 원칙**을 준수하되, 불가피한 경우 코어를 수정한다
- 코어 수정 시 변경 코드는 가급적 **파일 내에서 모아서 위치**시킨다

---

## 코드 작업 규칙

- 확장 기능(`extensions/gitbbon-*`) 수정 후에는 반드시 `npm run compile` 수행
- 코드 수정 시 동작 확인을 위한 로그를 추가하고, 사용자에게 필터 정규식을 알려준다
- 불명확한 사항은 임의로 판단하지 말고 사용자에게 질문한다
- 작업 완료 후 결과 확인 방법을 알려준다 (예: `npm run start`, `npm run start:fresh`)

---

## Extension 테스트 스킬 규칙

새로운 Extension의 `@vscode/test-electron` 테스트 스킬을 만들 때는 반드시 아래 마더 스킬을 참조한다:

- **마더 스킬**: `.claude/skills/test-electron-gitbbon-chat/SKILL.md`
- **스킬 명명 규칙**: `/test-electron-{extension-name}` (예: `/test-electron-gitbbon-search`)
- **스킬 위치**: `.claude/skills/test-electron-{extension-name}/SKILL.md`
- **필수 프론트매터**:
  ```yaml
  ---
  name: test-electron-{extension-name}
  description: {extension-name} Extension Host 테스트 실행. 실패 시 원인 분석 → 코드 수정 → 재실행 루프 수행.
  ---
  ```
- **테스트 설정 참고**: PR #114 (`extensions/gitbbon-chat/test/` 구조 및 `tsconfig.test.json`)

---

## 참고 문서

- [README.md](./README.md) - 프로젝트 전체 구조 및 아키텍처
- [AGENTS.md](./AGENTS.md) - 에이전트 실행 지침 (상세)
- [.github/copilot-instructions.md](./.github/copilot-instructions.md) - 코딩 스타일 가이드라인
