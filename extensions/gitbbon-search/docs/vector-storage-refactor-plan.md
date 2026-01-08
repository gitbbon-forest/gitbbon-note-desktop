# 임베딩 저장소 리팩토링 액션 플랜

> **브랜치:** `feat/vector-storage-refactor`
> **목표:** 마크다운 내 임베딩 주석 → `.gitbbon/vectors/` JSON 파일로 분리
> **전제:** 단일 워크스페이스 (멀티루트 워크스페이스 미지원)

---

## Phase 1: VectorStorageService 생성

### 1.1 파일 생성
**생성:** `src/services/vectorStorageService.ts`

| 작업 | 상세 |
|------|------|
| [x] VectorChunk 인터페이스 | `range: [number, number]`, `hash: string`, `vector: string` |
| [x] VectorData 인터페이스 | `model`, `dim`, `contentHash`, `chunks[]` |
| [x] VectorStorageService 클래스 | 빈 클래스 생성 |
| [x] 싱글톤 export | `export const vectorStorageService = new VectorStorageService()` |

### 1.2 경로 함수 구현
| 함수 | 입력 | 출력 | 설명 |
|------|------|------|------|
| [x] `getWorkspaceRoot()` | 없음 | `vscode.Uri \| null` | `vscode.workspace.workspaceFolders?.[0].uri` 반환 |
| [x] `getVectorFilePath(mdUri)` | `vscode.Uri` | `vscode.Uri \| null` | `{root}/.gitbbon/vectors/{relativePath}.json` 반환 |
| [x] `getVectorDirPath(vectorUri)` | `vscode.Uri` | `vscode.Uri` | 파일 경로에서 디렉토리 부분만 추출 |

### 1.3 CRUD 함수 구현
| 함수 | 동작 |
|------|------|
| [x] `saveVectorData(mdUri, data)` | 디렉토리 생성 → JSON.stringify → writeFile |
| [x] `loadVectorData(mdUri)` | readFile → JSON.parse → VectorData 반환, 실패 시 null |
| [x] `deleteVectorData(mdUri)` | delete, 파일 없으면 무시 |
| [x] `hasValidCache(mdUri, contentHash, model)` | loadVectorData 후 model/contentHash 비교 |

---

## Phase 2: extension.ts 연동

### 2.1 import 수정
| 작업 | 상세 |
|------|------|
| [x] 추가 | `import { vectorStorageService, type VectorData } from './services/vectorStorageService.js'` |
| [x] 제거 | `parseMetadata` |
| [x] 제거 | `getContentWithoutMetadata` |
| [x] 제거 | `canUseCachedEmbedding` |
| [x] 제거 | `saveMetadataToFile` |
| [x] 제거 | `type ChunkInfo`, `type ModelEmbedding` |
| [x] 유지 | `simpleHash`, `encodeVector`, `decodeVector` |

### 2.2 handleEmbeddingResult() 수정
**위치:** L678-713

| 변경 전 | 변경 후 |
|---------|---------|
| [x] `saveMetadataToFile(uri, text, embedding)` | `vectorStorageService.saveVectorData(uri, vectorData)` |

**추가 로직:**
- [x] `VectorData` 객체 생성: `{ model, dim, contentHash, chunks }` 형태로 조립
- [x] 각 chunk의 vector를 `encodeVector()`로 Base64 변환

### 2.3 indexFile() 수정
**위치:** L635-673

| 변경 전 | 변경 후 |
|---------|---------|
| [x] `const metadata = parseMetadata(text)` | 제거 |
| [x] `canUseCachedEmbedding(text, metadata)` | `vectorStorageService.hasValidCache(fileUri, contentHash, model)` |
| [x] `metadata!.embedding!.chunks` | `vectorData.chunks` (loadVectorData로 가져옴) |
| [x] `getContentWithoutMetadata(text)` | 제거, `text` 그대로 사용 |
| [x] `originalContent: text` 전송 | 제거 (더 이상 필요 없음) |

---

## Phase 3: FileWatcher 연동

### 3.1 handleDelete() 수정
**파일:** `src/watchers/fileWatcher.ts` L53-63

| 작업 | 상세 |
|------|------|
| [ ] import 추가 | `import { vectorStorageService } from '../services/vectorStorageService.js'` |
| [ ] 로직 추가 | `searchService.removeFile(uri)` 다음에 `vectorStorageService.deleteVectorData(uri)` 호출 |

