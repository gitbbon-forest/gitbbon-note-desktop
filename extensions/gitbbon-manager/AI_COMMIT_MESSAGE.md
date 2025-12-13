# Gitbbon Manager - AI 커밋 메시지 생성 기능

## 개요

Gitbbon Manager는 Claude API를 사용하여 Git diff를 분석하고 자동으로 커밋 메시지를 생성합니다.

## 설정 방법

### 1. Claude API 키 발급

1. [Anthropic Console](https://console.anthropic.com/)에 접속
2. API Keys 섹션으로 이동
3. 새로운 API 키 생성
4. 생성된 키를 복사

### 2. 환경변수 설정

`extensions/gitbbon-manager/.env` 파일을 열고 API 키를 입력하세요:

```bash
ANTHROPIC_API_KEY=your_api_key_here
```

**중요**: `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.

### 3. 의존성 설치

```bash
cd extensions/gitbbon-manager
npm install
```

## 사용 방법

### 수동 커밋 시 자동 메시지 생성

"진짜최종" 커밋을 실행할 때 커밋 메시지를 제공하지 않으면, Claude API가 자동으로 변경 사항을 분석하여 적절한 커밋 메시지를 생성합니다.

```typescript
// 커밋 메시지 없이 호출
await projectManager.reallyFinalCommit();
// → Claude가 자동으로 커밋 메시지 생성

// 커밋 메시지를 직접 제공
await projectManager.reallyFinalCommit("사용자 정의 메시지");
// → 제공된 메시지 사용
```

### 동작 방식

1. **변경 사항 스테이징**: 모든 변경 사항을 Git index에 추가
2. **Diff 생성**: `git diff --cached`로 staged 변경 사항 확인
3. **AI 분석**: Claude API가 diff를 분석하여 커밋 메시지 생성
4. **커밋 실행**: 생성된 메시지로 커밋 수행

### 커밋 메시지 생성 규칙

Claude는 다음 규칙에 따라 커밋 메시지를 생성합니다:

- **길이**: 50자 이내
- **언어**: 한글
- **형식**: 동사로 시작 (예: "추가", "수정", "삭제", "개선")
- **내용**: 변경의 목적이나 의도를 간결하게 설명

## API 키가 없는 경우

API 키가 설정되지 않은 경우, 기본 커밋 메시지가 사용됩니다:

```
진짜최종: 2025-12-13 13:45:30
```

## 개발 버전 참고사항

현재는 개발 버전이므로 `.env` 파일에 API 키를 직접 저장합니다. 프로덕션 버전에서는 더 안전한 방법(예: VS Code Secret Storage)을 사용할 예정입니다.

## 문제 해결

### API 키가 작동하지 않는 경우

1. `.env` 파일이 올바른 위치에 있는지 확인 (`extensions/gitbbon-manager/.env`)
2. API 키에 공백이나 따옴표가 없는지 확인
3. Anthropic Console에서 API 키가 활성화되어 있는지 확인
4. 확장 프로그램을 다시 로드 (VS Code 재시작)

### 로그 확인

개발자 도구 콘솔에서 다음과 같은 로그를 확인할 수 있습니다:

```
[CommitMessageGenerator] Initialized with API key
[ProjectManager] Generating commit message using LLM...
[CommitMessageGenerator] Generated message: 추가: 새로운 기능 구현
[ProjectManager] LLM generated message: 추가: 새로운 기능 구현
```

## 라이선스

MIT License - Copyright (c) Gitbbon
