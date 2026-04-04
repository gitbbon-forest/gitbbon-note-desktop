# /test 스킬 — gitbbon 테스트 러너

gitbbon 프로젝트의 테스트를 실행하고, 실패 시 원인을 분석해 코드를 수정한 뒤 재실행하는 루프를 수행한다.

## 사용법

```
/test                          # 등록된 모든 테스트 실행
/test electron                 # Extension Host 테스트 전체
/test electron gitbbon-chat    # gitbbon-chat Extension만
/test smoke                    # Smoke 테스트
/test unit                     # Unit 테스트 (Vitest/Jest)
```

## 테스트 대상 레지스트리

새 테스트 대상 추가 시 이 섹션에 등록한다.

| 타입 | 대상 | 경로 | 스크립트 |
|------|------|------|----------|
| electron | gitbbon-chat | `extensions/gitbbon-chat/` | `npm run compile:test && AI_GATEWAY_API_KEY=$AI_GATEWAY_API_KEY npm run test:electron` |
| smoke | 전체 앱 | `test/smoke/` | `npm run smoketest-no-compile` |

## 실행 프로세스

### 1단계: 인자 파싱

- 인자 없음 → 레지스트리의 모든 테스트 순차 실행
- `electron` → electron 타입만 실행
- `electron gitbbon-chat` → 해당 대상만 실행
- `smoke` → smoke 타입만 실행

### 2단계: 테스트 실행

각 대상에 대해:

```bash
cd <경로>
<스크립트>
```

실행 전 확인:
- 컴파일 필요 여부 (`compile:test` 스크립트 존재 시 먼저 실행)
- `AI_GATEWAY_API_KEY` 환경변수 필요 시 주입 (값: 세션에서 확인)

### 3단계: 결과 분석

**통과 시**: 결과 요약 출력 후 종료

**실패 시** (자동 수정 루프):
1. 실패 메시지 분석 → 원인 추론
2. 관련 소스 파일 탐색 (Read, Grep)
3. 코드 수정 (Edit)
4. 재컴파일 후 재실행
5. 최대 3회 반복
6. 3회 후에도 실패 시 → 원인 요약 보고 후 종료

### 4단계: 결과 보고

```
## 테스트 결과 — YYYY-MM-DD HH:MM

| 타입 | 대상 | 결과 | 통과/전체 | 비고 |
|------|------|------|-----------|------|
| electron | gitbbon-chat | ✅ | 1/1 | - |
| smoke | 전체 앱 | ❌ | 3/10 | Data Loss 실패 |
```

실패한 테스트가 있으면:
- 원인 분석 내용 포함
- 수정한 파일 목록 포함
- `/is`로 이슈 생성 여부 제안

## 환경변수

| 변수 | 용도 | 필수 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (electron 테스트) | electron 타입만 |

## 확장 가이드

새 Extension 테스트 추가 시:
1. 해당 Extension에 `@vscode/test-electron` 설정 (PR #114 참고)
2. 위 레지스트리 테이블에 행 추가
3. 끝

새 테스트 타입(unit 등) 추가 시:
1. 레지스트리에 타입·경로·스크립트 추가
2. 끝

## ARGUMENTS

인자를 파싱해 위 프로세스를 수행한다.
- 인자가 없으면 전체 실행
- 첫 번째 인자가 타입 (electron / smoke / unit)
- 두 번째 인자가 대상 이름 (생략 시 해당 타입 전체)
