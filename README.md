# Gitbbon

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
| **Git** | **Dugite** | Embedded Git 바이너리로 시스템 의존성 없이 Git 기능 제공 |
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

### 저장 메커니즘과 타임머신 (Save & Time Machine)

**"자동 저장의 편의성"과 "수동 커밋의 명확성"을 조화롭게 통합했습니다.**

1.  **3-Layer Save System**
    -   **Auto Save (Local):** 0.5초 간격으로 파일 시스템에 즉시 저장.
    -   **Auto Commit (Local Git):** 3초간 입력이 없거나(Idle) 에디터 종료 시 `branch/autosave`에 임시 기록.
    -   **Really Final (Cloud Sync):** "진짜최종" 버튼을 누르면 그동안의 작업을 하나로 묶어 `main` 브랜치에 확정합니다.
    -   **GitHub 동기화:** "진짜최종" 커밋 후 자동으로 GitHub에 업로드됩니다. 또한 30분 주기로 자동 동기화가 수행되며, 상태바의 "Sync" 버튼으로 수동 동기화도 가능합니다.

2.  **"진짜최종" 버튼 (The Button)**
    -   에디터 우측 하단 플로팅 버튼. 직관적인 LED 램프로 현재 상태를 알립니다.
        -   🔴 **Red:** 저장 전.
        -   🟡 **Yellow:** 자동 저장은 되었으나 "진짜최종" 아님. (안전하지만 업로드 전)
        -   🟢 **Green:** 모든 작업이 안전하게 보관됨.
    -   **Algorithm:** 버튼 클릭 시 Index를 스냅샷으로 `main` 브랜치에 커밋(Squash 효과)하고 HEAD를 이동시켜 깔끔한 이력을 유지합니다.

3.  **타임머신 & 평행 우주 (Time Machine & Branching)**
    -   **Time Slider:** 버튼에 마우스를 올리면 과거의 "진짜최종" 시점으로 여행할 수 있는 슬라이더가 펼쳐집니다.
    -   **Parallel Universe:** 과거 시점에서 문서를 수정하면 새로운 브랜치(평행 우주)가 생성됩니다.
    -   **AI Conflict Resolution:** 현재 시점(`main`)으로 합칠 때 충돌이 발생하면 AI가 중재하고, 필요시 대화를 통해 해결합니다.

### 프로젝트 관리 정책 (Project Policy)

사용자가 파일 시스템을 직접 관리하는 부담을 줄이기 위해 다음과 같은 정책을 수행합니다.

- **Root Directory:** 모든 프로젝트는 `~/Documents/Gitbbon_Notes` 하위에서 관리됩니다.
- **Tracking & Context:** `.gitbbon-local.json`을 통해 동기화 기록(`syncedAt`)을 추적합니다.
- **Auto Restore:** 앱 실행 시, 마지막으로 작업했던 프로젝트를 자동으로 불러옵니다.
- **Silent Init:** 프로젝트 생성 시 `git init`을 백그라운드에서 수행하여 즉시 버전 관리를 시작합니다.
- **Project Switcher:** 사이드바 상단에 드롭다운 셀렉터가 표시되어 프로젝트 간 빠른 전환이 가능합니다.

### 설정 파일 구조 (Configuration Files)

