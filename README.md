이전 대화에서 결정된 \*\*"VS Code 포크(Snapshot Strategy)"\*\*와 **"비침습적 확장(Built-in Extension)"** 전략을 반영하여 `README.md`를 전면 수정했습니다. 기존의 Tauri/Rust 기반 계획을 폐기하고, VS Code 플랫폼을 활용하는 새로운 로드맵으로 변경했습니다.

-----

# Gitbbon (OTU2 Desktop)

> **노션의 '쉬움'과 깃(Git)의 '통제권'을 결합한 차세대 문서 편집기**
>
> *"VS Code의 강력한 엔진 위에 Milkdown의 감성을 입히다"*

\<div align="center"\>

[](https://www.google.com/search?q=LICENSE)
[](https://github.com/microsoft/vscode)
[](https://www.google.com/search?q=docs/strategy/snapshot_strategy.md)

\</div\>

## 1\. 프로젝트 개요

**Gitbbon**은 개발자를 위한 IDE인 VS Code를 \*\*"글쓰기를 위한 가전제품(Appliance)"\*\*으로 재해석한 프로젝트입니다.

일반 사용자도 Git의 강력한 버전 관리 기능을 투명하게 활용할 수 있도록, VS Code의 복잡한 기능(디버깅, 터미널 등)은 덜어내고 그 자리에 **WYSIWYG 에디터**와 **AI Agent**를 채웠습니다.

### 핵심 가치

  - **Data Sovereignty** - 내 데이터는 내 로컬 파일(`.md`)과 내가 지정한 클라우드(Forgejo 등)에 영구 보존
  - **Invisible Git** - 사용자는 커밋/푸시를 몰라도 됩니다. 타임머신처럼 과거로 돌아가는 경험만 제공합니다.
  - **AI Mediator** - 문서 충돌(Conflict) 발생 시 AI Agent가 문맥을 파악해 사람처럼 중재하고 문서를 직접 수정합니다.
  - **Platform Stability** - 수백만 명이 검증한 VS Code Core를 기반으로 하여 최고의 안정성을 보장합니다.

-----

## 2\. 아키텍처 전략 (The Snapshot Strategy)

우리는 바닥부터 새로 만드는 대신, 거인의 어깨 위에 올라타는 전략을 선택했습니다.

### 변경된 접근 방식 (VS Code Fork)

  - **Snapshot Strategy:** 매달 업데이트되는 VS Code의 최신 버전을 따라가지 않습니다. 가장 안정적인 특정 버전을 \*\*스냅샷(Snapshot)\*\*으로 포크하여 고정하고, 이를 기반으로 독자적인 생태계를 구축합니다.
  - **Diet Architecture:** IDE에만 필요한 기능(Debug, Terminal, Multi-language packs)을 과감히 제거하여 가볍고 빠른 구동 속도를 확보합니다.
  - **Built-in Extensions:** 핵심 기능(Milkdown 에디터, AI 등)을 VS Code 소스 코드를 직접 수정(침습)하는 방식이 아닌, **내장 확장 프로그램** 형태로 개발하여 모듈성을 유지합니다.

### 기술 스택

| 구분 | 기술 | 설명 |
|------|------|------|
| **Core** | **Electron / VS Code** | 검증된 크로스 플랫폼 데스크탑 앱 엔진 |
| **Editor** | **Milkdown** | VS Code Webview 위에서 돌아가는 WYSIWYG 마크다운 에디터 |
| **Styling** | **CSS Variables** | VS Code 테마 시스템과 100% 호환되는 자동 테마 적용 |
| **AI** | **Chat Participant API** | VS Code 내장 Chat UI를 활용한 Custom AI Agent 구현 |
| **Search** | **Ripgrep** | VS Code에 내장된 현존 최강의 파일 검색 엔진 활용 |
| **Git** | **Native Git** | VS Code의 Git 연동 기능을 간소화 및 자동화하여 사용 |
| **Backend** | **Forgejo** | (선택 사항) 중앙 집중식 원격 저장소 및 사용자 인증 |

-----

## 3\. 사용자 경험 (UX)

### Phase 1: 개발 도구가 아닌 "노트 앱"

  - **개발자 UI 제거:** 하단 상태바, 액티비티 바, 디버그 메뉴 등을 숨기거나 제거하여 깔끔한 글쓰기 환경 제공.
  - **Title Explorer:** 파일명(`2025-12-07.md`)이 아닌 문서 내의 `# 제목`을 파싱하여 사이드바에 표시.

### Phase 2: Milkdown 에디터 통합

  - `.md` 파일을 열면 딱딱한 텍스트 에디터 대신, **Milkdown UI**가 즉시 로드됩니다.
  - 슬래시 커맨드(`/`), 블록 편집 등 Notion과 유사한 사용자 경험을 제공합니다.

### Phase 3: AI Agent와의 협업

  - **"문서 수정해줘":** 채팅창에서 명령하면 AI가 현재 열려있는 문서를 직접 수정(Edit)합니다.
  - **충돌 해결:** Git 충돌 발생 시 AI가 3가지 해결책을 제시하고 자동으로 병합합니다.

-----

## 4\. 구현 목표 (Roadmap)

> **목표:** VS Code의 껍데기는 유지하되, 알맹이는 완벽한 노트 앱으로 교체

### ✅ Step 0: Foundation (Diet VS Code)

  - [x] VS Code 소스 코드 포크 및 빌드 환경 구성
  - [x] `product.json` 수정 (브랜딩 변경: Code OSS -\> Gitbbon)
  - [ ] **Diet 작업:** 불필요한 내장 익스텐션(TypeScript, Debug, Emmet 등) 제거 및 빌드 최적화
  - [ ] 마켓플레이스 연결 해제 및 텔레메트리(추적) 비활성화

### 🎯 POC 단계: 기술적 검증

다음 브랜치에서 기술적 가능성을 독립적으로 검증:

#### 기본 UI 변경
- **poc/branding**: VS Code → gitbbon 브랜딩 완전 변경

#### 편집환경
- **poc/custom-editor**: .md 파일을 Milkdown WYSIWYG 에디터로 표시
- **poc/title-explorer**: 파일명 대신 문서 제목 기반 사이드바 탐색기
- **poc/ai-agent**: VS Code Chat Participant API를 활용한 AI 연동

#### Git 연동
- **poc/project-management**: Gitbbon_Notes 자동 생성 및 프로젝트 관리 시스템
- **poc/git-automation**: Invisible Git - 자동 커밋 및 병합

#### 프로젝트 관리 시스템 (poc/project-management)
앱 최초 실행시 자동으로 환경 설정:
- `~/Gitbbon_Notes/` 폴더 생성
- `~/Gitbbon_Notes/default/` 기본 프로젝트 생성
- 각 프로젝트는 독립 Git 저장소
- `workspace.json`으로 프로젝트 목록 관리
- Command Palette로 프로젝트 간 쉬운 전환



-----

## 5\. 빌드 및 실행 (Build & Run)

이 프로젝트는 Node.js와 VS Code의 빌드 시스템을 따릅니다.

### 사전 요구사항 (Prerequisites)

  - **Node.js:** `.nvmrc`에 명시된 버전 (필수)
  - **Python:** 빌드 스크립트 실행용
  - **npm:** (Yarn 아님)

### 개발 모드 실행

```bash
# 1. 저장소 클론
git clone https://github.com/opentutorials/gitbbon.git
cd gitbbon

# 2. Node 버전 맞추기
nvm use

# 3. 의존성 설치
npm install

# 4. Electron 실행 (Dev Mode)
./scripts/code.sh
```

### 프로덕션 빌드 (배포용)

```bash
# macOS (Apple Silicon)
npm run gulp vscode-darwin-arm64-min

# macOS (Intel)
npm run gulp vscode-darwin-x64-min

# Windows
npm run gulp vscode-win32-x64-min
```

-----

## 6\. 비즈니스 모델: "The Freedom Strategy"

사용자의 데이터를 볼모로 잡지 않습니다.

1.  **Quota & Freemium:** AI 사용량 및 클라우드 저장 용량 기반 과금.
2.  **Independence (이탈 전략):** 사용자가 원하면 언제든 본인의 개인 저장소(GitHub/GitLab)로 데이터를 이전하고, 개인 API Key(BYOK)를 넣어 **무료로 계속 사용**할 수 있게 지원합니다.

-----

## 7\. 문서 관리 및 AI 작업 가이드

### 학습 자료 관리
- **study/** 폴더: 기술 학습, 아키텍처 연구, 프로토타이핑 등 개발 과정에서 생성된 학습용 문서 보관
- **docs/** 폴더: 프로젝트 공식 문서, API 명세, 사용자 가이드 등 정식 문서 보관

### AI Agent 작업 지침
**🤖 AI Coding Agents:** 이 README 파일을 먼저 참고하여 프로젝트의 전체 구조와 정책을 이해한 후 작업을 진행해주세요.

#### 정보 조회 우선순위
1. **README.md** - 프로젝트 전체 구조, 아키텍처, 정책 이해
2. **agents.md** - 최소한의 실행 지침 (링크 참조)
3. **Copilot Instructions** - 상세 코딩 가이드라인
4. **study/README.md** - 학습 자료 및 튜토리얼 안내

#### 작업 원칙
- **문서 관리:** study/ 폴더에 학습 자료, docs/ 폴더에 공식 문서 보관
- **아키텍처 준수:** "Snapshot Strategy"와 "Built-in Extension" 접근 방식 유지
- **디커플링 원칙:** VS Code와의 분리 원칙 준수
- **일관성 유지:** 기존 코드 스타일과 패턴 따르기
- **커밋 규칙:** 변경 사항을 명확하게 기록

#### 작업 시 참고사항
- study/ 폴더의 튜토리얼은 숫자 번호(00, 10, 20...)로 선후관계 관리
- 문서 수정 시 study/README.md 참고 후 반영 그리고 다시 study/README.md를 수정

-----

## 8\. 기여하기 (Contributing)

Gitbbon은 오픈소스 프로젝트입니다. 하지만 VS Code의 방대한 코드를 직접 수정하는 PR보다는, `extensions/gitbbon-core` 내부의 기능을 개선하는 PR을 환영합니다.

1.  Issue 생성 후 논의
2.  Fork & Branch 생성
3.  PR 제출

-----

## 라이선스

이 프로젝트는 [MIT License](https://www.google.com/search?q=LICENSE)를 따르며, Microsoft VS Code의 원본 라이선스 정책을 준수합니다.
(Original Copyright Microsoft Corporation)
