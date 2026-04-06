# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.108.25](https://github.com/microsoft/vscode/compare/v1.108.24...v1.108.25) (2026-04-06)


### Features

* **activitybar:** 프로젝트 메뉴에 'Open in GitHub' 기능 추가 ([5fb4fb3](https://github.com/microsoft/vscode/commit/5fb4fb34016a2b37bc3aa6de3e6d309ee3d60339))
* **activitybar:** 프로젝트 목록 실시간 업데이트 구현 ([1821edc](https://github.com/microsoft/vscode/commit/1821edc7a030cedf6af662ce9febbf71edce2cdc))
* **activitybar:** 프로젝트 목록 최신순 정렬 ([47ee67e](https://github.com/microsoft/vscode/commit/47ee67eda68b4a58e0c4e10c4d4bd9f748275abf))
* Add `types: []` and `skipLibCheck: true` to `tsconfig.json` compiler options. ([89fd0e3](https://github.com/microsoft/vscode/commit/89fd0e35e14050cf711b78cb53f1a21fa6d871cf))
* add compile-ext-gitbbon script to root package.json ([6b94f99](https://github.com/microsoft/vscode/commit/6b94f99b37d39f079efec9e66fe014a7245e8bc0))
* add real-time tool execution status display ([8ee1cab](https://github.com/microsoft/vscode/commit/8ee1cab01c8c3fa19a0ba0e97c06d392e4a468bb))
* add remote deletion option to project deletion in activity bar ([19d31d4](https://github.com/microsoft/vscode/commit/19d31d4c348bbee14312d3c8041547452f82b987))
* **api-key:** use SecretStorage for API key management and improve prompt UX ([f9f939c](https://github.com/microsoft/vscode/commit/f9f939c900980a9b9391c0f1b5ae9a6522b5105e))
* breadcrumbs 기본 비활성화 ([81d15c7](https://github.com/microsoft/vscode/commit/81d15c73e83ba2656c9a1c4be5e25d1dd4e2ca9d))
* Change default New Text File action to create timestamped file and fix untitled auto-save exception ([c695385](https://github.com/microsoft/vscode/commit/c695385602879437b368c350e9f92f02d7f2b556))
* **chat:** AI Chat UX 자동처리 이슈 일괄 구현 ([#15](https://github.com/microsoft/vscode/issues/15), [#6](https://github.com/microsoft/vscode/issues/6), [#9](https://github.com/microsoft/vscode/issues/9), [#14](https://github.com/microsoft/vscode/issues/14)) ([e01957d](https://github.com/microsoft/vscode/commit/e01957d595de37f50e070a4228fcd19f55d22008))
* **chat:** GFM 테이블 텍스트 정렬 지원 - th/td style prop 전달 ([b1848ad](https://github.com/microsoft/vscode/commit/b1848adcca8f691ed56ee4c3112acb5ca63d17bb))
* **chat:** Milkdown 에디터 컨텍스트 수집 안정성 개선 ([f3a5d54](https://github.com/microsoft/vscode/commit/f3a5d54ecd2d79de56499ad08e7da95eabfdc86d))
* **chat:** 새 대화 시작 버튼 추가 ([3e4deb8](https://github.com/microsoft/vscode/commit/3e4deb84151b42f853f13f3cf661824102747b77))
* **chat:** 테이블 UI 개선 및 미사용 코드 정리 ([8faa883](https://github.com/microsoft/vscode/commit/8faa883b47682e7cb50334b97deb231f50faa072)), closes [#20](https://github.com/microsoft/vscode/issues/20) [#19](https://github.com/microsoft/vscode/issues/19)
* **chat:** 토큰 스트리밍 및 응답 취소 기능 구현 ([#3](https://github.com/microsoft/vscode/issues/3), [#5](https://github.com/microsoft/vscode/issues/5)) ([c69b9a2](https://github.com/microsoft/vscode/commit/c69b9a2dfdd28c0f0b2600fdf42eb553988570a4))
* Copilot Chat 비활성화 및 gitbbon-chat 우선순위 설정 (Runtime 오류 수정 포함) ([3888314](https://github.com/microsoft/vscode/commit/388831493f9ebf4634a6cf1438b8124a32253fb5))
* disable built-in Copilot Chat and mock services to prevent runtime errors ([ffe11a2](https://github.com/microsoft/vscode/commit/ffe11a2a528f5818e31a975b9e43f376961ee897))
* **editor:** URI→Panel 맵 기반 applySuggestions 개선 [#109](https://github.com/microsoft/vscode/issues/109) ([d90f6e0](https://github.com/microsoft/vscode/commit/d90f6e0905f3b60f4f9a6db0f0353e5d54d216ce))
* **editor:** 병합 UI를 구글 독스 스타일 마진 카드 방식으로 개선 [#109](https://github.com/microsoft/vscode/issues/109) ([3b89855](https://github.com/microsoft/vscode/commit/3b89855483db3c7ce6bd4cd27d45bab02b4a2e78))
* **editor:** 뷰포트 좁을 때 콘텐츠 좌측 정렬 전환 [#109](https://github.com/microsoft/vscode/issues/109) ([1020b42](https://github.com/microsoft/vscode/commit/1020b4212d3f1851cfc4f6cfc54aa815a7574eba))
* **editor:** 수정 제안 카드 레이아웃 및 위치 개선 [#109](https://github.com/microsoft/vscode/issues/109) ([9102d4d](https://github.com/microsoft/vscode/commit/9102d4dd717266556984a3595ace4e46265acb7f))
* **editor:** 텍스트 선택 시 Milkdown 툴바 위에 비슷한 글 표시 기능 추가 ([29769cf](https://github.com/microsoft/vscode/commit/29769cf0d139c1630924279b77409684e8d0f4a0))
* enhance chat logging visibility using console.log ([03f710a](https://github.com/microsoft/vscode/commit/03f710a4b7672a50d2a4c683006e89254b689057))
* enhance edit_note tool with create/update/delete actions ([765d91f](https://github.com/microsoft/vscode/commit/765d91f5897e2a93379d9f75329c6a4312c06638))
* enhance project deletion with detailed logging and remote integration ([4bfa17e](https://github.com/microsoft/vscode/commit/4bfa17e7d89b180f314d7a51d2b1fabade6a8268))
* Extension Host 런타임 source-map 적용 (Issue [#45](https://github.com/microsoft/vscode/issues/45)) ([1324db6](https://github.com/microsoft/vscode/commit/1324db67dfd002e8fa0e34ba1fc036e160cb9fe0))
* Gateway 모델을 openai/o4-mini로 변경 및 reasoning providerOptions 개선 ([1fda9f2](https://github.com/microsoft/vscode/commit/1fda9f2413f637bdb141386da90949fef47d78e1))
* gitbbon-* 확장 기능들에 source-map-support 적용 ([99ed90f](https://github.com/microsoft/vscode/commit/99ed90f68a6c8ee92d25f576f27cd51f7a386a98))
* **gitbbon-chat:** edit_note 도구에 title 필드 추가 및 YAML frontmatter 지원 ([0e3ce07](https://github.com/microsoft/vscode/commit/0e3ce07d73de6e87b8da155cf040524134c5c790))
* **gitbbon-chat:** implement markdown rendering for AI responses ([fc499a1](https://github.com/microsoft/vscode/commit/fc499a1e292fcda985611c84c589f6920381c1c9))
* **gitbbon-chat:** 모델 설정 셀렉트박스를 채팅 입력창에 통합 (closes [#49](https://github.com/microsoft/vscode/issues/49)) ([943e7fa](https://github.com/microsoft/vscode/commit/943e7fa4521e533ca49cc83655840745cd4baeba))
* **gitbbon-editor:** Add persistent sticky toolbar ([c25113e](https://github.com/microsoft/vscode/commit/c25113eb1bda3c7f6887fcf10ad6f57a5881f259))
* **gitbbon-editor:** Improve Similar Articles link creation and navigation ([98a51cb](https://github.com/microsoft/vscode/commit/98a51cbad3452b571c2bbe0dd9fdb5a4853df9ef))
* **gitbbon-editor:** 에디터 탭에 YAML title 표시 ([3621d86](https://github.com/microsoft/vscode/commit/3621d86153629f697ff3eb5b66392a1c0470d611))
* **gitbbon-manager:** console.log을 LogOutputChannel 기반 logService로 변경 ([74f0e30](https://github.com/microsoft/vscode/commit/74f0e307c804a69ea3dabbdc58a59caec9bb8152))
* **gitbbon-search:** AI 검색 결과에 YAML title 표시 및 하이라이트 ([1349c68](https://github.com/microsoft/vscode/commit/1349c68a92c1b68b23685207f8a93fdc5c72f298))
* **gitbbon-search:** frontmatter 제거 및 마크다운 정리 유틸 추가 ([1c259fb](https://github.com/microsoft/vscode/commit/1c259fbd7dd0dc76a71c9a0efed2ff1f1e806b41))
* **gitbbon-search:** 모델 및 벡터 저장 정밀도를 fp32로 향상 ([4c9bedb](https://github.com/microsoft/vscode/commit/4c9bedb582c42e0f798303a417ebfbb6740da7b2))
* **gitbbon-search:** 벡터 검색 유사도 임계값 0.5로 조정 ([606d0fa](https://github.com/microsoft/vscode/commit/606d0fa3244c15a92b6ce9489d156960aaf3da5e))
* **gitbbon-search:** 우선순위 큐 적용으로 검색 쿼리 응답 시간 개선 ([a777143](https://github.com/microsoft/vscode/commit/a77714308d1c95deac4a0e7ee9094d3b5ce27039))
* **gitbbon-search:** 인덱스 저장에 debounce 적용 ([8a1baec](https://github.com/microsoft/vscode/commit/8a1baec2322d2bef013acc0c29ca9e1d74fb31e1))
* **gitbbon-search:** 임베딩에 문서 제목 포함하여 검색 품질 향상 ([69f0d48](https://github.com/microsoft/vscode/commit/69f0d485620172e2f1fa868d3fe73e2730d30bae))
* Implement semantic search indexing with Orama and metadata storage ([606300c](https://github.com/microsoft/vscode/commit/606300cd4a3d14de718cc4826e73d1af5a3ba989))
* improve chat input UI with send/receive state indicators ([7ea169f](https://github.com/microsoft/vscode/commit/7ea169fcdf6626c14875cf28d479036624347042))
* improve edit_note mode selection — prefer suggestion for .md/YAML files ([367c1eb](https://github.com/microsoft/vscode/commit/367c1eb21f91fc4ae6ca62cd186296a3e4078d1f))
* Issue [#100](https://github.com/microsoft/vscode/issues/100) - prepareStep으로 단계별 tool 접근 제어 ([3042b9c](https://github.com/microsoft/vscode/commit/3042b9c524b5a282eb4a3c81451088b70aea92d9))
* Issue [#11](https://github.com/microsoft/vscode/issues/11) - 코드 구문 강조(Syntax Highlighting) 지원 ([9a592ab](https://github.com/microsoft/vscode/commit/9a592ab86e830ea42f8b568c1e2ec63004e1592f))
* Issue [#115](https://github.com/microsoft/vscode/issues/115) - file explore 아이콘 숨기기 ([35f7efa](https://github.com/microsoft/vscode/commit/35f7efaa6169e619e54373da9ae3cfbb1b7a24f2))
* Issue [#116](https://github.com/microsoft/vscode/issues/116) - README.md를 README로 표시 ([bfeb3fe](https://github.com/microsoft/vscode/commit/bfeb3fe7c6cb7fb115ca8840dc2c16114c2d5d7a))
* Issue [#136](https://github.com/microsoft/vscode/issues/136) - gitbbon-chat markdown to HTML 변환 ([25df199](https://github.com/microsoft/vscode/commit/25df199244e3cea11316125f903d5bdcb32629f4))
* Issue [#138](https://github.com/microsoft/vscode/issues/138) - 자동커밋 diff 파일 수/크기 제한 ([bde0f7b](https://github.com/microsoft/vscode/commit/bde0f7be3289298861fee594bb4940320046b190))
* Issue [#14](https://github.com/microsoft/vscode/issues/14) - 방향 문자(>)를 CSS chevron 그래픽 아이콘으로 변경 ([37a63aa](https://github.com/microsoft/vscode/commit/37a63aae90636bdfdcfd816f283dbfb8a288045b))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - buildToolbar API로 포맷 선택 버튼 그룹 재구현 ([7692012](https://github.com/microsoft/vscode/commit/7692012a19ec043f38816506e21ecf08eaf0f1d2))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - 컨텍스트 메뉴 포맷 선택 드롭다운 추가 (H1~H6, Paragraph) ([b84f4d9](https://github.com/microsoft/vscode/commit/b84f4d99edd6a65bcc8e5ec7d86a056390407f2c))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - 포맷 선택 드롭다운 팝업으로 재구현 (Aa 버튼) ([16c0788](https://github.com/microsoft/vscode/commit/16c0788e4979a1509133db18e0904b200456ee76))
* Issue [#33](https://github.com/microsoft/vscode/issues/33) - Ollama 백엔드를 Vercel AI SDK 통합으로 tools 지원 ([5b2a9eb](https://github.com/microsoft/vscode/commit/5b2a9ebddb34bc89455cf6d2b8fccb0d9c2a809d))
* Issue [#33](https://github.com/microsoft/vscode/issues/33) - Ollama 서비스 전 단계 로그 추가 ([bd74d91](https://github.com/microsoft/vscode/commit/bd74d911937c0001efaf24a2a3b4be7ceb630b85))
* Issue [#33](https://github.com/microsoft/vscode/issues/33) - Ollama 채팅 백엔드 추가 (로컬 LLM 지원) ([c7e160e](https://github.com/microsoft/vscode/commit/c7e160e9613b0e1ac54b63f281b1bb37cbb7fcb8))
* Issue [#33](https://github.com/microsoft/vscode/issues/33) - 모델 다운로드 전 사용자 확인 및 용량 안내 ([168e410](https://github.com/microsoft/vscode/commit/168e4106b626c207e880a7f0ef1005a3f5fa58e3))
* Issue [#46](https://github.com/microsoft/vscode/issues/46) - Extension Host 런타임 에러 스택에 source-map 적용 ([1c0ffd8](https://github.com/microsoft/vscode/commit/1c0ffd8da0f646a71107f848d5fcebd0aaaeedf8))
* Issue [#59](https://github.com/microsoft/vscode/issues/59) - 수동커밋 버튼 UI 개선 (아이콘 제거, 여백 축소, Commit/Committed 텍스트) ([4e2001d](https://github.com/microsoft/vscode/commit/4e2001d889098435befe824f2bc58a216ff34053))
* Issue [#64](https://github.com/microsoft/vscode/issues/64) - AI 추론(reasoning) 과정 실시간 스트리밍 표시 ([27804e8](https://github.com/microsoft/vscode/commit/27804e85f3d62918d28dd4466094abd6e0e87910))
* Issue [#64](https://github.com/microsoft/vscode/issues/64) - Ollama 프로바이더를 ollama-ai-provider-v2로 전환 ([5119f29](https://github.com/microsoft/vscode/commit/5119f29eaeb865de217b74c4465d0b6d074133fd))
* Issue [#68](https://github.com/microsoft/vscode/issues/68) - Ollama 추천 모델 리스트 및 다운로드 관리 UI ([57fd209](https://github.com/microsoft/vscode/commit/57fd20918fbcf75c6e33c00c9c4fa56fdf77a35d))
* Issue [#70](https://github.com/microsoft/vscode/issues/70) - 추론 과정 UI 디자인 개선 (모던 트렌드 적용 및 기본 열림) ([1ababf9](https://github.com/microsoft/vscode/commit/1ababf91812b3d1a373a552e19d32c2d2ef5a7c5))
* Issue [#70](https://github.com/microsoft/vscode/issues/70) - 추론 스트리밍 중 자동 스크롤 ([b72721c](https://github.com/microsoft/vscode/commit/b72721c8ce46a44429f39135a5502ec0a30ec7a6))
* Issue [#77](https://github.com/microsoft/vscode/issues/77) - Ollama 모델 capabilities 사전 감지 및 streamText 옵션 자동 결정 ([0e2995d](https://github.com/microsoft/vscode/commit/0e2995d50c14da6419d5b5c9f0c94194c869d441))
* Issue [#79](https://github.com/microsoft/vscode/issues/79) - 온디바이스 모델 삭제 기능 추가 (Option B: 관리 버튼 → 모달) ([d480c8a](https://github.com/microsoft/vscode/commit/d480c8abd32d2137efa43c6309eeb10cb9d599c4))
* Issue [#81](https://github.com/microsoft/vscode/issues/81) - 온디바이스 모델 목록 GitHub JSON으로 동적 제공 ([92a9b33](https://github.com/microsoft/vscode/commit/92a9b337a0ddd2cc05cd77911442e44e2dae4daa))
* Issue [#82](https://github.com/microsoft/vscode/issues/82) - 프로젝트 생성 후 자동으로 열기 ([f6ccaf8](https://github.com/microsoft/vscode/commit/f6ccaf892dfd80d7b19761d4443bc9c4550eab9b))
* Issue [#91](https://github.com/microsoft/vscode/issues/91) - macOS 코드 서명 및 공증 CI/CD 파이프라인 구성 ([cbfe7b5](https://github.com/microsoft/vscode/commit/cbfe7b523152696b7dcb4970bf77638a225eff23))
* Issue [#97](https://github.com/microsoft/vscode/issues/97) - tool 단위 실행 시간 UI 표시 ([c049cb8](https://github.com/microsoft/vscode/commit/c049cb82389d4f50e320ed45104b4f01a835cf81))
* Issue [#98](https://github.com/microsoft/vscode/issues/98) - 편집 요청 시 toolChoice required 적용 ([4957e52](https://github.com/microsoft/vscode/commit/4957e52055e3e643f820a4d58309620e5a5ac0ea))
* Issue [#99](https://github.com/microsoft/vscode/issues/99) - experimental_context로 tool 컨텍스트 전달 개선 ([ddb5318](https://github.com/microsoft/vscode/commit/ddb531858d69de1b6d5ddd5f3cfc9598063060db))
* **manager:** 프로젝트 초기화 시 .gitignore 및 파일 숨김 설정 개선 ([d6fc1dc](https://github.com/microsoft/vscode/commit/d6fc1dc8bb25b5829e3fe6544b59263297c0e2e9))
* npm run dev 스크립트 추가 — watch + 자동 실행 ([2ebfdbd](https://github.com/microsoft/vscode/commit/2ebfdbdc7cb01a12e242b647949ef132996082ca))
* **output:** add delete log file button with archived logs support ([283003a](https://github.com/microsoft/vscode/commit/283003a03248a829a7946bfce0fd2d39d6f3acc1))
* restructure workbench layout (Project List <-> Activity Bar) ([6cd9613](https://github.com/microsoft/vscode/commit/6cd96138f7e574bdfd8f631c9fa9c190b6ac07ea))
* **search:** 'Open in editor', 'Search with AI' 링크 숨김 ([a90f273](https://github.com/microsoft/vscode/commit/a90f27302554c5cd4d4316854e199a99e31999be))
* **search:** add CSP meta tag to hidden webview in extension.ts ([f25736c](https://github.com/microsoft/vscode/commit/f25736c762be0486597adcf698e90c6bcf7d3f1e))
* **search:** AI 검색 결과 스니펫 표시 개선 ([06f488b](https://github.com/microsoft/vscode/commit/06f488b66571510dae581d4a50e60b54692a0185))
* **search:** AI 검색 결과에 YAML title 표시 ([22d0cc0](https://github.com/microsoft/vscode/commit/22d0cc0aae4979b0afb04cef6c382e08cb071316))
* **search:** AI 검색 결과에서 라인 번호 숨김 ([8199df4](https://github.com/microsoft/vscode/commit/8199df4a9d7cdd91581daf20f274f88c7e689137))
* **search:** AITextSearchProvider 통합 및 시멘틱 검색 자동 활성화 ([ee0c578](https://github.com/microsoft/vscode/commit/ee0c5786bd10cc89b7fe5e99de6f59ee3d09c50c))
* **search:** Hidden Webview 기반 시맨틱 검색 및 자동 인덱싱 구현 ([f1a0dc9](https://github.com/microsoft/vscode/commit/f1a0dc9b4b67944555157e1ab3ea42f86641358f))
* **search:** transformers.js를 npm 패키지로 통합 ([0676b9f](https://github.com/microsoft/vscode/commit/0676b9fbf1b9149eeee872004b4a8fd5dd24c2d9))
* **search:** VectorStorageService 구현 (Phase 1) ([9395fe9](https://github.com/microsoft/vscode/commit/9395fe97fef3f8ca7b5cb6de7acdc99b2552dd16))
* **search:** 파일 삭제 시 벡터 데이터 자동 삭제 ([a6a8f53](https://github.com/microsoft/vscode/commit/a6a8f531c53a9a37856bc5a9b51bdb428b321f28))
* switch AI model to Gemini 3 Pro ([2f6e17e](https://github.com/microsoft/vscode/commit/2f6e17e210ac7dbc508cd2a2bb190a1ac4f0788a))
* use .gitbbon.json title in command center ([cf10d56](https://github.com/microsoft/vscode/commit/cf10d5651495e45715a4dc9672bd3c32c6ff4c0d))
* 모델 다운로드 Quick Pick 공통화 및 확인 다이얼로그 ([#134](https://github.com/microsoft/vscode/issues/134)) ([567dabe](https://github.com/microsoft/vscode/commit/567dabe2acc72ffa3326cbcd3534b14a0e1e57bf))
* 앱 재시작 후 모델 타입 선택 옵션 복원 (Issue [#55](https://github.com/microsoft/vscode/issues/55)) ([fd164d9](https://github.com/microsoft/vscode/commit/fd164d9c37496faa1d70a2aa1398778e99151c31))
* 에디터 탭에 YAML title 표시 ([d6b1a70](https://github.com/microsoft/vscode/commit/d6b1a703836ede0542349eff52a2fa0e58e8a37a))
* 전역 AI 모델 선택 및 상태바 표시 ([#129](https://github.com/microsoft/vscode/issues/129)) ([df415a3](https://github.com/microsoft/vscode/commit/df415a3a8d0dd83622e906899e8abade340a2355))
* 커밋 버튼 UI 텍스트 및 아이콘 개선 (Issue [#65](https://github.com/microsoft/vscode/issues/65)) ([6981598](https://github.com/microsoft/vscode/commit/6981598cb307a8524114761a94ce84bc11845e89))
* 프로젝트 리스트 항목 디자인 개선 (정사각형, 테마 색상 토큰) ([def617a](https://github.com/microsoft/vscode/commit/def617aedc1ea782fdb8a95be7fb563ccf3f6486))
* 프로젝트 생성 시 에이전트 인스트럭션 파일 자동 생성 ([1bacfbc](https://github.com/microsoft/vscode/commit/1bacfbc83c8ab2856ce1c54ab023e81059599194))
* 확장 기능 로그를 LogOutputChannel로 이동 ([70b0f20](https://github.com/microsoft/vscode/commit/70b0f20dd1366d700bf1b786c6f0a5a65b869043))


### Bug Fixes

* Add SecretStorage support for API key management ([ac4d349](https://github.com/microsoft/vscode/commit/ac4d34998a9ae4d1414e00a936041d190472df7d))
* **chat:** API 모델 capabilities 하드코딩 및 Gateway 인증 에러 처리 개선 [#119](https://github.com/microsoft/vscode/issues/119) ([b020527](https://github.com/microsoft/vscode/commit/b020527b8428e6ff116825c2160620173a75cfa5))
* **chat:** submit 후 입력창에 마지막 글자 남는 버그 수정 ([899cadc](https://github.com/microsoft/vscode/commit/899cadc466ec0eff8f01f2a283bfe3cc39b1d024))
* **chat:** Tool 아코디언 디자인 개선 - 이모지 제거 및 화살표 변경 ([ddaba31](https://github.com/microsoft/vscode/commit/ddaba317302b07c70752225e9089d434b1ce020b))
* **chat:** Tool 아코디언 디자인 개선 - 이모지 제거 및 화살표 변경 ([9488d94](https://github.com/microsoft/vscode/commit/9488d94a1fec55bfc39a2cfd143152e4a88a6996))
* **chat:** 에디터 대기 시간 확대 및 재시도 UI 추가 ([#10](https://github.com/microsoft/vscode/issues/10)) ([98145ec](https://github.com/microsoft/vscode/commit/98145ecf256575b1c7e5ca54586429e557b403f7))
* **chat:** 에이전트에게 파일의 실제 경로(확장자 포함) 전달하도록 수정 ([2c75717](https://github.com/microsoft/vscode/commit/2c75717a48da8467b09778aaa8cbc97b9e8fb6a2))
* **core:** compilation errors & refactor logging to Output Channel ([5590e16](https://github.com/microsoft/vscode/commit/5590e1652eba4c6daa540d2c04f6c5ef94c9c139))
* edit_note 무한 루프 버그 2건 수정 ([bf729aa](https://github.com/microsoft/vscode/commit/bf729aacc4b72247e1be61a5b51cf89c6a9cee16))
* **editor:** hide gitbbon-search metadata in editor view ([1befd98](https://github.com/microsoft/vscode/commit/1befd989507f6bc10c30a3682f5c5b870c7b0f7b))
* **editor:** KaTeX 폰트 CSP 차단 — font-src 지시어 추가 ([#123](https://github.com/microsoft/vscode/issues/123)) ([a11bcf9](https://github.com/microsoft/vscode/commit/a11bcf991c1f2d9874d35009d5439a5d793bd6b4))
* **editor:** Vue 번들러 feature flag 명시 정의 — tree-shaking 최적화 ([#124](https://github.com/microsoft/vscode/issues/124)) ([2e1648a](https://github.com/microsoft/vscode/commit/2e1648a5b9b1fa604a80a8b64caa4e8d025c5036))
* **editor:** 마진 카드 뷰포트 이탈 수정 + 동적 2열 레이아웃 전환 [#109](https://github.com/microsoft/vscode/issues/109) ([b7e90aa](https://github.com/microsoft/vscode/commit/b7e90aa89efc7e7a654681c823082e4d4ba9a354))
* **editor:** 문서 전환 시 선택 영역 초기화 ([96b01e3](https://github.com/microsoft/vscode/commit/96b01e3c3c14072d8eade3575138eb67b13d298d))
* **editor:** 카드 없을 때 is-narrow 오적용 방지 [#109](https://github.com/microsoft/vscode/issues/109) ([4d9126b](https://github.com/microsoft/vscode/commit/4d9126bc618471925c9185aa8075b2e0fcb910eb))
* GatewayAuthenticationError 진단 로그 추가, 잘못된 SecretStorage 삭제 로직 제거 ([#127](https://github.com/microsoft/vscode/issues/127)) ([3a1edfc](https://github.com/microsoft/vscode/commit/3a1edfccfd9f188d7d0500be9997b0bd6e35051c))
* GatewayAuthenticationError 후 모델 재선택 시 오류 지속 문제 수정 ([#127](https://github.com/microsoft/vscode/issues/127)) ([3c546cf](https://github.com/microsoft/vscode/commit/3c546cfbb4d281976a4b8e16268bfc1916143585))
* get_chat_history 에러 메시지에서 "Error:" 접두사 제거 ([6aa3427](https://github.com/microsoft/vscode/commit/6aa3427ba60574621e2e72b48e878fa58a72ae0d))
* **gitbbon-chat:** 모델 셀렉트박스를 컨텐츠 크기에 맞게 조정 ([#50](https://github.com/microsoft/vscode/issues/50)) ([e575604](https://github.com/microsoft/vscode/commit/e5756046e2b08f7e6502927d96632628746ac800))
* **gitbbon-editor:** 무한 저장 루프 해결 ([ffc1ae5](https://github.com/microsoft/vscode/commit/ffc1ae57922bb4f3a6bec87638f5a1704d35afee))
* **gitbbon-editor:** 초기 로드 시 unsaved 상태가 되는 문제 해결 ([5c58ba6](https://github.com/microsoft/vscode/commit/5c58ba601116f668be1afc40f3e2916f612f51bb))
* **gitbbon-search:** AI 검색 결과에 스니펫 미리보기 표시 ([6d0a013](https://github.com/microsoft/vscode/commit/6d0a013614f666306fac41b62754ac0dd327c3fa))
* **gitbbon-search:** ESM 모드에서 source-map-support import 경로 수정 ([b8c75ba](https://github.com/microsoft/vscode/commit/b8c75ba084ea42e63d64c518c0c9338511287a30))
* **gitbbon-search:** serve ONNX WASM assets locally to resolve CSP errors ([a501a76](https://github.com/microsoft/vscode/commit/a501a76c63b4de610dde7bd631bdaa4b8d114867))
* improve textarea auto-resize behavior ([68299fd](https://github.com/microsoft/vscode/commit/68299fd95741d8ff33ebb2cc53904afe50db75ce))
* Issue [#11](https://github.com/microsoft/vscode/issues/11) - 코드 블록 하단 여백 추가 ([b3d40ef](https://github.com/microsoft/vscode/commit/b3d40ef6ceb5a7894c9569aaa46b3fd887acae35))
* Issue [#121](https://github.com/microsoft/vscode/issues/121) - 탭에 표시되는 아이콘 제거 ([df547b9](https://github.com/microsoft/vscode/commit/df547b9f1fc1ee3f655458c4ce3fa0258bc18029))
* Issue [#132](https://github.com/microsoft/vscode/issues/132) - crepe-color-inline-area 변수 정의로 배경색 반전 적용 ([3490627](https://github.com/microsoft/vscode/commit/3490627d069c47a1130baad5385bc75672c19c42))
* Issue [#132](https://github.com/microsoft/vscode/issues/132) - milkdown 인라인 코드 배경색 테마 적용 ([2e933e3](https://github.com/microsoft/vscode/commit/2e933e3a5e9b66d1ea7f7a099ba3772833d0f3a6))
* Issue [#132](https://github.com/microsoft/vscode/issues/132) - 인라인 코드 색상 반전 (텍스트↔배경) ([26cd571](https://github.com/microsoft/vscode/commit/26cd571a708b5771a9b5df12dc3dcd984a363a59))
* Issue [#132](https://github.com/microsoft/vscode/issues/132) - 인라인 코드 텍스트 색상을 badge-foreground로 수정 ([9f48f39](https://github.com/microsoft/vscode/commit/9f48f3916c1f5c19736898c49729e4b06428b10d))
* Issue [#138](https://github.com/microsoft/vscode/issues/138) - autoCommit getChangePreview에도 diff 용량 제한 적용 ([c442900](https://github.com/microsoft/vscode/commit/c442900e9701312e379ece924a074fd2d9dedaca))
* Issue [#138](https://github.com/microsoft/vscode/issues/138) - diff 제한값 조정 및 LLM 전체 규모 안내 ([4ca6c05](https://github.com/microsoft/vscode/commit/4ca6c0537aac1e447f95ffab92631886dc0b0248))
* Issue [#138](https://github.com/microsoft/vscode/issues/138) - 영문 프롬프트 및 조건부 truncation 안내 ([32ae30b](https://github.com/microsoft/vscode/commit/32ae30b923346c82bea6a26a485f2ce13569c7f2))
* Issue [#27](https://github.com/microsoft/vscode/issues/27) - Non-markdown 파일 Milkdown 에디터 열림 근본 수정 (재작업) ([22f56e0](https://github.com/microsoft/vscode/commit/22f56e079e91db9c37bb1e6beb0cc63759116d20))
* Issue [#27](https://github.com/microsoft/vscode/issues/27) - Non-markdown 파일을 기본 에디터로 열기 ([7146277](https://github.com/microsoft/vscode/commit/714627763a19966eb2d2424dc505e145aa631936))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - /require 제거로 CJS/ESM 충돌 및 DOM 타입 오류 수정 ([b48f201](https://github.com/microsoft/vscode/commit/b48f20172b63832b3f7c1bae83ce3838fabf1efc))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - Aa 색상 --vscode-editor-foreground 적용 ([3d3f30b](https://github.com/microsoft/vscode/commit/3d3f30b3ffbc0755c7736eeabdaba71e18bed232))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - Aa 아이콘 color:currentColor 추가로 B 버튼과 색상 통일 ([3d2ef6d](https://github.com/microsoft/vscode/commit/3d2ef6db359fa76170bc29fb10c34707f9b27661))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - rAF + data-show 감지로 드롭다운 삽입 타이밍 수정 ([85f756a](https://github.com/microsoft/vscode/commit/85f756a9479b7e95657c4ce6e0e9ba50fbb4050b))
* Issue [#29](https://github.com/microsoft/vscode/issues/29) - 드롭다운 UI 개선 ([a6e9358](https://github.com/microsoft/vscode/commit/a6e93586a9bdfbcc010df25972145051576359ab))
* Issue [#30](https://github.com/microsoft/vscode/issues/30) - git graph 커밋 히스토리 br 태그 노출 수정 (재작업) ([d301ce0](https://github.com/microsoft/vscode/commit/d301ce0f69e80119b36dec21e5c71b2c3e6ae99e))
* Issue [#30](https://github.com/microsoft/vscode/issues/30) - 버전관리 창 br 태그 텍스트 노출 수정 ([09ac9e6](https://github.com/microsoft/vscode/commit/09ac9e6fa437ed452939511f4a51d38a8747bfe7))
* Issue [#33](https://github.com/microsoft/vscode/issues/33) - ollama-ai-provider → @ai-sdk/openai (OpenAI 호환 엔드포인트) ([27b1453](https://github.com/microsoft/vscode/commit/27b1453526e9b16e4802df4fb60d3381f33e62af))
* Issue [#33](https://github.com/microsoft/vscode/issues/33) - 이미 설치된 Ollama 모델 있으면 재사용 ([1c640eb](https://github.com/microsoft/vscode/commit/1c640eb9979b54b635de37daed7998a8f028fbed))
* Issue [#35](https://github.com/microsoft/vscode/issues/35) - delete log file 후 output 로그 즉시 표시 ([0f8a1ca](https://github.com/microsoft/vscode/commit/0f8a1ca93830c2732504055705323e721b06dd85))
* Issue [#36](https://github.com/microsoft/vscode/issues/36) - aiService.ts any 타입 제거 및 타입 안전성 개선 ([a6eba8b](https://github.com/microsoft/vscode/commit/a6eba8b5d700a613bb383939bb6b08c3e3b811dd))
* Issue [#36](https://github.com/microsoft/vscode/issues/36) - 시스템 프롬프트 수정으로 tool calling 유도 ([c90f040](https://github.com/microsoft/vscode/commit/c90f04010875f5673a5b37739b5bcf6ecec0fb91))
* Issue [#43](https://github.com/microsoft/vscode/issues/43) - GatewayAuthenticationError 시 API 키 입력 유도 ([352f846](https://github.com/microsoft/vscode/commit/352f846d72de33f535fc8d39ea693fb51be0ecfd))
* Issue [#69](https://github.com/microsoft/vscode/issues/69) - 다운로드 다이얼로그 가운데 정렬 및 상태표시줄 진행률 표시 ([669192e](https://github.com/microsoft/vscode/commit/669192e7c78b40be4727c4886578b4fe341f9fac))
* Issue [#72](https://github.com/microsoft/vscode/issues/72) - 전송 버튼 아이콘 hover 시 이동 현상 제거 ([4371a60](https://github.com/microsoft/vscode/commit/4371a60b306958d6db08904be8ca1ad67ea64535))
* Issue [#74](https://github.com/microsoft/vscode/issues/74) - Ollama Bad Request fallback (think + tools) ([5ae0080](https://github.com/microsoft/vscode/commit/5ae0080d142044c874b55bb81f7027c95d1b2fff))
* Issue [#74](https://github.com/microsoft/vscode/issues/74) - Ollama tool 미지원 모델 사용 시 fallback 처리 ([555b35d](https://github.com/microsoft/vscode/commit/555b35deeb06be490b0962388ca2b68fb14fa0d7))
* Issue [#74](https://github.com/microsoft/vscode/issues/74) - 빈 응답 감지 fallback 추가 (think 미지원 모델) ([3378915](https://github.com/microsoft/vscode/commit/3378915be0268a7487c5d5d24f22dd11097674eb))
* Issue [#82](https://github.com/microsoft/vscode/issues/82) - 프로젝트 생성 후 새 창에서 열기 ([e46c2cc](https://github.com/microsoft/vscode/commit/e46c2cc111d0b810577e5b014a561a0972c1f389))
* **mock:** return dummy agent in MockChatAgentService to silence chatParticipant errors ([73bd987](https://github.com/microsoft/vscode/commit/73bd98791388fc3d2cf2ea3a4d240efb1783e709))
* node-gyp를 devDependencies에 추가하여 sharp 빌드 오류 해결 ([837116b](https://github.com/microsoft/vscode/commit/837116b9f6c91370c5ee47a1c1999be8e6135347))
* **projectbar:** 프로젝트 목록 중복 표시 방지를 위한 loadProjects 실행 플래그 추가 ([8d11e21](https://github.com/microsoft/vscode/commit/8d11e216168f92065e2f7f1b47d7b83506c1260c))
* Quick Pick 현재 선택 모델 표시 ([#131](https://github.com/microsoft/vscode/issues/131)) ([b9d94df](https://github.com/microsoft/vscode/commit/b9d94dfbefbc30146a2b335cd7008cdc09773d10))
* resolve duplicate embedding metadata issue ([cd5d000](https://github.com/microsoft/vscode/commit/cd5d0009df453a1155eefbfebb4d0ae6a13344c0))
* Save 버튼 z-index 문제 수정 (Issue [#52](https://github.com/microsoft/vscode/issues/52)) ([bafeab7](https://github.com/microsoft/vscode/commit/bafeab7067fbfff0355b4d502c7e719df35037f2))
* **scm:** 깃 그래프 버전 비교 창 안 열리는 버그 수정 ([2fa3c19](https://github.com/microsoft/vscode/commit/2fa3c19cac1cdbf2460fee78b0f7bbe1e311cd0b))
* **search:** resolve model loading issues and improve logging ([a9419dc](https://github.com/microsoft/vscode/commit/a9419dc785e81ac63cdc68e0a765b2d055d0b32b))
* **search:** set tsconfigRootDir in eslint config ([4101dbd](https://github.com/microsoft/vscode/commit/4101dbd26ec7dcbc5ba976bbd3e1165e16d4098b))
* **search:** 벡터 검색 버그 수정 및 Priority Queue 구현 ([937d3f5](https://github.com/microsoft/vscode/commit/937d3f583757b388d9f5c22921c291f47028efb8))
* **theme:** Add fallbacks for unified color visibility ([9a74fce](https://github.com/microsoft/vscode/commit/9a74fcedc4b4ae8615d4f7acee215c760a96cf64))
* **theme:** Set default fallback colors for sidebar, panel, and notifications ([66f0388](https://github.com/microsoft/vscode/commit/66f03880bfa07653775a4c63dd358650091d49ff))
* tool 실패 메시지에서 "Error:" 접두사 일괄 제거 ([9f6c5c4](https://github.com/microsoft/vscode/commit/9f6c5c4a03a59425e7b6e70e78fa743ee94c4b29))
* workbench.editor.showIcons 기본값 false로 변경 (Issue [#121](https://github.com/microsoft/vscode/issues/121)) ([7ee5ad5](https://github.com/microsoft/vscode/commit/7ee5ad50a2d5991a7e646c5d2d02dca7bd37690b))
* 다운로드 진행 UI를 상태바로 이전, 채팅창 UI 제거 ([#135](https://github.com/microsoft/vscode/issues/135)) ([a1cc4e7](https://github.com/microsoft/vscode/commit/a1cc4e76fe8bd02cd38c07b1e9eecfc56606c59e))
* 다크/화이트 테마에서 인라인 코드 텍스트 가시성 개선 [#88](https://github.com/microsoft/vscode/issues/88) ([76a5f0a](https://github.com/microsoft/vscode/commit/76a5f0a17824537a044dfdc1d29b9163349b5961))
* 앱 재시작 후 모델 타입 복원 안 되는 문제 수정 (Issue [#55](https://github.com/microsoft/vscode/issues/55)) ([7e0be30](https://github.com/microsoft/vscode/commit/7e0be3048a8a4d6e793b4922b58e22512818378f))
* 온디바이스 ollama 미설치/미실행 시 모델 관련 문제 수정 (Issue [#56](https://github.com/microsoft/vscode/issues/56)) ([76f3179](https://github.com/microsoft/vscode/commit/76f31796f9ef03be35dbf9f65addd1d5252ebdf3))
* 커밋 버튼 label이 소문자로 바뀌는 버그 수정 (Issue [#65](https://github.com/microsoft/vscode/issues/65)) ([db82fb3](https://github.com/microsoft/vscode/commit/db82fb31e34b29956925c2ef1542b5ee7ee3e947))
* 커밋 완료 후 '진짜최종 완료' 정보 메시지 제거 (Issue [#65](https://github.com/microsoft/vscode/issues/65)) ([85bcc42](https://github.com/microsoft/vscode/commit/85bcc42f72c9bae34f4c3d52430a45fbfd248b20))
* 탭 데코레이션 badge도 제거 (Issue [#121](https://github.com/microsoft/vscode/issues/121)) ([6b570c6](https://github.com/microsoft/vscode/commit/6b570c6d2c0d16bcd153164e91ba51b246ee15c2))
* 확장자 없는 파일명으로 파일 찾기 실패하는 버그 수정 ([#18](https://github.com/microsoft/vscode/issues/18)) ([646b491](https://github.com/microsoft/vscode/commit/646b491ae3c352ef78619f183af37e3128564724))


### Styles

* **gitbbon-editor:** Enhance sticky toolbar visual style ([5c8157f](https://github.com/microsoft/vscode/commit/5c8157f2b350f323661075657243649511865fa1))


### Tests

* add github integration unit tests ([b6f1ea2](https://github.com/microsoft/vscode/commit/b6f1ea2258e819b0beae7907ff63d9b37b507d28))
* enhance sync policy unit tests with error handling ([3fad3df](https://github.com/microsoft/vscode/commit/3fad3dfcff6b40a50acbd719151859cf1cd29490))


### Documentation

* add automatic compilation rule to AGENTS.md ([1a04877](https://github.com/microsoft/vscode/commit/1a04877c0c3e9d1f4c3e68d8f1c10e64dadf1421))
* add explicit Korean language requirement for agent output ([16a3f59](https://github.com/microsoft/vscode/commit/16a3f5909d9785d79e08098ab0c3e24c815d9204))
* add GitHub synchronization policy ([fb90646](https://github.com/microsoft/vscode/commit/fb90646ca57682c27ade8d069b9510ce84adf3de))
* Issue [#40](https://github.com/microsoft/vscode/issues/40) - VSCode 코어 수정 주석 규칙을 AGENTS.md/CLAUDE.md에 명시 ([7e54b52](https://github.com/microsoft/vscode/commit/7e54b5220facf03735ce23559ebdfc43f2d98ba1))


### Code Refactoring

* **core:** update explorer model and search view ([0995fa2](https://github.com/microsoft/vscode/commit/0995fa26f06a2bca117e0d620667cd9ced6f2970))
* **ExplorerModel:** optimize text retrieval using range ([93c635b](https://github.com/microsoft/vscode/commit/93c635b885fe29c065c0a46c9c254e7c77b27a48))
* **gitbbon-*:** 로그 접두사 표준화 및 과도한 로그 정리 ([4a5b207](https://github.com/microsoft/vscode/commit/4a5b207feea7b8880aed8da7bf818d141a43956e))
* **gitbbon-search:** AI 검색 결과 하이라이트 제거 ([cbaeeb2](https://github.com/microsoft/vscode/commit/cbaeeb20f45a112fc5383cafa4b830c3b5f81c37))
* **gitbbon-search:** improve logging system and optimize progress output ([d861c16](https://github.com/microsoft/vscode/commit/d861c166bed8936cbbf93c14ebc175216c7d93b5))
* **gitbbon-search:** remove startup indexing progress indicator ([3a75791](https://github.com/microsoft/vscode/commit/3a757911bed2449b354508af50f0908567c2b925))
* improve custom editor and file editor input handling ([0b0867a](https://github.com/microsoft/vscode/commit/0b0867a8c569f592dd3cff5eba47bb5fd7e7ea7e))
* improve streaming response handling ([f75f43b](https://github.com/microsoft/vscode/commit/f75f43bdc64711c72d0118f8e284b4074aa21458))
* Logging mechanism update (use LogOutputChannel) ([4db6a9f](https://github.com/microsoft/vscode/commit/4db6a9f2f062fddb0076c3ab31b615da7f75210e))
* npm run dev 제거, watch/start에 각각 동작 분리 ([e860d3c](https://github.com/microsoft/vscode/commit/e860d3c31bee2429874ef8a3a56e1dfded35df81))
* optimize context building to reduce token usage ([12f4240](https://github.com/microsoft/vscode/commit/12f424020f296b48e1f7fa66db7d78cbb554a053))
* Remove .env file dependency, use SecretStorage only ([13ed6f9](https://github.com/microsoft/vscode/commit/13ed6f973ed4f1a6a8d6c2c5f3fd0a652cb020c6))
* **search:** extension.ts, fileWatcher.ts 개선 ([afde23d](https://github.com/microsoft/vscode/commit/afde23da8b2a065c095844135981a4440b7a207e))
* **search:** extension.ts를 vectorStorageService 연동으로 리팩토링 ([23adefb](https://github.com/microsoft/vscode/commit/23adefbccece35f1b6165788e7aa0db0038a1e1a))
* **search:** metadataService.ts를 vectorUtils.ts로 축소 ([0af71cd](https://github.com/microsoft/vscode/commit/0af71cdf097bfd83b37152c62c869cba9fb1d841))
* simplify to single-model architecture ([c65eb92](https://github.com/microsoft/vscode/commit/c65eb92ee35c7d8576445c03e93670f727b760e9))


### Chores

* .vscode 버전관리 제외 및 ollamaService 업데이트 ([6fac23e](https://github.com/microsoft/vscode/commit/6fac23ef67085db88ec141e3f64f359a39828d66)), closes [#79](https://github.com/microsoft/vscode/issues/79)
* [debug:[#129](https://github.com/microsoft/vscode/issues/129),[#131](https://github.com/microsoft/vscode/issues/131),[#134](https://github.com/microsoft/vscode/issues/134)] 로그 제거 ([27db0b4](https://github.com/microsoft/vscode/commit/27db0b427ecb2a4a5b91ec5ea54ea3d43d3b4e2f))
* [debug:[#136](https://github.com/microsoft/vscode/issues/136)] 로그 제거 ([c76f2d0](https://github.com/microsoft/vscode/commit/c76f2d0337f15f0e1c9f8ceef5e373b9e06a7c78))
* add .vercel to gitignore ([481606f](https://github.com/microsoft/vscode/commit/481606fdb3aa776292a5b6eb98d73f56bedb3cc2))
* add detailed logging for Orama search and ToolLoopAgent steps ([29fc874](https://github.com/microsoft/vscode/commit/29fc874c4458ede401cfb57c7073261c68bb49e1))
* AGENTS.md 설명 보강 및 에이전트 파일 Explorer 숨김 처리 ([65d00ec](https://github.com/microsoft/vscode/commit/65d00ecd77910db812801f51e2b14da415e3314e))
* **deps:** update extension dependencies ([33c1dc9](https://github.com/microsoft/vscode/commit/33c1dc92f59bbb7f8265ca212e9d1a929ba41d5f))
* gitbbon-chat watch를 npm run watch 및 VS Code 빌드 태스크에 통합 ([50afb63](https://github.com/microsoft/vscode/commit/50afb6341a078cc6955c8780fb5c992839d41eab))
* **gitbbon-editor:** package-lock.json 자동 업데이트 ([4d31278](https://github.com/microsoft/vscode/commit/4d31278fa1fd299740226cb6c3466351a2441212))
* **gitbbon-search:** change model dtype from fp32 to fp16 ([0866e0d](https://github.com/microsoft/vscode/commit/0866e0d93fc7aa37e155d12ad3ce6444808de8e2))
* **gitbbon-search:** update ESLint config and improve embedding error handling ([c53ed73](https://github.com/microsoft/vscode/commit/c53ed73178efe067cf3cc6539f7e22a718f14601))
* ignore Claude local settings and backup files ([35651b1](https://github.com/microsoft/vscode/commit/35651b1ec9fb62f47b1bf3b05dd0fce5b30808d0))
* Issue [#102](https://github.com/microsoft/vscode/issues/102) - gitbbon-manager, gitbbon-search watch 스크립트 추가 ([3eaa929](https://github.com/microsoft/vscode/commit/3eaa9299218941e9ade8964182fd808e151a788d))
* Issue [#102](https://github.com/microsoft/vscode/issues/102) - npm run watch에 gitbbon-editor esbuild watch 추가 ([ffd69ab](https://github.com/microsoft/vscode/commit/ffd69ab636863c486b0ed3fcb33691e37eb5e32f))
* Release v1.108.25 ([cb0ee57](https://github.com/microsoft/vscode/commit/cb0ee57019e9be862a3e1c62d9cc9be10c5c1179))
* release 빌드를 macOS ARM(darwin-arm64)만으로 제한, 나머지 주석 처리 ([5af0963](https://github.com/microsoft/vscode/commit/5af0963114bff3bdf33c3b5f0e93df754806a5ad))
* remove debug logs for [#109](https://github.com/microsoft/vscode/issues/109) ([856cf60](https://github.com/microsoft/vscode/commit/856cf60825cd3e2cec335eef90021d2c3994a55b))
* remove debug logs for [#119](https://github.com/microsoft/vscode/issues/119) ([02d8754](https://github.com/microsoft/vscode/commit/02d87543f13beaf5d40dea953c65a242fc791a0f))
* remove debug logs for [#29](https://github.com/microsoft/vscode/issues/29) ([74c8697](https://github.com/microsoft/vscode/commit/74c8697551512452b64f1a1ed442c8a94c378e6e))
* remove debug logs for [#64](https://github.com/microsoft/vscode/issues/64) ([a3e92a5](https://github.com/microsoft/vscode/commit/a3e92a530877f1590b6b0a06f712f5a2367b3718))
* remove debug logs for [#68](https://github.com/microsoft/vscode/issues/68) ([446670b](https://github.com/microsoft/vscode/commit/446670b7799b867373dc0645d71dd7f6e103f6f4))
* remove debug logs for [#74](https://github.com/microsoft/vscode/issues/74) ([123caf6](https://github.com/microsoft/vscode/commit/123caf6ef6c8e331661dfabadc07fdff0641742d))
* remove debug logs for [#74](https://github.com/microsoft/vscode/issues/74) ([83a5166](https://github.com/microsoft/vscode/commit/83a51662c2faf868d601dac3c06483f8f74bdda7))
* remove debug logs for [#77](https://github.com/microsoft/vscode/issues/77) ([12b706d](https://github.com/microsoft/vscode/commit/12b706ddf6659003a975389314a42e05428f2bd5))
* remove debug logs for [#82](https://github.com/microsoft/vscode/issues/82) ([960ca1d](https://github.com/microsoft/vscode/commit/960ca1d36fdc1320ca93542910720f969ec31cff))
* remove debug logs for [#91](https://github.com/microsoft/vscode/issues/91) ([1c5bb69](https://github.com/microsoft/vscode/commit/1c5bb69dae94399572c748d7dbf7ecdee8eeb418))
* remove debug logs for [#97](https://github.com/microsoft/vscode/issues/97) [#98](https://github.com/microsoft/vscode/issues/98) [#99](https://github.com/microsoft/vscode/issues/99) [#100](https://github.com/microsoft/vscode/issues/100) ([9f127f7](https://github.com/microsoft/vscode/commit/9f127f7aaa83439b0255bcb75c12b18f972c25f0))
* remove debug logs from editorProvider [#109](https://github.com/microsoft/vscode/issues/109) ([a194e88](https://github.com/microsoft/vscode/commit/a194e88a7752861d9c3953f5fdca92f2de119be2))
* 불필요한 GitHub Actions 비활성화 ([0779515](https://github.com/microsoft/vscode/commit/0779515ce5792474a92b97de26f6912ff157a4f9))

### [1.108.18](https://github.com/microsoft/vscode/compare/v1.108.18-beta.3...v1.108.18) (2026-01-04)


### Chores

* remove extension build step from release workflow ([e64bdf4](https://github.com/microsoft/vscode/commit/e64bdf4a0090bcbe11d13079894dcacb51c169f5))

### [1.108.2](https://github.com/microsoft/vscode/compare/v1.108.1...v1.108.2) (2025-12-16)


### Features

* Use git worktree for isolated builds ([119f22d](https://github.com/microsoft/vscode/commit/119f22dea73d3148de53976a9ef2915d2b3044d1))


### Bug Fixes

* Move electron-updater to dependencies ([c2477eb](https://github.com/microsoft/vscode/commit/c2477eb951b218f3c5409f3737574d176095cc88))
* Use worktree without branch name to avoid conflicts ([d9a5a57](https://github.com/microsoft/vscode/commit/d9a5a578eb6d2955422c6e9f05ef0617cd6e7546))


### Chores

* Release v1.108.2 ([9739236](https://github.com/microsoft/vscode/commit/9739236f2c0b805597af47a30e93aa2d00742191))

### [1.108.2](https://github.com/microsoft/vscode/compare/v1.108.1...v1.108.2) (2025-12-16)


### Features

* Use git worktree for isolated builds ([119f22d](https://github.com/microsoft/vscode/commit/119f22dea73d3148de53976a9ef2915d2b3044d1))


### Bug Fixes

* Move electron-updater to dependencies ([c2477eb](https://github.com/microsoft/vscode/commit/c2477eb951b218f3c5409f3737574d176095cc88))
* Use worktree without branch name to avoid conflicts ([d9a5a57](https://github.com/microsoft/vscode/commit/d9a5a578eb6d2955422c6e9f05ef0617cd6e7546))


### Chores

* Release v1.108.2 ([9739236](https://github.com/microsoft/vscode/commit/9739236f2c0b805597af47a30e93aa2d00742191))

### [1.108.1](https://github.com/microsoft/vscode/compare/v0.0.1...v1.108.1) (2025-12-16)


### Features

* Add default version suggestion in release script ([c7e22d2](https://github.com/microsoft/vscode/commit/c7e22d2314c1c46db243c292f52512e5f663fbb6))
* Add electron-updater to ESLint allowed imports for electron-main layer ([5cf5680](https://github.com/microsoft/vscode/commit/5cf56809246f223febe9b4d2d3710fb2063b8208))
* Add local release script ([b5b4ec9](https://github.com/microsoft/vscode/commit/b5b4ec9c2e168ae733866f2903d90f4fda8616d4))
* Add private repo auto-update support with GitHub token ([c6d540c](https://github.com/microsoft/vscode/commit/c6d540c9b7a933d56feaea966f435e867b981633))
* Integrate standard-version for automatic CHANGELOG generation ([5651429](https://github.com/microsoft/vscode/commit/5651429e00a7b6c4d994b1c801ba08834b181820))


### Bug Fixes

* Increase memory and timeout for CI builds ([9923694](https://github.com/microsoft/vscode/commit/9923694510083c2ff31c60f66d52d2ff659160ed))


### Chores

* Release v1.108.1 ([2adc6df](https://github.com/microsoft/vscode/commit/2adc6df98fa8801c6b60fdf0236f5b7233b033ba))
* Remove workflow_dispatch trigger ([35a71e8](https://github.com/microsoft/vscode/commit/35a71e8ada44632cb9134d686ce63a608273f9a4))

## [1.108.0](https://github.com/microsoft/vscode/compare/v0.0.1...v1.108.0) (2025-12-16)


### Features

* Add default version suggestion in release script ([c7e22d2](https://github.com/microsoft/vscode/commit/c7e22d2314c1c46db243c292f52512e5f663fbb6))
* Add electron-updater to ESLint allowed imports for electron-main layer ([5cf5680](https://github.com/microsoft/vscode/commit/5cf56809246f223febe9b4d2d3710fb2063b8208))
* Add local release script ([b5b4ec9](https://github.com/microsoft/vscode/commit/b5b4ec9c2e168ae733866f2903d90f4fda8616d4))
* Add private repo auto-update support with GitHub token ([c6d540c](https://github.com/microsoft/vscode/commit/c6d540c9b7a933d56feaea966f435e867b981633))
* Integrate standard-version for automatic CHANGELOG generation ([5651429](https://github.com/microsoft/vscode/commit/5651429e00a7b6c4d994b1c801ba08834b181820))


### Bug Fixes

* Increase memory and timeout for CI builds ([9923694](https://github.com/microsoft/vscode/commit/9923694510083c2ff31c60f66d52d2ff659160ed))


### Chores

* Remove workflow_dispatch trigger ([35a71e8](https://github.com/microsoft/vscode/commit/35a71e8ada44632cb9134d686ce63a608273f9a4))

# Changelog

All notable changes to this project will be documented in this file.
