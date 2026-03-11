# GitHub 동기화 정책

## 1. 개요

Gitbbon Manager 확장은 사용자의 노트 프로젝트를 GitHub 원격 저장소와 자동으로 동기화합니다. 동기화의 핵심 설계 철학은 다음과 같습니다.

- **무손실 원칙**: 사용자의 데이터가 유실되지 않도록 충돌 시 로컬 데이터를 보존합니다.
- **자동화 우선**: 사용자가 명시적으로 동기화를 트리거하지 않아도 백그라운드에서 자동으로 동기화합니다.
- **Silent/Interactive 이중 모드**: 자동 동기화는 Silent 모드로 동작하여 사용자를 방해하지 않고, 수동 동기화는 Interactive 모드로 동작하여 인증 프롬프트 등을 표시합니다.

### 주요 구성 요소

| 컴포넌트 | 파일 | 역할 |
|---|---|---|
| `GitHubSyncManager` | `src/githubSyncManager.ts` | 동기화 오케스트레이터. 인증 확인, Up Sync, Down Sync를 순서대로 실행 |
| `SyncEngine` | `src/sync/syncEngine.ts` | 6가지 동기화 시나리오 판단 및 실행 |
| `GitHubService` | `src/sync/adapters/githubService.ts` | GitHub REST API 호출 (저장소 CRUD) |
| `LocalProjectService` | `src/sync/adapters/localProjectService.ts` | 로컬 Git 작업 (clone, push, pull, rename 등) |
| `ProjectManager` | `src/projectManager.ts` | 프로젝트 생명주기 관리, 설정 파일 읽기/쓰기 |

---

## 2. 자동 푸시 정책

사용자가 명시적으로 커밋("진짜최종") 했을 때 GitHub에 자동으로 푸시합니다.

### 트리거 지점

**`extension.ts`의 `gitbbon.manager.reallyFinal` 커맨드** (라인 106~138):

```
reallyFinalCommit() 성공 시:
  -> githubSyncManager.sync(true)  // Silent 모드로 동기화
```

`reallyFinalCommit()`이 성공하면(`result.success === true`), `githubSyncManager.sync(true)`를 비동기적으로(fire-and-forget) 호출합니다. 이때 `.then()`/`.catch()` 패턴을 사용하여 동기화 실패가 커밋 결과에 영향을 주지 않습니다.

### .gitbbon.json 변경 시 자동 푸시

**`extension.ts`의 `configWatcher`** (라인 29~44):

`.gitbbon.json` 파일이 변경되거나 생성되면:
1. `projectManager.commitProjectConfig()`으로 변경사항을 커밋합니다.
2. `githubSyncManager.sync(true)`로 Silent 동기화를 트리거합니다.

### 동기화 흐름 (`GitHubSyncManager.sync()`)

`githubSyncManager.sync(silent)` 호출 시:

1. `githubService.ensureAuthenticated(silent)` - 인증 확인
2. `githubService.listRepositories()` - 원격 저장소 목록 조회 (1회 일괄 조회)
3. **Up Sync** (`syncUp`) - 모든 로컬 프로젝트를 순회하며 `SyncEngine.syncProject()` 실행
4. **Down Sync** (`syncDown`) - 원격에만 존재하는 저장소를 로컬에 클론

---

## 3. 주기적 동기화 정책

### 30분 간격 Silent 동기화

**`extension.ts`** (라인 228~237):

```typescript
setInterval(() => {
    githubSyncManager.sync(true) // Silent 모드
}, 30 * 60 * 1000); // 30분
```

- **주기**: 30분 (1,800,000ms)
- **모드**: Silent (`silent = true`)
- **동작**: `setInterval`로 등록되며, 확장 비활성화 시 `clearInterval`로 정리됩니다.
- **실패 처리**: 동기화 실패 시 로그만 기록하고 다음 주기에 재시도합니다.
- **인증 미완료 시**: Silent 모드이므로 인증 프롬프트 없이 동기화를 건너뜁니다.

### 시작 시 동기화

**`extension.ts`** (라인 253~261):

확장 활성화 후 `projectManager.startup()` 완료 시 Silent 모드로 동기화를 1회 실행합니다. 사용자가 이전에 인증한 적이 없으면 아무 동작도 하지 않습니다.

### 수동 동기화

**`extension.ts`의 `gitbbon.manager.sync` 커맨드** (라인 56~80):