**`.gitbbon.json` (각 프로젝트 내부, 동기화됨):**
```json
{
  "name": "default",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**`.gitbbon-local.json` (Gitbbon_Notes 루트, 로컬 전용):**
```json
{
  "projects": {
    "gitbbon-note-default": { "syncedAt": "2024-12-27T00:00:00.000Z" }
  }
}
```

### 동기화 정책 및 메커니즘 (Sync Policy & Mechanism)

Gitbbon은 **SyncEngine**을 통해 로컬 프로젝트와 GitHub 원격 저장소 간의 일관성을 자동으로 관리합니다. 사용자는 복잡한 Git 명령어를 몰라도, 아래 6가지 시나리오에 따라 자동으로 동기화가 처리됩니다.

#### 상태 추적 (State Tracking)

동기화 정책은 두 가지 메타데이터를 사용하여 프로젝트 상태를 판단합니다:

- **`syncedAt`** (`.gitbbon-local.json`): 마지막으로 GitHub와 성공적으로 동기화된 시점
- **`modifiedAt`** (`.gitbbon-local.json`): 로컬에서 마지막으로 수정된 시점

#### 6가지 동기화 시나리오 (Sync Scenarios)

**1. 원격 저장소 삭제 감지 (Remote Deleted)**
- **상태:** `syncedAt` 있음 + 원격 저장소 없음
- **동작:** 사용자에게 확인 후
  - **삭제 동의:** 로컬 프로젝트를 휴지통으로 이동
  - **보존 선택:** 원격 저장소를 재생성하고 로컬 내용을 푸시하여 복구
- **의도:** 원격에서 의도적으로 삭제된 경우, 로컬도 정리하되 실수로 삭제된 경우 복구 가능

**2. 정상 동기화 (Normal Sync)**
- **상태:** `syncedAt` 있음 + 원격 저장소 있음
- **동작:** `git pull` 후 `git push` 실행 (양방향 동기화)
- **의도:** 이미 동기화된 프로젝트의 변경사항을 로컬과 원격 간에 양방향으로 동기화

**3. 첫 동기화 (First Sync)**
- **상태:** `syncedAt` 없음 + 원격 저장소 없음
- **동작:** GitHub에 새 저장소 생성 후 로컬 프로젝트 푸시
- **의도:** 로컬에서 새로 만든 프로젝트를 GitHub에 백업

**4. 충돌 해결: 이름이 같은 로컬 수정본 (Local Conflict with Modifications)**
- **상태:** `syncedAt` 없음 + `modifiedAt` 있음 + 원격 저장소 있음 (이름 동일)
- **동작:** 로컬 프로젝트 이름에 타임스탬프 추가 후 변경 → 새 원격 저장소 생성 및 푸시
- **예시:** `my-note` → `my-note-2025-12-30T15-30-00-000Z`
- **의도:** 다른 기기에서 이미 생성된 원격 저장소와 로컬 수정본이 충돌할 때, 둘 다 보존

**5. 충돌 해결: 이름이 같은 빈 로컬본 (Local Conflict without Modifications)**
- **상태:** `syncedAt` 없음 + `modifiedAt` 없음 + 원격 저장소 있음 (이름 동일)
- **동작:** 로컬 빈 폴더 삭제 후 원격 저장소를 클론
- **의도:** 로컬에 내용이 없는 경우(값 없는 폴더), 원격 저장소를 우선

**6. 원격 전용 다운로드 (Remote Only)**
- **상태:** 원격 저장소 있음 + 로컬 프로젝트 없음
- **동작:** `~/Documents/Gitbbon_Notes/`에 원격 저장소 클론
- **의도:** 다른 기기에서 생성한 프로젝트를 현재 기기로 가져오기

#### 사용자 확인 대화상자 (User Confirmation)

시나리오 1(원격 삭제)에서만 사용자 확인이 필요합니다:
- **"Delete"**: 로컬 프로젝트를 휴지통으로 이동
- **"Keep"**: 원격 저장소를 재생성하여 로컬 내용 보존
- **"Visit Remote"**: 브라우저에서 GitHub 저장소를 열어 확인 후 결정

#### 동기화 흐름 (Sync Flow)

```
GitHubSyncManager.sync()
  │
  ├── 1. 인증 확인 (GitHub Authentication)
  │
  ├── 2. Up Sync (로컬 → 원격)
  │   └── 각 로컬 프로젝트에 대해 SyncEngine.syncProject() 실행
  │       └── 6가지 시나리오 중 하나로 자동 처리
  │
  └── 3. Down Sync (원격 → 로컬)
      └── 로컬에 없는 원격 저장소를 자동으로 다운로드