### 3.2 흐름 확인
| 이벤트 | 호출 체인 | 확인 |
|--------|----------|------|
| 파일 생성 | `handleCreate` → `onIndexUpdate(uri)` → `indexFile(uri)` | [ ] |
| 파일 수정 | `handleChange` → `onIndexUpdate(uri)` → `indexFile(uri)` | [ ] |
| 파일 삭제 | `handleDelete` → `removeFile` + `deleteVectorData` | [ ] |

---

## Phase 4: 코드 정리

### 4.1 metadataService.ts → vectorUtils.ts
**파일:** `src/services/metadataService.ts`

| 작업 | 상세 |
|------|------|
| [ ] 함수 제거 | `parseMetadata()` |
| [ ] 함수 제거 | `saveMetadataToFile()` |
| [ ] 함수 제거 | `canUseCachedEmbedding()` |
| [ ] 함수 제거 | `getContentWithoutMetadata()` |
| [ ] 함수 제거 | `getCurrentModelName()` |
| [ ] 인터페이스 제거 | `ChunkInfo`, `ModelEmbedding`, `GitbbonMetadata`, `Short*` 타입들 |
| [ ] 상수 제거 | `METADATA_REGEX`, `MODEL_NAME` |
| [ ] 함수 유지 | `simpleHash()`, `encodeVector()`, `decodeVector()` |
| [ ] 파일명 변경 | `metadataService.ts` → `vectorUtils.ts` |

### 4.2 import 경로 업데이트
| 파일 | 변경 |
|------|------|
| [ ] `extension.ts` | `./services/metadataService.js` → `./services/vectorUtils.js` |

### 4.3 불필요한 코드 확인
| 확인 대상 | 위치 | 액션 |
|-----------|------|------|
| [ ] `startWorkspaceIndexing()` | L130-177 | 사용 여부 확인, 미사용 시 제거 |
| [ ] `SearchViewProvider.handleEmbeddingResult()` | L182-220 | 중복 확인, 정리 |

---

## Phase 5: 마무리

### 5.1 .gitignore 업데이트
**파일:** 워크스페이스 루트의 `.gitignore`

| 작업 | 추가 내용 |
|------|----------|
| [ ] 패턴 추가 | `.gitbbon/vectors/` |

### 5.2 테스트
| # | 시나리오 | 확인 방법 | 통과 |
|---|----------|----------|------|
| 1 | 앱 시작 | 콘솔에 에러 없음 | [ ] |
| 2 | 마크다운 생성 | `.gitbbon/vectors/`에 JSON 생성됨 | [ ] |
| 3 | 마크다운 수정 | JSON의 contentHash 변경됨 | [ ] |
| 4 | 앱 재시작 | 로그에 "Using cached embedding" 출력 | [ ] |
| 5 | 마크다운 삭제 | JSON도 삭제됨 | [ ] |
| 6 | 검색 실행 | 결과 정상 반환 | [ ] |
| 7 | 마크다운 열기 | 임베딩 주석 없음 확인 | [ ] |

### 5.3 커밋
```
feat(search): 임베딩 저장소를 별도 JSON 파일로 분리

- .gitbbon/vectors/ 디렉토리에 파일별 벡터 데이터 저장
- 마크다운 파일 순수성 유지 (임베딩 주석 제거)
- VectorStorageService 신규 생성
- metadataService → vectorUtils.ts로 축소
```

---

## 수정 파일 요약

| 파일 | 작업 | 변경량 |
|------|------|--------|
| `services/vectorStorageService.ts` | 신규 생성 | ~80줄 |
| `services/metadataService.ts` | → `vectorUtils.ts`로 축소 | -150줄 |
| `extension.ts` | handleEmbeddingResult, indexFile 수정 | ~30줄 변경 |
| `watchers/fileWatcher.ts` | handleDelete 수정 | ~5줄 추가 |
| `.gitignore` | 패턴 추가 | 1줄 |

**예상 시간:** ~2시간

---

## 향후 기능 개선

| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | 제목 포함 청킹 | 각 청크에 문서 제목을 포함하여 임베딩 품질 향상. `modelHost.html`의 청킹 로직 수정 필요. | 중 |