상태 바의 "Sync" 버튼 클릭 시 Interactive 모드(`silent = false`)로 동기화합니다.
- 동기화 중: 스피너 표시 `$(sync~spin) Syncing...`
- 성공: 3초간 `$(check) Synced` 표시 후 원래 상태로 복원
- 실패: 5초간 `$(error) Sync Failed` 표시 후 원래 상태로 복원

---

## 4. 원격 저장소 자동 생성 정책

### 저장소 네이밍 규칙

- 저장소 이름은 프로젝트 디렉토리명과 동일합니다 (`path.basename(project.path)`).
- 디렉토리명 생성 규칙 (`ProjectManager.generateSafeRepoName()`):
  - 영문 입력: `gitbbon-note-{입력값}` (공백을 `-`로 변환, 특수문자 제거)
  - 비영문 입력: `gitbbon-note-{자동증가번호}` (기존 숫자 프로젝트 중 최대값 + 1)
  - 충돌 시: `gitbbon-note-{YYYYMMDDHHMMSS}` 타임스탬프 사용
- 원격 저장소 필터링: `listRepositories()`에서 `gitbbon-note-` 접두사와 매칭되는 저장소만 반환합니다 (`/^gitbbon-note-.+$/`).

### 자동 생성 흐름

새 프로젝트 생성 시 원격 저장소가 없으면 **SyncEngine의 Case 3** 시나리오가 적용됩니다:

1. 사용자가 `gitbbon.manager.addProject` 커맨드로 새 프로젝트 생성
2. `ProjectManager.addNewProject()` -> `initializeProject()` 실행:
   - 디렉토리 생성
   - `git init`
   - `.gitbbon.json` 생성 (title 필드)
   - `.vscode/settings.json` 생성 (파일 숨기기)
   - `.gitignore` 생성 (벡터 캐시 제외)
   - `README.md` 생성
   - 초기 커밋 생성
3. 다음 동기화 주기(또는 수동 동기화)에서 `SyncEngine.syncProject()` 호출
4. `syncedAt`이 없고 원격 저장소도 없으므로 **Case 3** 적용:
   - `remoteService.createRepository(name)` - GitHub에 **비공개** 저장소 생성
   - `localService.pushProject(path, clone_url)` - 로컬 프로젝트를 원격에 푸시

### 원격 저장소 생성 옵션

`GitHubService.createRepository()` (라인 88~118):

```json
{
    "name": "<프로젝트명>",
    "private": true,
    "description": "Created by Gitbbon"
}
```

- **기본 가시성**: `private` (비공개)
- **설명**: "Created by Gitbbon"

---

## 5. 6가지 동기화 시나리오

`SyncEngine` (`src/sync/syncEngine.ts`)은 로컬 프로젝트의 `syncedAt` (동기화 이력), `modifiedAt` (수정 이력), 원격 저장소 존재 여부를 기준으로 6가지 시나리오를 판단합니다.

### 판단 기준

| 조건 | 설명 |
|---|---|
| `config.syncedAt` | `.gitbbon-local.json`에 기록된 마지막 동기화 시각. 있으면 이전에 동기화된 적 있음 |
| `config.modifiedAt` | `.gitbbon-local.json`에 기록된 마지막 수정 시각. 있으면 로컬에서 변경된 적 있음 |
| `remoteRepo` | GitHub에 동일 이름의 저장소 존재 여부 |

### Case 1: 이전에 동기화됨 + 원격 저장소 없음

- **조건**: `syncedAt` 있음 && `remoteRepo` 없음
- **의미**: 이전에 동기화되었으나 원격 저장소가 삭제됨 (다른 기기에서 삭제했을 가능성)
- **동작**:
  1. 사용자에게 로컬 프로젝트 삭제 여부를 묻는 모달 다이얼로그 표시 (`confirmDeletion()`)
  2. **"Delete" 선택**: 로컬 프로젝트를 삭제 (`moveToTrash()` -> `ProjectManager.deleteProject()`)
  3. **"Keep" 선택**: 원격 저장소를 다시 생성하고 로컬 내용을 푸시 (`createRepository()` -> `pushProject()`)

### Case 2: 이전에 동기화됨 + 원격 저장소 있음 (정상 동기화)

- **조건**: `syncedAt` 있음 && `remoteRepo` 있음
- **의미**: 정상적인 동기화 상태
- **동작**: `pullAndPush()` 실행
  1. `git pull origin main` (원격 변경사항 가져오기)
  2. `git push -u origin main` (로컬 변경사항 푸시)
  3. `updateSyncedAt()` (동기화 시각 갱신)

### Case 3: 동기화 이력 없음 + 원격 저장소 없음 (신규 프로젝트)