```

#### 자동 동기화 트리거 (Auto Sync Triggers)

1. **진짜최종 커밋 후:** 즉시 동기화
2. **30분 주기:** 백그라운드에서 자동 동기화 (Silent 모드)
3. **수동:** 상태바의 "Sync" 버튼 클릭

#### 설정 파일 구조 (Configuration Files)

**`.gitbbon.json`** (프로젝트 내부, Git 추적됨):
```json
{
  "title": "내 프로젝트"
}
```

**`.gitbbon-local.json`** (`~/Documents/Gitbbon_Notes/`, 로컬 전용):
```json
{
  "projects": {
    "gitbbon-note-my-project": {
      "syncedAt": "2025-12-30T15:30:00.000Z",
      "lastModified": "2025-12-30T15:45:00.000Z"
    }
  }
}
```

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
- [x] **Invisible Git:** 백그라운드 자동 커밋 및 GitHub 동기화 구현 (`poc/git-automation`)
  - [x] 3-Layer Save System (Auto Save, Auto Commit, Really Final)
  - [x] GitHub 자동 동기화 (진짜최종 후, 30분 주기, 수동 Sync)
  - [x] Git Graph 시각화 (커밋 히스토리 뷰)
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

# 4. Watch + 자동 실행 (권장)
npm run dev

# 또는 별도로 실행
# 4-1. Watch 시작 (백그라운드 데몬)
npm run watchd

# 4-2. Electron 실행 (컴파일 완료 후)
npm run start
```

`npm run dev`는 `out/main.js`를 삭제한 뒤 watch 데몬을 시작하고, 컴파일이 완료되면 자동으로 앱을 실행합니다.

### 디버깅 모드 실행 (Debugging)

개발 중 디버깅이 필요한 경우(Breakpoints, Inspect 등) 다음 명령어로 실행하세요.

```bash
npm run start:debug
```

앱이 실행되면 **VS Code의 "실행 및 디버그" (Run and Debug)** 사이드바에서 **`Attach All`** 구성을 선택하고 `F5`를 눌러 디버거를 연결합니다.
- **Core Process (Main)**
- **Extension Host (Extension)**
- **Renderer Process (UI/Frontend)**
위 3가지 프로세스에 모두 동시에 연결됩니다.

### 프로덕션 빌드 (배포용)

```bash
# macOS (Apple Silicon)
npm run gulp vscode-darwin-arm64-min

# macOS (Intel)
npm run gulp vscode-darwin-x64-min

# Windows
npm run gulp vscode-win32-x64-min
```

### 릴리스 (Release)

Gitbbon은 **GitHub Actions**를 통한 자동 릴리스 시스템을 사용합니다.

#### 릴리스 정책

| 릴리스 타입 | 태그 형식 | 자동 업데이트 | 용도 |
|------------|----------|--------------|------|
| **정식 릴리스** | `v1.0.0` | ✅ 대상 | 안정된 기능 배포 |
| **Pre-release** | `v1.0.0-beta.1` | ❌ 제외 | 테스트 및 검증용 |

#### 릴리스 방법

**정식 릴리스:**
```bash
npm run release
# 버전 입력 → CHANGELOG 자동 생성 → 태그 푸시 → GitHub Actions 빌드
```

**테스트용 Pre-release:**
```bash
npm run pre-release
# 베타 태그 생성 (v1.0.0-beta.1) → GitHub Actions 빌드
# 사용자 자동 업데이트 대상에서 제외됨
```

#### 지원 플랫폼

| 플랫폼 | 아티팩트 |
|--------|----------|
| macOS (Apple Silicon) | `gitbbon-darwin-arm64.zip` |
| macOS (Intel) | `gitbbon-darwin-x64.zip` |
| Windows | `gitbbon-win32-x64.zip` |
| Linux | `gitbbon-linux-x64.tar.gz` |

#### 빌드 상태 확인

