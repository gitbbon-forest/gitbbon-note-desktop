# Gitbbon 자동 업데이트 시스템 가이드

## 📋 목차
1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [GitHub Actions 워크플로우](#github-actions-워크플로우)
4. [자동 업데이트 서비스](#자동-업데이트-서비스)
5. [릴리스 프로세스](#릴리스-프로세스)
6. [메인 프로세스 통합](#메인-프로세스-통합)
7. [문제 해결](#문제-해결)

---

## 개요

Gitbbon은 **VS Code OSS의 Gulp 빌드 시스템**과 **Electron Updater**를 조합하여 자동 업데이트를 구현합니다.

### 주요 특징
- ✅ VS Code의 검증된 Gulp 빌드 시스템 활용
- ✅ GitHub Actions를 통한 운영체제별 자동 빌드
- ✅ GitHub Releases를 통한 배포
- ✅ Electron Updater를 통한 자동 업데이트

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    자동 업데이트 흐름                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [개발자]                                                    │
│     │                                                        │
│     │ git tag v1.X.X && git push origin v1.X.X              │
│     ▼                                                        │
│  [GitHub Actions]                                            │
│     │                                                        │
│     ├── npm run gulp vscode-darwin-x64-min                  │
│     ├── npm run gulp vscode-darwin-arm64-min                │
│     ├── npm run gulp vscode-win32-x64-min                   │
│     └── npm run gulp vscode-linux-x64-min                   │
│     │                                                        │
│     ▼                                                        │
│  [GitHub Releases]                                           │
│     │                                                        │
│     ├── VSCode-darwin-universal.zip + latest-mac.yml        │
│     ├── VSCode-win32-x64.zip + latest.yml                   │
│     └── VSCode-linux-x64.tar.gz + latest-linux.yml          │
│     │                                                        │
│     ▼                                                        │
│  [사용자 앱 - Electron Updater]                              │
│     │                                                        │
│     └── 자동 업데이트 확인 → 다운로드 → 설치                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## GitHub Actions 워크플로우

### 파일 위치
`.github/workflows/build-release.yml`

### 트리거 조건
```yaml
on:
  push:
    tags:
      - 'v*.*.*'  # v1.0.0, v1.108.0 등
  workflow_dispatch:  # 수동 실행
```

### 빌드 프로세스

| OS | Gulp 태스크 | 출력 파일 |
|----|-------------|-----------|
| macOS | `vscode-darwin-x64-min`, `vscode-darwin-arm64-min` | `VSCode-darwin-universal.zip` |
| Windows | `vscode-win32-x64-min` | `VSCode-win32-x64.zip` |
| Linux | `vscode-linux-x64-min` | `VSCode-linux-x64.tar.gz` |

### 자동 생성되는 메타데이터 파일
- `latest-mac.yml` - macOS 업데이트 정보
- `latest.yml` - Windows 업데이트 정보
- `latest-linux.yml` - Linux 업데이트 정보

---

## 자동 업데이트 서비스

### 파일 위치
`src/vs/platform/update/electron-main/autoUpdateService.ts`

### 주요 기능
```typescript
class AutoUpdateService {
  // 4시간마다 업데이트 확인
  private readonly CHECK_INTERVAL = 1000 * 60 * 60 * 4;

  // 앱 시작 5초 후 첫 업데이트 확인
  private startUpdateCheck(): void {
    setTimeout(() => this.checkForUpdates(), 5000);
  }

  // 사용자에게 업데이트 알림
  private showUpdateAvailableDialog(): Promise<void>;

  // 다운로드 완료 후 재시작 옵션 제공
  private showUpdateDownloadedDialog(): Promise<void>;
}
```

### 업데이트 흐름
1. 앱 시작 5초 후 첫 업데이트 확인
2. 이후 4시간마다 자동 확인
3. 새 버전 발견 시 사용자에게 다이얼로그 표시
4. 사용자 승인 후 백그라운드 다운로드
5. 다운로드 완료 후 재시작 옵션 제공

---

## 릴리스 프로세스

### 1. 버전 업데이트
```bash
# package.json에서 버전 수정
# "version": "1.109.0"
```

### 2. 변경사항 커밋
```bash
git add .
git commit -m "chore: bump version to 1.109.0"
```

### 3. 태그 생성 및 푸시
```bash
# ⚠️ 'v' 접두사 필수!
git tag v1.109.0
git push origin main
git push origin v1.109.0
```

### 4. GitHub Actions 확인
1. GitHub 저장소 → Actions 탭
2. "Build and Release" 워크플로우 실행 확인
3. 세 가지 OS 빌드 모두 성공 확인 (✅ 표시)

### 5. Release 확인
1. GitHub 저장소 → Releases 탭
2. 새 릴리스가 자동 생성되었는지 확인
3. 다음 파일들이 업로드되었는지 확인:
   - `VSCode-darwin-universal.zip`, `latest-mac.yml`
   - `VSCode-win32-x64.zip`, `latest.yml`
   - `VSCode-linux-x64.tar.gz`, `latest-linux.yml`

---

## 메인 프로세스 통합

`src/main.ts`에 AutoUpdateService를 통합하는 방법:

### 1. Import 추가
```typescript
import { AutoUpdateService } from './vs/platform/update/electron-main/autoUpdateService.js';
```

### 2. 전역 변수 선언
```typescript
let autoUpdateService: AutoUpdateService | undefined;
```

### 3. 초기화 (앱이 준비된 후)
```typescript
// startup 함수 내부 또는 적절한 위치에서
if (app.isPackaged) {
  autoUpdateService = new AutoUpdateService(logService, mainWindow);
  logService.info('[Main] AutoUpdateService initialized');
}
```

### 4. 앱 종료 시 정리
```typescript
app.on('will-quit', () => {
  if (autoUpdateService) {
    autoUpdateService.dispose();
    autoUpdateService = undefined;
  }
});
```

---

## 문제 해결

### 빌드 실패

**증상**: GitHub Actions에서 빌드 실패
**해결**:
1. Actions 탭에서 로그 확인
2. 로컬에서 테스트:
   ```bash
   npm run gulp vscode-darwin-arm64-min
   ```
3. 의존성 문제 시 `npm ci` 재실행

### 업데이트 확인 안됨

**증상**: 앱에서 업데이트를 감지하지 못함
**해결**:
1. 앱이 프로덕션 빌드인지 확인 (`app.isPackaged === true`)
2. GitHub Release에 `latest-*.yml` 파일이 있는지 확인
3. 네트워크 연결 확인
4. 개발자 도구에서 콘솔 로그 확인

### macOS 서명 문제

**증상**: "앱이 손상되었습니다" 오류
**해결**:
```bash
# 임시 해결
sudo xattr -cr /Applications/Gitbbon.app

# 또는
sudo spctl --master-disable
```

### Windows SmartScreen

**증상**: "알 수 없는 게시자" 경고
**해결**: 사용자에게 "추가 정보" → "실행" 클릭 안내

---

## 주요 파일 목록

| 파일 | 설명 |
|------|------|
| `.github/workflows/build-release.yml` | GitHub Actions 빌드 워크플로우 |
| `src/vs/platform/update/electron-main/autoUpdateService.ts` | 자동 업데이트 서비스 |
| `package.json` | electron-updater 의존성 포함 |

---

## 참고 자료

- [Electron Updater 문서](https://www.electron.build/auto-update)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
- [VS Code 빌드 시스템](https://github.com/microsoft/vscode/wiki/How-to-Contribute)

---

**최종 업데이트**: 2025-12-15