- **조건**: `syncedAt` 없음 && `remoteRepo` 없음
- **의미**: 새로 생성된 프로젝트이며 원격 저장소도 없음
- **동작**:
  1. `createRepository(name)` - GitHub에 비공개 저장소 생성
  2. `pushProject(path, clone_url)` - remote 설정 후 푸시

### Case 4: 동기화 이력 없음 + 원격 저장소 있음 + 로컬 수정 있음 (이름 충돌, 로컬 보존)

- **조건**: `syncedAt` 없음 && `remoteRepo` 있음 && `modifiedAt` 있음
- **의미**: 로컬에 동일 이름의 프로젝트가 있지만 동기화된 적 없으며, 로컬에서 수정된 내용이 있음. 원격의 것과는 별개의 프로젝트로 판단
- **동작**:
  1. 로컬 프로젝트를 타임스탬프가 포함된 이름으로 변경 (`renameProject()`, `{원래이름}-{ISO타임스탬프}` 형식)
  2. 변경된 이름으로 새 원격 저장소 생성 (`createRepository(newName)`)
  3. 변경된 프로젝트를 새 원격 저장소에 푸시 (`pushProject(newPath, clone_url)`)

### Case 5: 동기화 이력 없음 + 원격 저장소 있음 + 로컬 수정 없음 (로컬 교체)

- **조건**: `syncedAt` 없음 && `remoteRepo` 있음 && `modifiedAt` 없음
- **의미**: 로컬 프로젝트에 의미 있는 변경이 없으므로 원격 버전으로 교체
- **동작**:
  1. 로컬 프로젝트 삭제 (`moveToTrash()`)
  2. 원격 저장소에서 클론 (`cloneProject(clone_url, path)`)
  3. 프로젝트 구조 초기화 및 메타데이터 갱신

### Case 6: 원격에만 존재 (Down Sync)

- **위치**: `SyncEngine.syncRemoteRepo()` 및 `GitHubSyncManager.syncDown()`
- **조건**: 원격 저장소가 존재하지만 로컬에 동일 이름의 프로젝트가 없음
- **의미**: 다른 기기에서 생성된 프로젝트
- **동작**:
  1. 대상 경로 확인: `~/Documents/Gitbbon_Notes/{repo.name}`
  2. 디렉토리가 이미 존재하고 비어있지 않으면 건너뜀 (동기화 루프 방지)
  3. `cloneProject(clone_url, targetPath)` - 원격 저장소를 로컬에 클론
  4. 사용자에게 알림 메시지 표시: `New note "{repo.name}" has been downloaded.`

---

## 6. 인증 흐름

### GitHub OAuth 인증

`GitHubService` (`src/sync/adapters/githubService.ts`)은 VS Code의 내장 인증 API (`vscode.authentication`)를 사용합니다.

### 요청 권한 (OAuth Scopes)

```typescript
['repo', 'user:email', 'delete_repo']
```

| 스코프 | 용도 |
|---|---|
| `repo` | 비공개 저장소 생성, 읽기, 쓰기 |
| `user:email` | 사용자 이메일 정보 접근 |
| `delete_repo` | 저장소 삭제 |

### 인증 단계 (`ensureAuthenticated()`)

1. **기존 세션 확인** (Silent): `vscode.authentication.getSession('github', scopes, { createIfNone: false })`
   - 기존에 인증된 세션이 있으면 재사용합니다.
2. **Silent 모드인 경우**: 기존 세션이 없으면 `false`를 반환하고 동기화를 건너뜁니다.
3. **Interactive 모드인 경우**: `vscode.authentication.getSession('github', scopes, { createIfNone: true })`
   - 사용자에게 GitHub 로그인 프롬프트를 표시합니다.
   - 인증 성공 시 세션을 캐시하고 `true`를 반환합니다.

### 인증 실패 처리

- Silent 모드: 로그만 기록하고 동기화 건너뜀
- Interactive 모드: `vscode.window.showErrorMessage('GitHub Authentication required to sync.')` 표시
- 401 응답 시: 캐시된 세션을 무효화하고 (`this.session = undefined`) 에러를 throw

### API 호출 인증

모든 GitHub API 호출은 `Bearer` 토큰 인증을 사용합니다:

```
Authorization: Bearer {session.accessToken}
Accept: application/vnd.github.v3+json
User-Agent: Gitbbon-Note-App
```

---

## 7. 설정 파일

### .gitbbon.json (공유 설정)

**위치**: 각 프로젝트 디렉토리 루트 (`~/Documents/Gitbbon_Notes/{프로젝트명}/.gitbbon.json`)