릴리스 빌드 진행 상황은 [GitHub Actions](https://github.com/gitbbon-forest/gitbbon-note-desktop/actions)에서 확인할 수 있습니다.

 ## 6. 비즈니스 모델: "The Freedom Strategy"

 사용자의 데이터를 볼모로 잡지 않습니다.

 1. **Zero Lock-in:** 처음부터 사용자의 GitHub 저장소를 사용하므로, 언제든 Gitbbon을 떠나도 데이터는 온전히 사용자의 깃허브에 남습니다.
 2. **Freemium:** 기본 기능은 무료이며, 고급 AI 기능(문서 자동 수정, 충돌 해결 등) 사용 시 과금합니다.
 3. **Long-term Goal:** 자체 저장소 호스팅 서비스는 장기 과제로 검토합니다.

 ---

 ## 7. 환경 설정 (Environment Setup)

 Gitbbon의 AI 기능(Chat, 자동 커밋 메시지 등)을 사용하려면 API 키 설정이 필요합니다.

 1. **Vercel AI SDK** 호환 API 키 준비 (예: Anthropic API Key)
 2. 각 확장 프로그램 디렉토리의 `.env.template` 파일을 `.env`로 복사하고 키를 입력하세요.

 ```bash
 # gitbbon-chat (AI 채팅)
 cp extensions/gitbbon-chat/.env.template extensions/gitbbon-chat/.env

 # gitbbon-manager (자동 커밋 메시지)
 cp extensions/gitbbon-manager/.env.template extensions/gitbbon-manager/.env
 ```

 **extensions/gitbbon-chat/.env 예시:**
 ```env
 AI_GATEWAY_API_KEY=sk-ant-api03-...
 ```

 ---

 ## 8. 내장 확장 프로그램 (Built-in Extensions)

 Gitbbon은 코어 기능을 모듈화하여 다음 확장 프로그램으로 구성됩니다:

### 📦 gitbbon-manager

**위치:** `extensions/gitbbon-manager`

프로젝트 관리 및 Git 자동화를 담당하는 핵심 확장 프로그램입니다.

**주요 기능:**
- **Project Manager:** `~/Documents/Gitbbon_Notes` 내 프로젝트 자동 관리
- **3-Layer Save System:** Auto Save → Auto Commit → Really Final
- **GitHub Sync Manager:** GitHub 인증 및 자동 동기화
  - 진짜최종 커밋 후 자동 업로드
  - 30분 주기 자동 동기화 (Silent 모드)
  - 상태바 Sync 버튼으로 수동 동기화
- **Git Graph View:** 커밋 히스토리 시각화 (브랜치, 시간, 메시지)

**명령어:**
- `gitbbon.manager.initialize` - 프로젝트 초기화
- `gitbbon.manager.autoCommit` - Auto Commit 실행
- `gitbbon.manager.reallyFinal` - 진짜최종 커밋
- `gitbbon.manager.sync` - GitHub 동기화

### ✍️ gitbbon-editor

**위치:** `extensions/gitbbon-editor`

마크다운 파일을 위한 WYSIWYG 에디터를 제공합니다.

**주요 기능:**
- **Milkdown 통합:** `.md` 파일을 Notion 스타일 에디터로 표시
- **YAML Frontmatter 지원:** 제목, 태그 등 메타데이터 관리
- **슬래시 커맨드:** `/` 입력으로 블록 삽입

**개발 명령어:**
```bash
# 확장 프로그램 빌드 (watch 모드)
cd extensions/gitbbon-manager
npm run watch

cd extensions/gitbbon-editor
npm run watch
```

### 🔍 gitbbon-search

**위치:** `extensions/gitbbon-search`

AI 기반 시맨틱 검색을 제공하는 확장 프로그램입니다.

**주요 기능:**
- **시맨틱 검색:** E5-Small 모델을 활용한 의미 기반 문서 검색
- **벡터 인덱싱:** 마크다운 파일 자동 임베딩 및 캐싱
- **WebGPU 가속:** 가능한 경우 GPU를 활용한 빠른 추론

**로깅 구조:**
웹뷰(modelHost)에서 발생하는 로그는 VS Code의 Output 채널로 직접 전달할 수 없습니다.
따라서 중요 로그만 `sendLog()` 함수를 통해 익스텐션에 메시지로 전달하고,
익스텐션이 이를 받아 `logService`(Output 채널)에 기록합니다.

```typescript
// modelHost.ts - 웹뷰에서 중요 로그만 익스텐션으로 전달
sendLog('info', '[modelHost] Model initialized');
sendLog('error', '[modelHost] Loading failed: ...');

// extension.ts - 수신 후 Output 채널에 기록
case 'consoleLog':
  logService.info(message.message);
  break;
```

**개발 명령어:**
```bash
cd extensions/gitbbon-search
npm run watch
```

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
