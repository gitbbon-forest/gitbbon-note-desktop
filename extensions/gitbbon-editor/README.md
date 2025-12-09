# Gitbbon Editor

Gitbbon Editor는 Milkdown 기반의 WYSIWYG 마크다운 에디터입니다.

## 기능

- **WYSIWYG 편집**: Milkdown을 사용한 직관적인 마크다운 편집
- **YAML Frontmatter 지원**: 문서 메타데이터를 폼 UI로 편집
- **실시간 저장**: 자동 저장 기능
- **테마 지원**: VS Code 테마와 자동 동기화

## 아키텍처

이 extension은 VS Code의 Custom Editor API를 사용하여 구현되었습니다:

1. **Extension Host**: `extension.ts`에서 Custom Editor Provider 등록
2. **Webview**: Milkdown 에디터가 실행되는 격리된 환경
3. **Message Passing**: Extension과 Webview 간 통신

## 개발

```bash
# 의존성 설치
npm install

# 컴파일
npm run compile

# Watch 모드
npm run watch
```

## 구조

```
gitbbon-editor/
├── src/
│   ├── extension.ts          # Extension 진입점
│   ├── editorProvider.ts     # Custom Editor Provider
│   ├── frontmatterParser.ts  # YAML Frontmatter 파싱
│   └── webview/
│       ├── main.ts           # Webview 진입점
│       └── editor.ts         # Milkdown 에디터 초기화
├── media/                    # 정적 리소스
└── package.json
```