Git에 커밋되어 여러 기기 간에 공유되는 설정 파일입니다.

```json
{
    "title": "프로젝트 표시 이름"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `title` | `string` | 프로젝트 표시 이름. UI에서 사용자에게 보이는 이름 |

- 변경 시 `configWatcher`가 감지하여 자동으로 커밋 및 동기화합니다.
- `.vscode/settings.json`의 `files.exclude`로 탐색기에서 숨겨져 있습니다.

### .gitbbon-local.json (로컬 전용 설정)

**위치**: 루트 디렉토리 (`~/Documents/Gitbbon_Notes/.gitbbon-local.json`)

Git에 커밋되지 않으며 현재 기기에서만 유효한 메타데이터 파일입니다.

```json
{
    "projects": {
        "gitbbon-note-example": {
            "syncedAt": "2025-01-01T00:00:00.000Z",
            "lastModified": "2025-01-01T12:00:00.000Z"
        }
    }
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `projects` | `Record<string, ProjectMetadata>` | 키: 프로젝트 디렉토리명 (저장소 이름) |
| `projects[name].syncedAt` | `string \| null` | 마지막 동기화 시각 (ISO 8601). `SyncEngine`이 시나리오 판단에 사용 |
| `projects[name].lastModified` | `string` | 마지막 수정 시각 (ISO 8601). 커밋 시 갱신됨 |

- `syncedAt`은 `pushProject()` 또는 `cloneProject()` 성공 후 `updateSyncedAt()`으로 갱신됩니다.
- `lastModified`는 `autoCommit()` 또는 `reallyFinalCommit()` 성공 후 `updateLastModified()`로 갱신됩니다.
- 프로젝트 삭제 시 `removeFromLocalConfig()`으로 해당 항목이 제거됩니다.

---

## 8. 에러 처리

### 네트워크 에러

- **GitHub API 호출 실패**: `GitHubService`의 각 메서드에서 예외를 throw합니다.
- **Up Sync 중 개별 프로젝트 실패**: `GitHubSyncManager.syncUp()`에서 프로젝트별 try/catch로 감싸져 있어, 하나의 프로젝트 동기화 실패가 다른 프로젝트에 영향을 주지 않습니다.
- **Down Sync 중 개별 저장소 실패**: `GitHubSyncManager.syncDown()`에서 저장소별 try/catch로 감싸져 있어, 하나의 클론 실패가 다른 클론에 영향을 주지 않습니다.

### 인증 실패

- **401 Unauthorized**: `listRepositories()`에서 401 응답 시 캐시된 세션을 무효화(`this.session = undefined`)하고 에러를 throw합니다.
- **세션 만료**: 다음 동기화 시 `getSession()`에서 새 세션 획득을 시도합니다.
- **인증 거부 (사용자가 로그인 취소)**: `ensureAuthenticated()`가 `false`를 반환하여 동기화를 건너뜁니다.

### Silent vs Interactive 에러 표시

| 상황 | Silent 모드 | Interactive 모드 |
|---|---|---|
| 인증 실패 | 로그만 기록, 동기화 건너뜀 | 에러 메시지 표시 |
| 동기화 실패 | 로그만 기록 | `vscode.window.showErrorMessage()` 표시 |
| 동기화 성공 | 로그만 기록 | 상태 바에 3초간 성공 표시 |

### Git 명령어 실패

- `LocalProjectService.execGit()`에서 Git 프로세스의 종료 코드가 0이 아니면 stderr 내용을 포함한 에러를 throw합니다.
- `pushProject()`: remote 연결, 커밋 생성, 푸시 순서로 실행하며, 각 단계에서 실패 시 전체 에러로 전파됩니다.
- `pullAndPush()`: pull 실패 시 push도 실행되지 않습니다.

### 동기화 루프 방지

- `syncDown()`에서 대상 디렉토리가 이미 존재하고 비어있지 않으면 클론을 건너뜁니다.
- `listRepositories()`가 `gitbbon-note-` 접두사를 가진 저장소만 필터링하여 관련 없는 저장소를 무시합니다.

### 프로젝트 삭제 시 원격 저장소 삭제

`extension.ts`의 `gitbbon.manager.deleteProject` 커맨드에서:
1. `deleteRemote` 옵션이 true인 경우 원격 저장소 먼저 삭제 시도
2. 원격 삭제 실패 시 로컬 삭제 중단 (사용자에게 실패 메시지 반환)
3. 원격 삭제 성공 후 로컬 프로젝트 삭제
4. `deleteRepository()`는 404 응답(이미 삭제됨)도 성공으로 처리
