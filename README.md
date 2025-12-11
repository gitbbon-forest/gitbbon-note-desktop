# Gitbbon (OTU2 Desktop)

> **노션의 '쉬움'과 깃(Git)의 '통제권'을 결합한 차세대 문서 편집기**
>
> *"VS Code의 강력한 엔진 위에 Milkdown의 감성을 입히다"*

<div align="center">

[](https://github.com/microsoft/vscode)

</div>

## 1. 프로젝트 개요

**Gitbbon**은 개발자를 위한 IDE인 VS Code를 **"글쓰기를 위한 가전제품(Appliance)"**으로 재해석한 프로젝트입니다.

일반 사용자도 Git의 강력한 버전 관리 기능을 투명하게 활용할 수 있도록, VS Code의 복잡한 기능(디버깅, 터미널 등)은 덜어내고 그 자리에 **WYSIWYG 에디터**와 **AI Agent**를 채웠습니다.

### 핵심 가치

- **Data Sovereignty** - 내 데이터는 내 로컬 파일(`.md`)과 **나의 GitHub 저장소**에 영구 보존
- **Invisible Git** - 사용자는 커밋/푸시를 몰라도 됩니다. 타임머신처럼 과거로 돌아가는 경험만 제공합니다.
- **AI Mediator** - 문서 충돌(Conflict) 발생 시 AI Agent가 문맥을 파악해 사람처럼 중재하고 문서를 직접 수정합니다.
- **Platform Stability** - 수백만 명이 검증한 VS Code Core를 기반으로 하여 최고의 안정성을 보장합니다.

---

## 2. 아키텍처 전략 (The Snapshot Strategy)

우리는 바닥부터 새로 만드는 대신, 거인의 어깨 위에 올라타는 전략을 선택했습니다.

### 변경된 접근 방식 (VS Code Fork)

- **Snapshot Strategy:** 매달 업데이트되는 VS Code의 최신 버전을 따라가지 않습니다. 가장 안정적인 특정 버전을 **스냅샷(Snapshot)**으로 포크하여 고정하고, 이를 기반으로 독자적인 생태계를 구축합니다.
- **Diet Architecture:** IDE에만 필요한 기능(Debug, Terminal, Multi-language packs)을 과감히 제거하여 가볍고 빠른 구동 속도를 확보합니다.
- **Built-in Extensions:** 핵심 기능(Milkdown 에디터, AI 등)을 VS Code 소스 코드를 직접 수정(침습)하는 방식이 아닌, **내장 확장 프로그램** 형태로 개발하여 모듈성을 유지합니다.

### 기술 스택

| 구분 | 기술 | 설명 |
| --- | --- | --- |
| **Core** | **Electron / VS Code** | 검증된 크로스 플랫폼 데스크탑 앱 엔진 |
| **Editor** | **Milkdown** | VS Code Webview 위에서 돌아가는 WYSIWYG 마크다운 에디터 |
| **Styling** | **CSS Variables** | VS Code 테마 시스템과 100% 호환되는 자동 테마 적용 |
| **AI** | **Chat Participant API** | VS Code 내장 Chat UI를 활용한 Custom AI Agent 구현 |
| **Search** | **Ripgrep** | VS Code에 내장된 현존 최강의 파일 검색 엔진 활용 |
| **Git** | **Native Git** | VS Code의 Git 연동 기능을 간소화 및 자동화하여 사용 |
| **Backend** | **GitHub** | 사용자의 GitHub 저장소를 백엔드(저장소)로 직접 활용 |

---

## 3. 사용자 경험 (UX)

### Phase 1: 개발 도구가 아닌 "노트 앱"

- **개발자 UI 제거:** 하단 상태바, 액티비티 바, 디버그 메뉴 등을 숨기거나 제거하여 깔끔한 글쓰기 환경 제공.
- **Title Explorer:** 파일명(`2025-12-07.md`)이 아닌 문서 내의 `# 제목`을 파싱하여 사이드바에 표시.

### Phase 2: Milkdown 에디터 통합

- `.md` 파일을 열면 딱딱한 텍스트 에디터 대신, **Milkdown UI**가 즉시 로드됩니다.
- 슬래시 커맨드(`/`), 블록 편집 등 Notion과 유사한 사용자 경험을 제공합니다.

### Phase 3: AI Agent와의 협업

- **"문서 수정해줘":** 채팅창에서 명령하면 AI가 현재 열려있는 문서를 직접 수정(Edit)합니다.
- **충돌 해결:** Git 충돌 발생 시 AI가 3가지 해결책을 제시하고 자동으로 병합합니다.

---

## 4. 구현 목표 (Roadmap) & TODO

개발 효율성을 위해 연관된 작업들을 그룹화하여 진행합니다. 각 단계는 독립적인 POC 브랜치에서 진행 후 통합됩니다.

### 🏗️ Phase 1: Foundation (Diet & Cleanup)
> **Branch:** `poc/foundation`
> **Goal:** VS Code를 가볍고 깔끔한 "빈 캔버스"로 만들기

- [x] **Setup:** VS Code 소스 코드 포크 및 빌드 환경 구성
- [x] **Product:** `product.json` 수정 (브랜딩 변경: Code OSS -> Gitbbon)
- [ ] **Branding:** 아이콘, 로고 및 윈도우 타이틀 등 시각적 요소 전면 교체 (`poc/branding`)
- [ ] **Remove Developer UI:** 디버그 패널 (`poc/remove-dev-ui`)
- [ ] **Remove Built-in Extensions:** TypeScript, Debug, Emmet 등 노트 앱에 불필요한 내장 확장 제거 (`poc/remove-builtin-extensions`)
- [x] **Clean Menus:** 상단 메뉴(Run, Terminal, Go) 및 컨텍스트 메뉴에서 개발 관련 항목 제거 (`poc/clean-menus`)
- [ ] **Cleanup Commands & Keybindings:** 개발자용 명령어 및 단축키 제거/숨김 (`poc/remove-dev-commands`)
- [ ] **Disable External Services:** 마켓플레이스 접근 차단 및 텔레메트리(추적) 비활성화 (`poc/disable-external-services`)

#### 📉 Diet Report (Size Reduction)

용량에 영향을 미치는 작업(Diet Architecture 등)을 수행한 후에는 반드시 빌드를 실행하여 용량 절감 효과를 측정하고, 아래 표에 기록해주세요. (자랑 시간! 🎉)

| 작업명 (PR/Commit) | 이전 용량 (App/Installer) | 이후 용량 | 감소량 | 비고 |
| --- | --- | --- | --- | --- |
| 예: Remove Built-in Extensions | 200MB | 150MB | -50MB | - |

### ✍️ Phase 2: Editor & UX (Write Experience)
> **Branch:** `poc/editor-ux`
> **Goal:** 마크다운에 최적화된 저작 환경 구축

- [x] **Custom Editor (Milkdown):** `.md` 파일을 위한 WYSIWYG 에디터 통합 (`poc/custom-editor`)
  - [x] YAML Frontmatter 파싱 및 폼 UI 제공
  - [x] Milkdown 에디터 임베딩
- [x] **Title Explorer:** 파일명 대신 YAML Frontmatter의 `title`을 보여주는 탐색기 구현 (`poc/title-explorer`)
- [ ] **Welcome Experience:** 초기 실행 시 복잡한 "Get Started" 대신 심플한 "새 노트 만들기" 화면 제공 (`poc/welcome-experience`)

### 🧠 Phase 3: Engine (Git & AI)
> **Branch:** `poc/engine`
> **Goal:** 보이지 않는 Git과 똑똑한 AI 조수

- [x] **Project Management:** GitHub 연동 및 `~/Gitbbon_Notes` 자동 관리 (`poc/project-management`)
- [ ] **Invisible Git:** 백그라운드 자동 커밋 및 GitHub 동기화 구현 (`poc/git-automation`)
- [ ] **AI Agent:** Chat Participant API를 활용한 문서 수정 및 충돌 해결 에이전트 (`poc/ai-agent`)

---

## 5. 빌드 및 실행 (Build & Run)

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

---

## 6. 비즈니스 모델: "The Freedom Strategy"

사용자의 데이터를 볼모로 잡지 않습니다.

1. **Zero Lock-in:** 처음부터 사용자의 GitHub 저장소를 사용하므로, 언제든 Gitbbon을 떠나도 데이터는 온전히 사용자의 깃허브에 남습니다.
2. **Freemium:** 기본 기능은 무료이며, 고급 AI 기능(문서 자동 수정, 충돌 해결 등) 사용 시 과금합니다.
3. **Long-term Goal:** 자체 저장소 호스팅 서비스는 장기 과제로 검토합니다.

---

### AI Agent 작업 지침

자세한 에이전트 실행 지침은 [AGENTS.md](AGENTS.md)를 참고하세요.

---

## 8. 기여하기 (Contributing)

Gitbbon은 오픈소스 프로젝트입니다. 하지만 VS Code의 방대한 코드를 직접 수정하는 PR보다는, `extensions/gitbbon-core` 내부의 기능을 개선하는 PR을 환영합니다.

1. Issue 생성 후 논의
2. Fork & Branch 생성
3. PR 제출

---

## 라이선스

이 프로젝트는 [MIT License](https://www.google.com/search?q=LICENSE)를 따르며, Microsoft VS Code의 원본 라이선스 정책을 준수합니다.
(Original Copyright Microsoft Corporation)
