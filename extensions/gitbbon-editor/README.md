# Gitbbon Editor 2

VS Code 공식 확장 기능 생성 도구를 사용하여 만든 Gitbbon의 WYSIWYG Markdown 에디터입니다.

## 기능

- **Custom Editor**: Markdown 파일을 위한 커스텀 에디터 제공
- **WYSIWYG 편집**: Milkdown을 사용한 실시간 WYSIWYG 마크다운 편집
- **Frontmatter 지원**: YAML frontmatter를 폼 UI로 편집 가능
- **VS Code 테마 통합**: VS Code의 테마 색상을 자동으로 적용

## 사용 방법

1. `.md` 파일을 열면 자동으로 Gitbbon Editor 2가 활성화됩니다
2. 또는 파일 탐색기에서 마크다운 파일을 우클릭하고 "Open with Gitbbon Editor 2"를 선택합니다

## 개발

### 빌드

```bash
npm run compile
```

### Watch 모드

```bash
npm run watch
```

### 테스트

F5를 눌러 Extension Development Host를 실행합니다.

## 기술 스택

- **Extension Host**: TypeScript, VS Code Extension API
- **Webview**: TypeScript, Milkdown, ProseMirror
- **빌드 도구**: esbuild
- **스타일**: CSS (VS Code 테마 변수 사용)

## 라이선스

MIT License - Copyright (c) Gitbbon
