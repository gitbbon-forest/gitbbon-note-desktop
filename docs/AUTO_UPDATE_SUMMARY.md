# Gitbbon 자동 업데이트 시스템 - 구현 완료

## ✅ 구현된 기능

### 1. GitHub Actions 빌드 자동화
- **파일**: `.github/workflows/build-release.yml`
- **트리거**: `v*.*.*` 형식의 Git 태그 푸시
- **빌드 대상**:
  - macOS Universal (x64 + ARM64)
  - Windows x64
  - Linux x64

### 2. Electron Updater 서비스
- **파일**: `src/vs/platform/update/electron-main/autoUpdateService.ts`
- **기능**:
  - 4시간마다 자동 업데이트 확인
  - 사용자 친화적인 다이얼로그 알림
  - 백그라운드 다운로드
  - 재시작 후 자동 설치

---

## 📦 최종 파일 구조

```
git-note/
├── .github/
│   └── workflows/
│       └── build-release.yml          # Gulp 기반 빌드 워크플로우
├── src/
│   └── vs/
│       └── platform/
│           └── update/
│               └── electron-main/
│                   └── autoUpdateService.ts  # 자동 업데이트 서비스
├── docs/
│   ├── AUTO_UPDATE_GUIDE.md           # 상세 가이드
│   └── AUTO_UPDATE_SUMMARY.md         # 이 문서
└── package.json                        # electron-updater 의존성 포함
```

---

## 🚀 릴리스 방법

```bash
# 1. 버전 업데이트 (package.json)
# 2. 커밋
git add .
git commit -m "chore: bump version to 1.X.X"

# 3. 태그 생성 및 푸시
git tag v1.X.X
git push origin main
git push origin v1.X.X

# 4. GitHub Actions가 자동으로:
#    - 세 가지 OS에서 빌드
#    - GitHub Release 생성
#    - 빌드 파일 업로드
```

---

## 📊 빌드 결과물

| OS | 파일 | 메타데이터 |
|----|------|------------|
| macOS | `VSCode-darwin-universal.zip` | `latest-mac.yml` |
| Windows | `VSCode-win32-x64.zip` | `latest.yml` |
| Linux | `VSCode-linux-x64.tar.gz` | `latest-linux.yml` |

---

## ⚠️ 주의사항

1. **태그 형식**: 반드시 `v` 접두사 사용 (예: `v1.108.0`)
2. **첫 릴리스**: 자동 업데이트는 두 번째 릴리스부터 작동
3. **개발 모드**: `npm run start`로 실행 시 자동 업데이트 비활성화
4. **GitHub 권한**: Workflow에 write 권한 필요 (Settings → Actions → General)

---

## 📚 다음 단계

1. **메인 프로세스 통합**
   - `src/main.ts`에 AutoUpdateService import
   - 앱 시작 시 초기화
   - 상세 방법: `docs/AUTO_UPDATE_GUIDE.md` 참조

2. **첫 릴리스 테스트**
   - 태그 푸시 후 GitHub Actions 확인
   - Releases 페이지에서 파일 확인

---

**구현 완료일**: 2025-12-15
