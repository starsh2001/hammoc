# C. 채팅 · 세션 ★ SDK 핵심

**범위**: 세션 라이프사이클, 스트리밍, 편집·분기, 컨텍스트 오버플로, Abort, Summarize, Rewind, 토큰 사용량.
**선행 도메인**: A, B. 테스트 프로젝트 진입 상태 필요.

---

## C1. 새 세션 시작 `[CORE] [SDK] [ASYNC]`

### C-01-01: 빈 프로젝트에서 첫 메시지 전송
**절차**:
1. 프로젝트 진입 → 빈 채팅 화면 확인
2. ChatInput에 "Hello, reply with exactly: OK" 입력
3. Enter 키 또는 전송 버튼

**기대 결과**:
- 네트워크: `chat:send` WebSocket 메시지 발송 (`browser_network_requests` 에서 WS 프레임 확인)
- UI: 유저 말풍선 즉시 표시 → 어시스턴트 말풍선 스트리밍 시작
- 스트리밍 완료 후 응답에 "OK" 포함
- UsageStatusBar에 토큰 사용량 표시

**엣지케이스**:
- E1. 네트워크 끊김 중 전송: 재연결 후 자동 재시도 또는 오류 배너
- E2. CHAT_TIMEOUT 초과: 자동 abort 후 오류 배너

**증거**: `C-01-01-firstmessage.png`

---

## C2. 메시지 스트리밍 & 렌더링 `[CORE] [SDK] [ASYNC]`

### C-02-01: 스트리밍 진행 중 UI 상태
**목적**: 스트리밍 중 입력바 상태와 Abort 노출 확인.
**절차**:
1. 긴 응답을 유도할 프롬프트 전송 ("Write a 500-word essay about...")
2. 스트리밍 시작 직후 `browser_snapshot`

**기대 결과**:
- 어시스턴트 말풍선에 점진적 텍스트 추가
- 입력바: 전송 버튼이 **중단(Stop)** 버튼으로 바뀜
- `browser_network_requests` 에서 `message:chunk` 이벤트 연속 수신

### C-02-02: 마크다운 · 코드블록 렌더링 (→ S2 참조)
**절차**: "Show a Python hello world in code block" 요청.
**기대 결과**: 코드블록 구문 강조, 복사 버튼 가시.

---

## C3. 메시지 편집 & 대화 분기 `[SDK] [EDGE]`

### C-03-01: 이전 유저 메시지 편집 → 새 분기
**절차**:
1. **최소 2턴 이상 대화 확보** — 편집 대상은 **두 번째 이후 유저 메시지**를 사용. 첫 유저 메시지(`!msg.parentId`)는 [ChatPage.tsx:1339](../../packages/client/src/pages/ChatPage.tsx#L1339) 가드로 편집/요약 버튼이 **렌더되지 않음** (편집 분기의 "resume from" 앵커가 없기 때문). 2턴 대화 예: u1 "Explain X in one sentence" → a1 → u2 "Now explain Y" → a2
2. **두 번째 유저 메시지 버블**에 호버 → 액션 버튼 중 **"편집"** (`aria-label="편집"`) 클릭. 버튼이 보이지 않으면 대상이 첫 유저 메시지인 것이므로 u2+ 로 바꿀 것
3. 버블 위치에 textarea가 노출되면 내용 수정 (기존 텍스트 위에 덮어쓰기)
4. textarea 포커스 상태에서 **Ctrl+Enter** (또는 체크마크 버튼) 로 확정

**기대 결과**:
- `chat:send` 요청에 `resumeSessionAt: <message-uuid>` 포함 (네트워크 확인)
- 새 어시스턴트 응답이 기존 히스토리와 별개 분기로 생성
- **같은 sessionId 유지** (`location.pathname` 불변)
- 채팅 헤더에 **"분기 기록 보기"** 버튼 노출 (분기 카운트 +1)
- Branch Viewer 로 분기 전환 가능

**엣지케이스**:
- E1. 편집 중 다른 탭에서 같은 세션에 새 메시지 도착: 편집 취소 경고 혹은 충돌 감지
- E2. 첫 유저 메시지에 편집 시도: 버튼이 아예 렌더되지 않음 — 이는 회귀가 아닌 **의도된 설계** ([MessageActionBar.tsx:72 showEditButton](../../packages/client/src/components/MessageActionBar.tsx#L72) + [ChatPage.tsx:1339](../../packages/client/src/pages/ChatPage.tsx#L1339))

---

## C4. 컨텍스트 오버플로 & 자동 Compact `[SDK] [EDGE] [MANUAL]`

### C-04-01: 컨텍스트 80%+ 상태에서 compact 유도 `[MANUAL]`
> **자동화 불가 사유**: 기본 모델이 1M 컨텍스트 Opus/Sonnet인 환경에서 90% = 약 900K 토큰 도달이 시간·비용상 비현실적. compact 임계값을 낮추는 테스트 훅(`--compact-threshold=<tokens>`)이 런처에 추가되면 자동화로 전환 가능.

**유도 방법**:
- 매우 긴 본문(수만 토큰) 반복 전송, 또는
- SDK 응답 대용량 유도 프롬프트

**절차**:
1. 토큰 사용량이 UsageStatusBar 기준 80% 이상에 도달할 때까지 메시지 반복
2. 계속 전송

**기대 결과**:
- 90% 근방에서 `system:compact` 이벤트 수신 → "Summarize & Continue" 배너 가시
- 수락 시 자동 요약 후 새 세션 fork, 이전 세션에 "This session is being continued..." 경계선 출력
- 기대: `correctContextWindow()` 로 계산된 1M/200K 한계가 SDK 보고값과 일치

**엣지케이스**:
- E1. 1M 모델에서 SDK `contextWindow` 오보 → `correctContextWindow` 가 올바른 값으로 교정하는지 확인 (커밋 6219883 대응)

---

## C5. 세션 재개 / Fork `[SDK] [ASYNC]`

### C-05-01: 기존 세션 이어가기
**절차**:
1. **선행 세션 확보** — 세션 리스트가 비어있는 경우 먼저 새 세션 생성 후 메시지 "Hello"를 전송하여 응답 완료까지 대기. `browser_evaluate("() => fetch('/api/projects/<slug>/sessions').then(r => r.json())")` 로 세션 1개 이상 존재 확인
2. 프로젝트 페이지로 복귀 후 세션 리스트에서 방금 만든 세션 카드 클릭 (또는 "계속" 버튼)
3. `browser_snapshot` → 이전 메시지 "Hello" 및 응답이 히스토리에 렌더링됨 확인
4. "Continue." 메시지 전송 → 응답 수신
5. 응답 완료 후 DOM 메시지 버블 카운트 확인 (REST `sessions/:id/messages` 엔드포인트는 없음 — 히스토리는 `session:join` 시 `stream:history` 이벤트로 전달되고 클라이언트가 렌더):
   ```js
   browser_evaluate(`() => document.querySelectorAll('[data-testid="message-bubble"], .message-bubble').length`)
   // ≥ 4 (user+assistant 2쌍)
   ```

**기대 결과**:
- `session:join` + `resume: <sessionId>` 이벤트
- 히스토리 렌더링 후 새 메시지 이어짐
- 동일 세션 ID 유지

> 세션 리스트가 비어있어 BLOCKED 처리 금지 — 절차 1단계로 반드시 선행 세션을 생성할 것.

### C-05-02: 특정 메시지 시점에서 Fork
**절차**:
1. 세션의 어시스턴트 메시지 버블 우측에서 **"여기서 새 세션으로 포크"** 버튼 클릭 (`aria-label="여기서 새 세션으로 포크"`)
2. 포크 프롬프트 입력 다이얼로그가 열림 → 새 프롬프트 텍스트 입력 (비워두면 기본 `fork.prompt` 사용)
3. 다이얼로그의 "확인" 버튼 클릭
4. `browser_evaluate`로 URL 경로에서 새 `sessionId`가 원본과 다른지 확인:
   ```js
   browser_evaluate(`() => location.pathname.split('/session/')[1]`)
   ```
5. 프로젝트 sessions API로 세션이 +1 증가했는지 검증:
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/sessions').then(r => r.json()).then(d => d.total)`)
   ```

**기대 결과**:
- **새 sessionId** 발급 (`session:forked` 이벤트)
- 원본 세션은 변경 없음, 새 세션은 분기점까지 히스토리만 가짐
- 프로젝트 세션 총 개수 +1

> **UI 구조 주의**: Fork 버튼은 메시지 컨텍스트 메뉴가 아닌 **어시스턴트 메시지 버블에 직접 노출되는 액션 버튼**이다 ([MessageBubble.tsx onFork](../../packages/client/src/components/MessageBubble.tsx)). 클릭만으로 즉시 fork되지 않고 프롬프트 입력 다이얼로그가 먼저 열리므로, 다이얼로그 확인 절차를 반드시 거쳐야 한다 ([ChatPage.tsx:975-995 handleForkClick/handleForkConfirm](../../packages/client/src/pages/ChatPage.tsx#L975-L995)).

**엣지케이스**:
- E1. 동시 Fork (다중 탭에서 같은 메시지 분기): 각자 독립 세션 생성, 충돌 없음

---

## C6. 세션 검색 & 정렬 `[CORE]`

> **검증 경로 주의**: 본 도메인의 "세션 리스트 검색창"은 **프로젝트 > 세션 탭 ([ProjectSessionsPage.tsx](../../packages/client/src/pages/ProjectSessionsPage.tsx))** 의 검색창이다. 채팅 페이지의 Quick Panel 세션 탭에 있는 간소화된 검색창이 **아니다** — Quick Panel에는 콘텐츠 검색 토글이 없다.
>
> **API 파라미터 이름**: 서버가 읽는 쿼리 파라미터는 `query=` 이다 (`q=` 아님). `searchContent=true`와 함께 전송. [sessionController.ts:41,44](../../packages/server/src/controllers/sessionController.ts#L41-L44) 참조.

### C-06-01: 메타데이터 검색 (제목 · 첫 프롬프트)
**절차**:
1. **선행 세션 3개 확보** — 세션 리스트에서 키워드 구분되는 3개 세션 생성:
   - 세션 A: 첫 메시지 "Explain KEYWORD_ALPHA architecture"
   - 세션 B: 첫 메시지 "Describe BETA pattern"
   - 세션 C: 첫 메시지 "GAMMA overview"
   각 응답 완료 대기
2. 프로젝트 > 세션 탭으로 이동 (`ProjectSessionsPage`)
3. 세션 리스트 검색창에 `KEYWORD_ALPHA` 입력 (300ms debounce)
4. `browser_snapshot` → 세션 A만 노출, 나머지 필터링 확인
5. 검색어 지우고 `BETA` 입력 → 세션 B만 노출 확인

**기대 결과**: 키워드가 제목/첫 프롬프트에 포함된 세션만 필터링.

### C-06-02: 콘텐츠 검색 (JSONL 라인)

> **설계 한계 주의**: "첫 메시지/제목에는 없고 본문에만 키워드가 등장하는 세션"을 유저 프롬프트만으로 생성하는 것은 **실질 불가능**하다 — Claude에게 특정 단어를 응답시키려면 그 단어를 유저 메시지에 포함해야 하고, 그 순간 서버의 메타데이터 검색(첫 메시지 매치)에도 걸린다. 따라서 이 시나리오는 **두 경로를 분리 검증**한다:
> - **(a) API 파라미터 & 엔드 투 엔드 검증** — 본문에 키워드가 있는 세션을 만들고, `searchContent=true` 요청이 정상 송신되어 서버가 콘텐츠 검색 경로를 실행하는지 확인 (본 시나리오 주 절차)
> - **(b) 서버 유닛 경로 검증** — "메타 0건 / 콘텐츠 1건" 구분은 런처 테스트 훅(`/api/debug/seed-session?bodyOnly=true`)으로 직접 jsonl에 메타와 body가 다른 세션을 주입해야 완전 재현 가능. 해당 훅이 없다면 이 부분은 PASS로 취급하고 후속 인프라 작업으로 보고

**절차**:
1. **선행 세션 확보** — 유저 메시지와 어시스턴트 본문 모두에 키워드가 포함되는 세션 1개 생성:
   - 세션 X: 첫 메시지 "Please respond with the word DELTA_ONLY_IN_BODY in your reply" → 응답 완료 대기 (어시스턴트 본문에도 `DELTA_ONLY_IN_BODY` 포함)
2. 프로젝트 > 세션 탭으로 이동 (`ProjectSessionsPage`)
3. 세션 리스트 검색창에 `DELTA_ONLY_IN_BODY` 입력 (300ms debounce)
4. **검색어가 입력된 이후에** 검색창 하단에 노출되는 `"콘텐츠 검색"` 체크박스(`input[type="checkbox"]`, 라벨 `session.searchContent`)를 체크 — 토글은 `localSearchQuery.trim() && (...)` 조건부 렌더이므로 검색어 없이는 표시되지 않음 ([ProjectSessionsPage.tsx:373-388](../../packages/client/src/pages/ProjectSessionsPage.tsx#L373-L388))
5. `browser_network_requests` 또는 직접 `fetch('/api/projects/<slug>/sessions?query=DELTA_ONLY_IN_BODY&searchContent=true')` 로 요청 확인 — **query 파라미터 이름이 `q`가 아니라 `query` 임에 주의** ([sessionController.ts:41,44](../../packages/server/src/controllers/sessionController.ts#L41-L44))
6. 응답의 `sessions[]` 에 세션 X가 포함되는지 확인 — 본 시나리오에서는 유저 프롬프트에도 키워드가 있으므로 `searchContent=false` 상태(메타 검색만)에서도 1건 매치될 수 있다는 점을 허용 (이 셋업의 한계 — 위 "설계 한계 주의" 참고)
7. 핵심 PASS 조건: 토글 ON 상태에서 요청 URL에 `&searchContent=true` 가 포함되고, 응답 `sessions[]` 에 세션 X가 포함

**기대 결과**:
- 서버 `searchSessions(..., searchContent: true)` API 호출 (`browser_network_requests` 또는 직접 fetch 응답에서 확인)
- 응답에 세션 X 포함
- content 검색은 metadata 매칭 제외된 세션 중 최대 100개 후보만 스캔 — [sessionService.ts:469-472](../../packages/server/src/services/sessionService.ts#L469-L472)
- 대용량 세션(500+ 메시지)에서도 2초 내 응답

**엣지케이스**:
- E1. "메타 0건 / 콘텐츠 1건" 엄밀 구분: 런처 훅(`/api/debug/seed-session`)을 통한 직접 jsonl 주입이 필요. 현재 인프라 미비이므로 해당 구분은 별도 유닛 테스트([sessionService.test.ts](../../packages/server/src/services/__tests__/sessionService.test.ts))로 커버하고, 통합 테스트는 API 파라미터 송신 + 응답 매치까지만 검증

---

## C7. Abort / ESC 중단 `[SDK] [ASYNC]`

### C-07-01: 스트리밍 중 ESC 로 중단
**절차**:
1. 긴 응답 유도 프롬프트 전송
2. 수 초 후 입력바 포커스 상태에서 ESC
**기대 결과**:
- `chat:abort` 이벤트 전송
- 어시스턴트 말풍선에 부분 텍스트 + "중단됨" 표시
- 입력바 즉시 idle 상태 복귀

### C-07-02: Ctrl+C 중단 (텍스트 미선택 상태)
**절차**: 입력바에서 텍스트 선택 없이 Ctrl+C.
**기대 결과**: Abort 수행. 텍스트가 선택된 상태면 복사만 동작해야 함.

---

## C8. Summarize & Continue `[SDK] [EDGE]`

### C-08-01: 수동 Summarize 트리거

> **동작 원리 — Edit와 동일 패턴**: Summarize는 fork가 아닌 **Edit와 동일한 메커니즘**으로 동작한다. 클릭 → 서버가 요약 생성 → 해당 어시스턴트 메시지 버블이 **편집 모드로 자동 전환**되고 textarea에 요약 텍스트가 로드됨 → 사용자가 **Ctrl+Enter로 확정**하면 Edit 플로우를 그대로 재사용해 **같은 세션 내 새 브랜치** 생성. **sessionId는 변하지 않음**. ([MessageBubble.tsx:91-99 auto-open edit form when summary result arrives](../../packages/client/src/components/MessageBubble.tsx#L91-L99))

**절차**:
1. **최소 4턴 이상 대화 확보** — 서버 가드가 "대상 메시지 *이후* 메시지 ≥4개"를 요구하므로 ([websocket.ts:1798](../../packages/server/src/handlers/websocket.ts#L1798)), 2번째 유저 메시지에서 Summarize 하려면 전체 ≥4턴(user+assistant 쌍 4세트)이 필요. 미달 시 서버가 `"Too few messages to summarize"` 에러로 **silent 거부**(토스트는 뜨지만 UI 변화 0). 깨끗한 세션 권장 — fork/rewind/edit 이력이 있으면 `isSummarizing`/`isOnOldBranch` state 오염으로 버튼이 undefined로 무력화될 수 있음 ([ChatPage.tsx:1343](../../packages/client/src/pages/ChatPage.tsx#L1343))
2. **유저 메시지 버블**에 마우스 호버 → 우측 액션 버튼 중 **"여기서부터 요약 후 다시 시작"** 버튼 (`aria-label="여기서부터 요약 후 다시 시작"`) 클릭. 이 버튼은 MessageActionBar의 `showSummarizeButton = isUser && ...` 가드로 **유저 메시지에만** 렌더되며 ([MessageActionBar.tsx:74](../../packages/client/src/components/MessageActionBar.tsx#L74)), 첫 유저 메시지(`!msg.parentId`)에는 노출되지 않음
3. `browser_wait_for` 로 요청 송신 대기 — 서버 로그 `session:generate-summary sessionId=... messageUuid=...` 관측 가능 ([websocket.ts:1811](../../packages/server/src/handlers/websocket.ts#L1811))
4. **요약 생성 완료까지 ~20~30초 소요** — 클릭 직후에는 spinner/label 전환이 즉시 보이지 않을 수 있으므로 최소 40초는 기다릴 것. 완료 후 해당 메시지 버블이 편집 모드로 전환됐는지 `browser_snapshot` 으로 확인 — 증거:
   - 해당 버블 위치에 textarea 노출 (기존 `input[type="checkbox"]`/`button[aria-label="편집"]` 대신 textarea + "확인" 버튼 가시)
   - textarea value에 요약 텍스트가 로드되어 있음 (수백자 내외, 한국어/영어로 `# 대화 요약` 같은 헤더 포함)
   - `browser_evaluate('() => Array.from(document.querySelectorAll("textarea")).map(t => t.value).filter(v => v.length > 50)')` 로 summary 로드 확인
5. textarea에 포커스 주고 **Ctrl+Enter** 로 확정
6. **같은 sessionId 유지**된 채 새 브랜치가 생성됐는지 검증:
   - `location.pathname` 의 sessionId 불변
   - 채팅 헤더에 **"분기 기록 보기"** 버튼 노출 (또는 기존 카운트 +1 증가)
   - 응답 스트리밍 후 요약 이후의 새 대화 흐름이 생성됨

**기대 결과**:
- `session:generate-summary` 요청 (`summarizeService` 호출)
- 클라이언트 수신 시 [useStreaming.ts:1512-1513](../../packages/client/src/hooks/useStreaming.ts#L1512-L1513) `setSummaryResult({ messageUuid, summary })` → MessageBubble `useEffect`가 편집 모드 자동 오픈
- Ctrl+Enter 확정 시 Edit와 동일하게 `chat:send` + `resumeSessionAt` 로 같은 세션 내 새 브랜치 생성
- **원본 브랜치는 유지**되고 "분기 기록 보기"로 왕복 가능
- 원본 세션은 변경 없음 (C-03-01 Edit와 같은 UX)

> **UI 구조 주의**: Summarize는 슬래시 명령(`/summarize`)이 아닌 **어시스턴트 메시지 버블의 액션 버튼**으로 제공된다 ([MessageBubble.tsx onSummarizeFromHere](../../packages/client/src/components/MessageBubble.tsx)). `/summarize`는 내장 슬래시 목록에 없어 "Unknown command"로 응답된다. 채팅 헤더의 "더보기 메뉴"에도 Summarize 항목은 없다.
>
> **Fork 아님**: 세션 URL 변화 / 프로젝트 세션 총 수 +1 / 새 sessionId 발급을 기대하지 말 것. Summarize = Edit 브랜치 생성 패턴이며 **세션 수는 그대로**, sessionId도 그대로. 이 셋 중 하나라도 관측되면 오히려 회귀 신호.

**엣지케이스**:
- E1. 요약 생성 실패 (SDK 오류): `toast.error` 알림 ([useStreaming.ts:1507-1509](../../packages/client/src/hooks/useStreaming.ts#L1507-L1509)) + 원본 세션/브랜치 무결성 유지, 편집 모드로 전환되지 않음
- E2. 대상 메시지 이후 메시지 <4개인 세션: 서버 `websocket.ts:1798` 가드가 "Too few messages to summarize" 에러 반환 → `toast.error` 표시, 편집 모드 전환 없음. **현실적으로 2턴 대화에서 2번째 유저 메시지(u2)에 클릭하면 after = [a2] 단 1개라 자동 rejected** — 따라서 최소 4턴 필요
- E3. 이미 `isSummarizing=true` 상태에서 재클릭: 같은 버튼이 **cancel 토글**로 동작 ([ChatPage.tsx:960-964](../../packages/client/src/pages/ChatPage.tsx#L960-L964)) — `session:cancel-summary` emit 후 `setSummarizing(false, null)`. 이 상태 오염이 자동화 테스트에서 "클릭해도 아무것도 안 일어남" 오진단 원인이 될 수 있으므로 시나리오 시작 시 반드시 새 세션에서 진행

---

## C9. Code Rewind `[SDK] [EDGE]`

### C-09-01: 파일 체크포인트로 되돌리기
> **설계 원칙**: Hammoc은 Claude CLI의 세션 JSONL에 커스텀 엔트리를 주입하지 않음 (SDK 포맷 변경 리스크 회피). 되감기 완료는 toast 알림으로만 통지.

**절차**:
1. **Settings → 고급 설정(Advanced)** 진입 → "파일 체크포인트" 섹션 → "채팅 세션" 토글 활성화 (이미 활성이면 통과) — 자동 저장
2. 새 세션 시작 → "Create a file named rewind-test.txt with content: version-1" 프롬프트 전송 → 권한 Allow → 파일 생성 확인
3. 이어서 "Now change rewind-test.txt content to: version-2" 전송 → 권한 Allow → 변경 확인
4. 두 번째 수정 메시지 버블에 호버 → 우측 **"코드 되돌리기"** 버튼 (`aria-label="코드 되돌리기"`) 클릭
5. 드라이런 확인 다이얼로그에서 파일 변경 내역(파일명/+삽입/-삭제) 확인 → 승인
**기대 결과**:
- `session:rewind-files` 요청 (dryRun → 실제 순)
- 선택 지점 이후의 파일 변경 역순 복원 (`rewind-test.txt` 내용이 version-1 로 복귀)
- 성공 toast "N개 파일 되돌림" 표시
- 변경 없음 시 info toast, 실패 시 error toast

> **설정 경로 주의**: 파일 체크포인팅 토글은 **프로젝트별 설정이 아닌 전역 Advanced Settings**에 있다 ([AdvancedSettingsSection.tsx](../../packages/client/src/components/settings/AdvancedSettingsSection.tsx)). "채팅 세션" / "큐 러너" 두 토글이 별도로 존재하며, 이 시나리오는 "채팅 세션" 토글을 활성화해야 한다.

---

## C10. 토큰 사용량 표시 `[SDK] [CORE]`

> **설계 원칙**: 관심사 분리
> - `UsageStatusBar`: 구독 요금제 Rate Limit (5h/7d) 글로우 닷 전용
> - `ContextUsageDisplay`: 컨텍스트 사용률 도넛 + 툴팁 안에 입력/출력/캐시 토큰 및 누적 USD 비용

### C-10-01: UsageStatusBar 구독 요금제 표시
**절차**: OAuth 구독 계정 로그인 상태에서 채팅 페이지 하단 `[data-testid="usage-status-bar"]` 확인.
**기대 결과**:
- 5h/7d 글로우 닷 표시 (사용률 <50% 초록, 50~80% 노랑, ≥80% 빨강+펄스)
- 각 닷에 호버 시 사용률 % 및 리셋 시각 툴팁
- 데이터 없으면(`rateLimit` 없음) 컴포넌트 렌더링 안 됨
- API 키 로그인 시에는 표시 안 됨

### C-10-02: ContextUsageDisplay 도넛 차트 + 토큰 상세
**절차**:
1. 짧은 메시지 1회 주고받은 후 `[data-testid="context-usage-display"]` 확인
2. 도넛 호버 → 툴팁 확인

**기대 결과**:
- 도넛 차트에 컨텍스트 사용률 % 표시
- 임계값별 색상 변화 (경고 노랑, 위험 빨강)
- 툴팁에 다음 항목 표시:
  - 입력 토큰(uncached)
  - 캐시 생성 / 캐시 읽기 토큰
  - 출력 토큰
  - 누적 비용 (USD)
- 값들이 SDK 응답의 usage 필드와 일치

**엣지케이스**:
- E1. 컨텍스트 데이터 없으면 컴포넌트 렌더링 안 됨 (오해 소지 있는 0% 방지)

> **Thinking 토큰 필드는 툴팁에 없음** — 현재 `ContextUsageDisplay.tsx` 구현([L60-73](../../packages/client/src/components/ContextUsageDisplay.tsx#L60-L73))은 입력/캐시/출력/비용만 표시한다. Thinking 토큰 수치 UI 표시는 미구현이므로 본 시나리오 검증 대상 아님. Thinking 관련 렌더링은 E-02-01의 ThinkingBlock 렌더링 검증 참고.

---

## C11. CLI 엔진 대화 (구독 풀 · 블록 단위 렌더) `[MANUAL]`

> **범위 (Epic 33)**: 전역 설정에서 **CLI** 엔진을 선택한 세션에서, 대화가 SDK 모드와 *동일한 세션 JSONL* 로 렌더·복원되는지. SDK 모드와의 차이는 *블록 단위 렌더*(기본은 토큰 단위 타이핑 애니메이션 없음 — 단 `cliSyntheticTyping`(=「타이핑·카드 연출」) 토글 ON 시, 한 턴에 동시 도착하는 블록들을 클라이언트가 시간축에 직렬화하여 **텍스트는 글자 단위 타자기**로, 이어지는 **도구·사고 카드는 `cliCardStaggerMs`(기본 500ms) 간격으로 하나씩 버블 등장**시킴. 순수 미관·claude PTY 무관)와 생성 진행률 인디케이터(`↓ N tokens · Ns`).

> **[MANUAL] 사유**: CLI 엔진은 **구독-인증된 실제 `claude` 바이너리 + 인터랙티브 PTY** 를 spawn 한다. 통합 테스트 하네스(헤드리스 production 서버)에는 구독 인증된 claude 가 없고, PTY TUI 화면 파싱은 타이밍에 취약해 자동화가 구조적으로 불안정 → 릴리즈 직전 수동 회귀로 검증한다. (토글·CLI 설정의 UI 렌더·선택·영속은 자동화됨 — P-06-01.)

### C-11-01: CLI 선택 → 송신 → 블록 렌더 + 진행률 인디케이터 (수동)
**선행 조건**: 구독 로그인된 `claude` 바이너리가 호스트 PATH(또는 설정한 바이너리 경로)에 존재.

**절차 (수동)**:
1. 전역 설정 → "Conversation Engine" 에서 **CLI** 선택 (P-06-01 참조)
2. 새 세션 생성 후 짧은 메시지 송신 (예: `Say hello in one sentence.`)
3. 생성 중 화면 관찰 (진행률 인디케이터 — 스피너 모션 · 토큰 수 · 경과초 + 응답 도착 방식)
4. 응답 완료 후 같은 세션을 새로고침(reload)해 히스토리 복원 관찰
5. (선택) "CLI Mode Settings" 의 바이너리 경로에 커스텀 claude 경로를 넣고 2~3 단계 재수행

**기대 결과**:
- 응답이 **블록 단위로** 나타남 — SDK 모드의 토큰 단위 스트리밍과 달리 완성된 블록이 한 번에 렌더. `cliShowGenerationProgress` ON 이면 생성 중 `↓ N tokens · Ns` 진행률 인디케이터 노출 (OFF 면 미노출). 스피너는 **브레일 회전 글자**(점 밝기 변화가 아님), `Ns` 는 **클라이언트가 응답 시작 시점부터 직접 잰 실측 경과 시간**(claude 화면에서 긁은 초가 아님)
- 완료된 대화가 SDK 모드와 **동일하게** reload 후 복원 — 동일 세션 JSONL 을 공유 historyParser 가 읽음 (live↔reload 동형)
- 커스텀 바이너리 경로가 유효하면 그 claude 로 spawn; 무효하면 서버 경고 로그 + auto-detect 폴백 — 대화는 계속됨(하드 실패 없음)
- SDK 모드로 되돌리면 즉시 토큰 스트리밍 동작 복귀 (회귀-0)
- `cliSyntheticTyping` 토글이 **OFF(기본)** 면 한 턴의 블록(텍스트+도구 카드)이 한꺼번에 렌더, **ON** 이면 텍스트가 먼저 글자 단위로 타자기처럼 나온 뒤 도구·사고 카드가 `cliCardStaggerMs` 간격으로 하나씩 등장하고, 응답 완료 시 잘리지 않고 자연히 끝난 뒤 권위 메시지로 교체. (이전엔 도구 카드가 도착하며 타이핑 중 텍스트를 즉시 완성시켜 타자기 효과가 묻혔으나, 연출 큐가 카드 등장을 타이핑 완료 후로 직렬화해 해소.) 이 연출은 claude PTY 와 독립된 순수 클라이언트 렌더라 자동 회귀로 커버됨(`presentationQueue` 단위 테스트 + `useStreaming` synthetic typing 테스트 + `syntheticTyper` 단위 테스트) — 수동 단계에선 체감만 확인

**엣지케이스**:
- E1. 무효 바이너리 경로 → 턴이 죽지 않고 auto-detect 로 graceful fallback (서버 경고 로그 1줄)
- E2. 동일 세션을 SDK↔CLI 모드 전환해도 렌더 정합 — 세션 id 사전할당으로 wire 동일(rekey 없음, 스키마 drift 없음)
- E3. 토큰 카운터(`↓ N tokens`)가 잠시 멈춰도 `Ns` 경과초는 매초 계속 증가 — 시간은 CLI 파싱과 독립된 클라이언트 실측이므로 시계가 얼어붙지 않음
- E4. `cliSyntheticTyping` 토글 ON↔OFF 즉시 반영 — OFF 면 블록 즉시 렌더, ON 이면 텍스트 타자기 + 도구/사고 카드 stagger 등장. `cliCardStaggerMs` 입력은 토글 ON 일 때만 노출되고 값 변경이 다음 카드 등장 간격에 반영. 권한/질문 카드는 사용자 입력을 막지 않도록 즉시 노출(애니메이션 건너뜀). SDK 모드에선 토글과 무관하게 항상 실토큰 스트리밍(연출 비적용)

### C-11-02: CLI 엔진 이미지 첨부 → 모델이 이미지 내용 인식 (수동)
**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude` 바이너리). CLI 엔진 선택 상태.

**절차 (수동)**:
1. 전역 설정 → "Conversation Engine" 에서 **CLI** 선택 (P-06-01 참조)
2. 새 세션에서 식별 가능한 텍스트가 박힌 이미지(예: `HAMMOC-VISION-7493` 같은 단어가 적힌 스크린샷)를 입력창에 첨부 (페이퍼클립 / 드래그앤드롭 / 붙여넣기 — §2.4)
3. `첨부한 이미지에 적힌 텍스트를 그대로 알려줘` 와 함께 송신
4. 응답 관찰

**기대 결과**:
- 송신 메시지 카드에 이미지 썸네일이 표시(SDK 모드와 동일한 첨부 UI) — 첨부 방식·미리보기는 엔진과 무관하게 동일
- 모델 응답이 이미지에 박힌 실제 텍스트(`HAMMOC-VISION-7493`)를 정확히 포함 — CLI 엔진은 첨부 파일을 디스크 경로로 참조시키고 그 디렉토리를 세션의 읽기 허용 디렉토리로 등록하므로, PTY 텍스트 채널만으로도 모델이 이미지를 Read 로 열어 본다
- 이미지를 읽는 동안 권한 다이얼로그가 끼어들지 않음(첨부 디렉토리가 spawn 시 사전 허용됨)

**엣지케이스**:
- E1. 다중 이미지(최대 5장, §2.4) 첨부 시 모델이 각 이미지를 모두 읽음 — 같은 세션의 첨부 디렉토리는 한 번만 허용 등록
- E2. (외부 요인) 일부 claude 빌드/플랫폼에서 파일 기반 이미지 비전이 불안정하다는 업스트림 신고가 있음 — 모델이 이미지를 못 보면 Hammoc 외부 원인이며, 같은 이미지를 SDK 엔진에서 재시도해 구분한다. 텍스트 대화 자체는 영향 없음

### C-11-03: CLI 엔진 라이브 도구 카드 — 자동 승인·안전 도구 (Story 32.9) (수동)
**배경**: Story 32.9 전에는 CLI 모드가 도구 실행 이벤트를 라이브로 보내지 않아, 모델이 도구를 쓰는 진행(지금 무슨 도구로 어떤 파일을 수정 중인지)을 응답 완료 후 reload 전까지 볼 수 없었다. 32.9는 *권한이 개입하지 않는* 도구(Bypass 모드 전체 · default 모드 read-only/자동 승인)의 `tool:call`/`tool:result` 를 SDK 모드와 **동일한 ToolCard** 로 라이브 방출한다. (승인 필요 도구는 라이브 카드를 억제하고 D-01-03 의 독립 권한 카드 + reload 로 처리.)

**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude` 바이너리). CLI 엔진 선택 상태.

**절차 (수동)**:
1. 전역 설정 → CLI 엔진 선택, 권한 모드 **Bypass** (또는 read-only 도구 유발이면 default)
2. 도구를 쓰게 하는 메시지 송신 — read-only 예: `이 저장소의 package.json 을 읽고 name 필드를 알려줘`(Read) / `*.ts 파일을 검색해줘`(Glob·Grep); Bypass 예: `probe-329.txt 파일을 만들어`(Write)
3. **생성 중** 화면 관찰 — 도구 카드가 *그 순간* 뜨는지, Write/Edit 이면 카드에 대상 **파일 경로**가 표시되는지
4. 응답 완료 후 reload 해 히스토리 복원 관찰

**기대 결과**:
- 도구 호출 시점에 SDK 모드와 **동일한 ToolCard** 가 라이브로 노출 — 도구명 + 입력(Write/Edit 의 `file_path` 등)이 흘러 "지금 무슨 도구로 어떤 파일을 만지는지" 를 응답 완료 전에 파악. 블록 단위라 SDK 의 호출-즉시보다 약간 지연될 수 있음(JSONL 블록 완성 시점)
- 도구 결과(성공/실패)가 같은 카드에 채워짐 (`tool:result` 미러)
- 도구 결과 영역에 하니스가 주입하는 `<system-reminder>` 블록(todo 미사용 알림·빈 파일 경고 등)이나 SDK 래퍼 태그(`<tool_use_error>` 등)가 raw 로 노출되지 않음 — 결과 텍스트만 정제되어 표시. 정제는 SDK·CLI·라이브·히스토리 4 경로가 공유하는 단일 함수(`sanitizeToolResultContent`)라 양 엔진 동일 동작
- 완료 reload 시 **이중 렌더 없음** — 라이브 카드는 일시적이고 권위 reload(`stream:complete-messages`)가 전체 교체(SDK 모드와 동일 메커니즘)
- SDK 모드로 되돌려도 도구 카드 동작 동일(회귀-0)

**엣지케이스**:
- E1. 승인 필요 도구(Ask/default 의 Write·Bash)는 라이브 도구 카드가 **뜨지 않고** D-01-03 의 독립 권한 카드로만 표시 — 승인 후 reload 시 도구 블록 자연 렌더(억제 보장 → 카드 중복 0)
- E2. 한 턴에 자동 승인 도구 + 승인 필요 도구가 섞이면 자동 승인 도구만 라이브 카드, 승인 필요 도구는 권한 카드(FIFO 억제) — 둘이 분리/중복되지 않음

### C-11-04: CLI 세션 송신 직후 목록 이탈 → 활성 세션이 리스트에 유지 (수동)
**배경**: CLI 엔진은 새 세션의 JSONL 파일을 인터랙티브 `claude` TUI 가 부팅(~수 초)한 뒤에야 처음 기록한다. 세션 목록은 디스크의 JSONL 존재에 의존하므로, 송신 직후 곧바로 목록 화면으로 빠져나가(그 세션 룸 소켓이 떨어지)면 파일이 아직 없는 활성 세션이 목록에서 통째로 누락되었다(요약/스니펫으로 "보내자마자 이탈" 시 *방금 시작한 세션이 안 보임*). 이제 서버가 송신 시점에 붙잡아 둔 **실행 중 스트림**(프로젝트 슬러그 + 첫 프롬프트 포함)을 디스크 목록에 합쳐, 파일 생성 전에도 행으로 띄운다.

**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude`). CLI 엔진 선택 상태.

**절차 (수동)**:
1. 전역 설정 → CLI 엔진 선택
2. 새 세션에서 메시지 송신 (요약/스니펫 등 한 번에 긴 프롬프트면 부팅 창이 길어 재현 쉬움)
3. **응답 도착 전에** 즉시 프로젝트 세션 목록으로 이동
4. 목록 관찰 → 잠시 후 다시 관찰

**기대 결과**:
- 방금 보낸 세션이 목록 최상단에 **스트리밍(초록 점)** 또는 **대기(앰버 배지)** 행으로 표시 — JSONL 파일이 아직 없어도 누락되지 않음
- 행 제목이 "빈 세션" 이 아니라 **송신한 첫 프롬프트 미리보기** 로 표시
- claude 부팅·첫 기록이 끝나면 같은 자리가 디스크 기반 정식 행으로 자연 전환(중복 행 0)

**엣지케이스**:
- E1. 다른 프로젝트에서 시작한 활성 세션은 현재 프로젝트 목록에 섞이지 않음(프로젝트 슬러그로 분리)
- E2. 2페이지 이상(`offset>0`)에는 이 합성 행이 끼지 않음(첫 페이지 한정, 페이지네이션 합계 불변)
- E3. SDK 모드는 파일이 즉시 생겨 race 창이 사실상 없지만 동일 합류 로직이 적용되어 무해(회귀-0)

> **자동 회귀**: 목록 합류 로직(실행 중 스트림 ∪ 소켓 연결 세션, 파일 없는 것만, 첫 페이지 한정, 프로젝트 분리, 첫 프롬프트 미리보기)은 서버 단위 테스트(`sessionController.test.ts`)가 커버. 수동 단계는 CLI 부팅 창에서의 *체감*만 확인.

### C-11-05: CLI 엔진 턴 종료 정합 — 사용 한도 중지 · 무타임아웃 · 질문 선행 텍스트 순서 · 토큰 카운터 (수동)
**배경**: CLI 엔진은 응답을 세션 JSONL 에서 읽어 렌더하고, 턴 종료도 JSONL 의 `end_turn` 으로 판단한다. 이 모델의 네 가지 구멍을 메운다. (1) **사용 한도** 도달 알림("You've hit your weekly limit · resets 1am (Asia/Seoul)")은 **화면(PTY)에만** 뜨고 JSONL 엔 절대 기록되지 않아, 감지가 없으면 턴이 영원히 응답 대기로 멈췄다. **단 같은 문구가 대화 내용으로도 화면에 뜰 수 있어**(예: 한도 기능을 개발·인용한 세션을 `--resume` 하면 과거 대화가 화면에 다시 칠해짐) 진짜 배너와 구분되지 않는 오탐이 생긴다 — 그래서 감지는 **프롬프트 주입 이후**(이번 턴이 실제 생성하는 화면)만 보고(주입 이전 재개 repaint 제외), 추가로 **실제 OAuth 사용량 수치와 대조**해 모든 창에 여유가 있으면 무시한다. **이제(Story 37.4) 한도·권한·질문 감지의 입력이 모두 선형 ANSI 버퍼가 아니라 서버측 헤드리스 터미널이 재구성한 *최종 화면 그리드*** 다 — 토큰(37.2)과 같은 정착 그리드를 공유한다. (2) CLI 모드의 **inactivity 타임아웃을 제거**했다 — 깊은 사고·긴 도구 실행으로 화면이 잠시 조용해도 정상 작업이 죽지 않도록(예전엔 5분 무활동 시 중단). (3) 질문(AskUserQuestion) 앞의 **설명 텍스트**는 JSONL 에 *답변 후에야* 기록되는데 선택지 카드는 화면 감지로 먼저 떠서, 설명이 *답변을 누른 뒤* 나오는 순서 역전이 있었다. **또한 질문 모달의 선택지 라벨은 예전 선형 버퍼에서 박스 테두리(`│`·`──────`)가 글자에 섞이고 같은 칸 융합으로 깨졌는데(32.8 리포트의 "│-laden·──────-stretched 라벨"), 그리드에선 *각 선택지가 자기 행*으로 분리돼 행 단위로 읽으면 라벨 본문이 온전하고 옵션↔번호 순서가 화면 top-to-bottom 과 일치한다(Story 37.4 — 박스 chrome 깨짐의 구조적 해소).** (4) 토큰 진행률 카운터(`↓ N tokens`)는 **예전엔** 화면 제자리 갱신을 ANSI 평탄화한 *선형 버퍼*에서 읽어, 같은 칸의 연속 값이 이어붙어 거대 숫자("365"+"366"→"365366")가 잠깐 떴고 이를 막으려 상한(25만)·콤마-정합·점프 가드를 쌓았다. **이제(Story 37.2)** 토큰 값을 서버측 헤드리스 터미널이 재구성한 *최종 화면 그리드*에서 읽는다 — 같은 칸 갱신이 덮어쓰기라 **융합이 구조적으로 불가능**해 가드가 통째로 불필요해졌고, 선형 정규식이 놓치던 **축약형(`↓ 1.4k tokens`→1400)** 도 정확히 잡는다. (이제(Story 37.3) 같은 그리드 스피너 행에서 긁는 경과초의 **분 표기(`1m 36s`)도 96 초로 정확 합산**돼 와이어 계약 `{ tokens, elapsedSeconds }` 의 시간 칸이 1분 초과에서 거짓 0 으로 유실되지 않는다 — **단 사용자에게 보이는 `Ns` 시계는 클라이언트 실측이라 이 긁은 값과 독립**(317·E3 줄 참조: 토큰 정체와 무관하게 매초 증가). 합산 정확성은 `cliSpinnerProgress.test.ts` 단위 테스트가 권위로 커버하며, 긁은 `elapsedSeconds` 를 보여주는 UI 표면이 없어 육안 관찰 단계는 없다.)

**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude` 바이너리). CLI 엔진 선택 상태. (사용 한도 단계는 **실제로 주간/5시간 한도에 도달했을 때만** 재현 — 평상시엔 생략하고 단위 테스트로 갈음.)

**절차 (수동)**:
1. 전역 설정 → CLI 엔진 선택
2. **(순서)** 모델이 *설명한 뒤 선택지를 묻도록* 유도하는 메시지 송신 (예: `두 가지 접근이 있어. 먼저 차이를 설명한 다음 어느 쪽을 원하는지 물어봐줘.`) — 설명이 카드보다 먼저 나오는지 관찰
3. **(무타임아웃)** 오래 조용히 생각/긴 도구를 쓰는 작업 송신 후, 화면이 5분 이상 조용해도 턴이 죽지 않는지 관찰
4. **(한도, 도달 시)** 한도에 걸린 계정으로 송신 → 화면에 한도 알림이 뜨는 순간 관찰
5. **(토큰)** 생성 중 `↓ N tokens` 카운터가 자연 증가만 하는지(거대 융합 숫자 점프 없음) 관찰 — 축약형이 뜨면(`↓ 1.4k tokens`) 카운터가 사라지지 않고 그대로 반영되는지도 관찰

**기대 결과**:
- **순서**: 선택지 카드 *앞에* 모델의 설명 텍스트가 먼저 표시 — 화면에서 긁어 카드보다 먼저 방출(라이브는 한 줄로 합쳐진 베스트-에포트, 턴 종료 reload 가 권위본으로 교체). 같은 설명이 라이브에서 **두 번** 찍히지 않음(늦게 도착하는 JSONL 사본은 dedup)
- **무타임아웃**: 조용한 CLI 턴이 자동 중단되지 않음 — 턴을 끝내는 것은 `end_turn`·REPL 종료(`pty.onExit`)·**사용 한도 감지**·사용자 **Stop 버튼** 뿐. (SDK 모드는 기존 무활동 타임아웃 유지 — 회귀-0)
- **한도**: 한도 알림이 화면에 뜨고 **실제 사용량이 이를 뒷받침**하면(어느 창이든 한도 근처) 턴이 **즉시 중단**되고, claude 가 보여준 **문구 그대로**(리셋 시각 포함) 에러로 노출 + PTY 정리. 무한 대기·뒤늦은 "타임아웃" 오류 없음. (단 `97% 사용` 같은 **경고**는 아직 쓸 수 있으므로 중단하지 않음.) 반대로 문구가 **실제 사용량과 모순**되거나(모든 창에 여유) **주입 이전 재개 화면**에 인용된 것이면 오탐으로 보고 중단하지 않음 — 정상 `end_turn` 으로 종료
- **토큰**: `↓ N tokens` 가 거대 융합 숫자로 튀지 않음 — 그리드가 같은 칸을 덮어써 융합이 **구조적으로 불가능**(상한 필터 같은 우회 가드 없이도 발생 자체가 없음). 턴의 첫 프레임도 안전(이전 값 없이도 단일 값). 축약형 `↓ 1.4k tokens` 는 1400 으로 정확히 반영(이전 선형 경로는 이 프레임을 통째로 놓쳤음)

**엣지케이스**:
- E1. 한도 알림의 `97% 사용` 경고 vs `hit/reached your … limit` 고갈 — 경고는 통과(생성 지속), 고갈만 중단. 둘의 분기는 화면 문구로 판별(버전 취약 — TUI 문구 변경 시 갱신 필요)
- E2. 설명 없이 곧바로 묻는 질문 모달은 선행 텍스트 방출 없음(스크랩 결과가 비면 미방출 — 노이즈 0)
- E3. 콤마 융합(`1,2341,234`) 같은 평탄화 산물은 그리드에선 발생하지 않음(같은 칸 덮어쓰기 → 한 칸=최신 전체값). 세그먼트 경계 리셋(614→79)은 *변화* 로 그대로 반영돼 인디케이터가 직전 peak 에 얼지 않음(회귀-0). 콤마형(`↓ 12,345 tokens`)은 12345 로 정규화
- E4. 한도 문구가 **대화 내용·재개 화면**에 인용돼 떠도 중단하지 않음 — 주입 후 스캔 + 실제 사용량(5h·주간·Opus·Sonnet 창) 대조로 오탐 차단. 단 사용량 데이터가 **없거나(미폴링) 오래되면(>6분)** 대조 불가로 기존처럼 문구를 신뢰(보수적 fail-fast 유지)

- E5. 질문 모달이 박스 테두리(`┌─┐ │`)로 감싸여 와도 선택지 라벨에 박스 글자가 섞이지 않음 — 그리드에선 각 선택지가 자기 행이라 행별 chrome 제거 후 라벨 본문 보존, 옵션↔번호 순서도 화면 top-to-bottom 과 일치(Story 37.4 — 32.8 구조적 해소)

> **자동 회귀**: 사용-한도 감지(고갈 중지 + 97% 경고 통과 + **주입 전 재개 repaint 무시 + 실제 사용량 대조 오탐 차단**), 토큰 첫-프레임 융합 차단, 질문 선행 텍스트 dedup, **그리드 기반 권한/질문/한도 감지 + 박스 chrome 라벨 정합(32.8)** 은 `cliChatEngine.test.ts`(엔진 배선, 박스-렌더 프레임으로 재저작) 와 `cliModalDetect.test.ts`(순수 디텍터/파서를 그리드 행으로 직접 단정) 가, 사용량 파싱(5h·주간·Opus·Sonnet)·대조 가드는 `rateLimitProbeService.test.ts` 가, CLI 모드 무타임아웃은 `websocket.test.ts`(Story 35.1 블록) 가 커버. 수동 단계는 실제 PTY/구독/한도에서의 *체감*만 확인.

### C-11-06: CLI 권한 모드 실시간 전환(Shift+Tab) + 화면 검증 (Story 37.5) (수동)
**배경**: 예전 CLI 엔진의 권한 모드 선택은 **다음 claude spawn 의 `--permission-mode` 플래그**로만 적용돼, 실행 중인 claude 의 모드를 라이브로 바꿀 길이 없었다. 이제는 같은 화면 그리드(37.1)를 **읽기가 아니라 쓰기(제어)** 로도 쓴다 — Hammoc 에서 권한 모드를 바꾸면 (1) 그리드 *상태 행*에서 claude 의 **현재 모드**를 읽고("⏵⏵ accept edits on"/"⏸ plan mode on"/"⏵⏵ auto mode on (shift+tab to cycle)", 라벨 행 없음=normal=default), (2) claude 의 Shift+Tab 사이클(`normal → accept edits → plan → auto → wrap`)에서 목표까지 **전진 칸 수를 wrap 고려해 계산**해 그 횟수만큼 **Shift+Tab(`CSI Z`)을 주입**(모달 응답과 같은 `pty.write` 경로, 키 사이 띄움), (3) 그리드를 **재독해 실제 안착 모드를 검증**한 뒤에야 그 *검증된* 모드를 Hammoc UI 선택기에 반영한다(가정 금지). 검증 모드가 목표와 다르면(미수렴) **더 주입하지 않고 실제 안착 모드를 권위로 반영** + 1회 경고. 라이브 주입은 **턴 진행 중 + 입력 준비(idle)** 일 때만 — *생성 중(스피너)* 과 *권한/질문 모달이 떠 있는 동안* 과 *턴 밖* 은 **라이브 주입을 시도하지 않고 저장만 해 다음 spawn `--permission-mode` 로 폴백**(검증된 idle 경로만 라이브 주입; 모달엔 stray `CSI Z` 0). 사이클에 없는 5번째 모드 `dontAsk` 도 저장-폴백(전진 칸 미산출 → 주입 0). 키 주입 메커니즘은 모달 응답과 동일 경로 재사용, 그리드 읽기는 37.1 정착 그리드 재사용이라 순수 추가 — SDK 엔진(자체 라이브 `query.setPermissionMode`)·미러·32.6 권한 흐름 불변.

**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude` 바이너리). CLI 엔진 선택 상태. 한 턴이 *실행 중* 이어야 라이브 경로가 의미 있음(턴 밖 변경은 다음 spawn 으로 적용 — 별도 관찰 불필요).

**절차 (수동)**:
1. 전역 설정 → CLI 엔진 선택, 권한 모드 **default(normal)** 로 시작
2. 응답이 오래 도는(생성 중) 작업 송신 — 생성 중에는 권한 모드 셀렉터를 바꿔도 **라이브 주입이 일어나지 않고** 저장만 됨을 확인(다음 턴 spawn 에서 반영)
3. 턴이 끝나 입력창(`❯`)이 idle 인 상태에서 권한 모드 셀렉터를 **plan** 으로 변경 → 화면 상태 행이 `⏸ plan mode on (shift+tab to cycle)` 로 바뀌고 Hammoc 셀렉터도 plan 으로 안착하는지 관찰
4. 이어서 **default** 로 되돌림 → 사이클이 wrap(plan→auto→normal)으로 전진해 상태 행의 모드 라벨이 사라지고(normal) 셀렉터도 default 로 수렴하는지 관찰
5. (다중 뷰어) 같은 세션을 다른 브라우저로 열어두고 한쪽에서 모드를 바꾸면 — 검증된 *실제* 모드가 다른 뷰어에도 반영되는지 관찰(요청값이 아니라 화면이 안착한 값)

**기대 결과**:
- **라이브 전환**: idle 상태에서 모드를 바꾸면 화면 상태 행의 모드 라벨이 목표로 바뀌고 Hammoc 셀렉터도 *검증된* 모드로 안착 — 재기동 없이 실행 중 claude 의 모드가 실제로 바뀜
- **검증 기반 반영(가정 금지)**: Hammoc 셀렉터에 실리는 값은 *요청 모드*가 아니라 **그리드 재독으로 확인된 실제 안착 모드** — 미수렴 시에도 요청값으로 되돌리지 않고 화면이 실제 도달한 모드를 채택(라이브 화면 ↔ 저장 상태 어긋남 0) + 경고 1회
- **생성 중·모달 중·턴 밖 폴백**: 셋 다 라이브 `CSI Z` 미주입, 저장만 해 다음 spawn `--permission-mode` 로 적용 — 모달엔 stray Shift+Tab 이 절대 들어가지 않음(키 결선 흔들림 0)
- **격리**: SDK 모드 권한 전환(라이브 `query.setPermissionMode`)·미러·32.6 권한 모달/키 주입 경로 회귀 0

**엣지케이스**:
- E1. **사이클 밖 `dontAsk`**: 라이브 idle 턴이어도 사이클에 대응 위치가 없어 `CSI Z` 0회, 저장-폴백(다음 spawn)
- E2. **version-fragile**: 모드 라벨 문구·사이클 순서·`auto mode on ↔ bypassPermissions` 의미 등가는 claude 버전 변경에 취약(개선이지 만능 아님) — 라이브 검증 항목으로 남김. 라벨이 바뀌면 상태 행 리더 매핑 갱신 필요
- E3. **생성 중 `CSI Z` 실거동 미검증**: idle 만 실측됐고 생성 중 Shift+Tab 의 claude 거동은 미검증이라 저장-폴백으로 *검증된 경로만* 라이브 주입에 씀 — 이 수동 단계(2)가 그 미검증 영역의 안전 처리(주입 안 함)를 육안 확인하는 자리

> **자동 회귀**: 상태 행 → Hammoc 모드 순수 리더(4 라벨→4 모드 · 라벨 행 없음→default · `shift+tab to cycle` 푸터 AND-게이트 · 인용 오탐 0)와 idle/스피너 분류는 `cliModalDetect.test.ts` 가, **폐루프 로직**(wrap 전진 칸 수 · 사이클 길이 상한 · 재독 검증 일치/불일치 fail-safe · 비동기 settled 재확인 stray 키 0 · 이미 목표면 0회 · 생성/모달/턴밖/`dontAsk` 저장-폴백)은 `cliChatEngine.test.ts`(가짜 PTY/그리드 프레임)가, **검증 모드 되읽기·originator 수렴**(요청값 아닌 `getPermissionMode()` 값 broadcast/persist · fail-safe 시 발신자 echo · 정상 경로 self-echo 없음)은 `websocket.test.ts` 가 커버. 수동 단계는 실제 PTY/구독에서의 라이브 전환 *체감* + 생성 중/미수렴 거동만 확인.

### C-11-07: CLI 주입 전 화면 분류 — resume 선택지 오선택 차단 (Story 37.6) (수동)
**배경**: 예전 CLI 엔진은 프롬프트를 주입하기 전, 부팅/재개 화면이 준비됐는지를 **선형 버퍼에 입력창 글리프 `❯` 가 들어왔는지** 하나로만 판정하고 곧바로 프롬프트+Enter 를 주입했다. 그러나 `❯` 는 *입력 박스·선택 메뉴 하이라이트·권한 다이얼로그가 공유하는 글리프* 라, resume 직후 화면이 선택 다이얼로그였는데 `❯` 하나로 입력 박스로 오인한 주입의 Enter 가 **첫 항목(예: `/compact`)을 눌러** 사용자 프롬프트가 사라지고 대화가 압축되는 사고가 있었다(2026-06-11 실측). 이제는 37.4 가 *주입 후* 모달을 화면 그리드로 옮긴 것의 **주입 전 짝** 으로, 부팅/재개 준비 판정을 같은 정착 그리드의 **3-way 분류**(입력 박스 / 선택지·다이얼로그 / 정체불명)로 바꾼다 — 입력 박스로 *확인될 때만* 주입(`❯` 는 필요조건이되 충분조건이 아님)하고, 선택창이면 첫 항목에 Enter 를 넣지 않으며, 정체불명이면 임의 키를 치지 않는다. 라이브 선택창과 재개-repaint 가 인용한 scrollback("❯ 1. Yes"·번호 목록·표)은 **화면 하단의 라이브 nav/cancel 푸터 유무(AND-게이트)** 로 구분한다(인용 본문엔 라이브 푸터가 없다).

**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude` 바이너리). CLI 엔진 선택 상태. 재개 직후 선택 다이얼로그가 뜨는 상황(예: 컨텍스트 한계·compact 유도)이 있어야 차단 경로가 의미 있음 — 평상시엔 정상 입력 박스 주입(회귀 0)만 관찰.

**스텝**:
1. 전역 설정 → CLI 엔진 선택
2. 평범한 새 세션에 프롬프트 송신 → 입력 박스가 그려지면 프롬프트가 **정상 주입**되고 응답이 오는지 확인(회귀 0 — 정상 `❯` 박스는 반드시 입력 박스로 분류)
3. (재현 가능 시) 재개 직후 **선택 다이얼로그** 가 뜨는 세션을 `--resume` 으로 이어 프롬프트 송신 → Hammoc 이 **첫 항목을 Enter 로 누르지 않고**, 인식된 선택 메뉴면 **Esc 로 닫아 입력 박스로 복귀** 시킨 뒤 재분류해 주입하는지 관찰(프롬프트가 사라지거나 `/compact` 가 눌리지 않음)
4. (관찰-전용) `HAMMOC_CLI_DEBUG` 를 켠 서버에서 위를 재수행 → `logs/claude-debug/*-preinject-screen.log` 에 **정착 그리드 + 분류 결과**(`input-box`/`selection`/`unknown`)가 동봉돼 남는지 확인(정체별 정밀 처리의 재료 수집)

**기대 결과**:
- **입력 박스 확인 시에만 주입**: 정상 `❯` 입력 박스는 그대로 프롬프트+Enter 주입(회귀 0). `❯` 가 있어도 선택창/정체불명이면 주입 보류
- **선택창 첫 항목 오선택 차단**: resume 직후 선택 다이얼로그에 Enter 가 들어가 첫 항목(`/compact`)이 눌리는 사고가 재발하지 않음 — 인식된 선택 메뉴는 **Esc 1회** 로 닫고 입력 박스 복귀 후 재분류해 주입
- **정체불명이면 키 0 + 명시적 에러**: 입력 박스도 알려진 선택창도 아니면 어떤 키(Enter/Esc)도 치지 않고, 부트 ceiling 내 미해소 시 blind 주입 대신 **명시적 에러로 턴 종료** + 화면 스냅샷 경로를 로그에 노출("모르면 멈추고 보여준다")
- **hang 방지 균형**: 노이즈로 settle 이 늦은 정상 입력 박스는 ceiling 분기에서 input-box 로 재분류돼 주입(과협소로 정상창을 놓쳐 hang 하지 않음)
- **격리**: SDK 엔진은 PTY/부트 시퀀스 자체가 없어 미진입. 32.6 권한/32.8 질문의 *주입 후* 모달·키 주입 경로 회귀 0(Esc 상수 재사용은 *주입 전* 복구에만 추가). 미러 불변(37.7 까지)

**엣지케이스**:
- E1. **인용 scrollback 오탐 0**: resume-repaint 가 본문에 인용한 "❯ 1. Yes"·번호 목록·표는 라이브 nav/cancel 푸터가 없어 선택창으로 오탐되지 않음(입력 박스 또는 정체불명으로 떨어짐)
- E2. **정체별 정밀 처리는 범위 밖(by-design)**: 특정 다이얼로그(컨텍스트 한계·compact 유도 등)의 *올바른 선택지를 고르는* 정밀 분기는 화면 원본 미캡처(epic Risk (d))로 본 스토리 범위 밖 — 일반 차단(Enter 금지)+Esc 복구+정체 미상 폴백(키 0+명시적 에러)까지만. 정밀 처리는 캡처 후 별도 스토리
- E3. **version-fragile 잔존**: 옵션/푸터/모달 라벨 문구는 claude TUI 버전 변경에 취약(개선이지 만능 아님). 단 *융합/평탄화* 부류 취약성은 그리드로 제거

> **자동 회귀**: 주입 전 3-way 분류기(단순 `❯`→input-box · 번호+nav 푸터→selection · 권한/질문 모달 시그니처→selection · 푸터 없는 인용 scrollback→input-box/unknown · 정체불명→unknown · 생성 스피너 프레임→input-box 아님)는 `cliModalDetect.test.ts` 가, **주입 차단·복구 배선**(selection→Enter 0·Esc 1회 후 복귀 주입 · 미복귀 상한·ceiling 명시적 에러 · unknown→키 0+에러 · 정상 박스 주입 회귀 0 · 노이즈 settle 지연 박스 ceiling 재분류 주입)은 `cliChatEngine.test.ts`(가짜 PTY/그리드 프레임)가 커버. 수동 단계는 실제 PTY/구독에서의 *체감* + 실제 resume 다이얼로그 거동만 확인.

### C-11-08: CLI 미러 기본 활성화 + late-join 화면 동기화 (Story 37.7) (수동)
**배경**: 예전엔 claude 화면 미러가 ① 기본 *꺼짐* 인 디버깅 opt-in 이었고, ② 켜져도 서버가 매 raw PTY 프레임(ANSI 그대로)을 **라이브로만** broadcast 했다. raw 프레임은 *제자리 덮어쓰기 델타* 라, 늦게 접속하거나 새로고침한 브라우저는 과거 프레임을 놓쳐 **빈/부분 화면** 을 봤다(마지막 프레임 하나로는 화면 복원 불가). 이제는 37.1 헤드리스 스크린 모델이 매 턴 프레임을 먹어 보유하는 **누적 그리드(현재 화면)** 를 미러의 *권위 화면 상태* 로 삼는다 — (1) 미러를 **기본 기능(기본 켬, 끌 수 있음)** 으로 승격하고, (2) turn-per-process 라 턴 사이엔 에뮬레이터가 없으므로 턴 종료 시 최종 그리드를 **세션 수명 캐시** 로 승계, (3) 새 브라우저/새로고침이 세션에 합류하면 그 **현재 화면 그리드 스냅샷을 그 소켓에 1회 전송** → 클라 미러가 즉시 현재 화면으로 초기화하고 이후 라이브 raw 를 이어받는다. 라이브 실시간 경로(raw 델타 broadcast)는 불변 — 스냅샷은 *초기화* 만 담당, 이후는 라이브가 수렴. 미러는 **읽기 전용**(클라 키가 PTY 에 닿지 않음).

**선행 조건**: C-11-01 과 동일(구독 로그인된 `claude` 바이너리). CLI 엔진 선택 상태. 같은 세션을 동시에 볼 둘 이상의 브라우저/기기(예: 데스크톱 + 폰).

**스텝**:
1. 전역 설정 → CLI 엔진 선택. (미러 설정을 건드리지 않은) 새 세션에 프롬프트 송신 → claude 화면 미러 패널이 **기본으로 보이고** 생성 중 화면이 라이브로 비치는지 확인(별도 토글 ON 불필요)
2. 한 턴이 끝난 뒤(또는 진행 중) **새 브라우저 탭/기기** 로 같은 세션을 연다 → 합류 즉시 미러가 **현재 claude 화면** 으로 채워지는지(빈 화면이 아니라) 확인
3. 미러를 보고 있는 브라우저에서 **새로고침(reload)** → 새로고침 직후 미러가 다시 현재 화면으로 즉시 동기화되는지 확인
4. 데스크톱과 폰을 나란히 두고 → 두 화면이 **같은 claude 화면** 을 보이는지(서버 단일 출처) 확인. 미러 영역에 키를 쳐도 claude 에 입력이 들어가지 않음(읽기 전용)
5. (opt-out 회귀) "CLI Mode Settings" 에서 **claude 화면 미러** 토글을 끈다 → 미러 패널이 사라지고 raw/스냅샷이 더는 오지 않는지 확인. 다시 켜면 복귀

**기대 결과**:
- **기본 켬**: 미러 설정을 건드리지 않은 CLI 세션에서 미러 패널이 기본으로 표시되고 라이브 화면이 비침(예전 기본 꺼짐 → 켬으로 반전, opt-out 유지)
- **late-join 동기화**: 새 브라우저/기기가 합류하면 빈 화면이 아니라 **현재 claude 화면 스냅샷** 으로 1회 초기화된 뒤 라이브 델타로 수렴
- **새로고침 동기화**: 새로고침(새 소켓 id)도 스냅샷을 정상 수신해 즉시 현재 화면으로 복원(과거엔 빈/부분 화면)
- **멀티 브라우저 일관성·읽기 전용**: N 개 클라가 같은 화면(서버 단일 출처). 미러에 입력해도 PTY 에 닿지 않음
- **opt-out 존중**: 미러 토글 OFF 시 raw·스냅샷 0(서버 게이트 false). SDK 모드는 PTY/미러 자체가 없어 무관
- **격리**: 추출 경로(진행률 37.2/37.3·모달 37.4·주입 전 분류 37.6)·턴당 에뮬레이터 dispose·37.5 권한 폐루프 불변

**엣지케이스**:
- E1. **캐시 미스 폴백**: 첫 턴이 끝나기 전(승계할 최종 그리드 없음) 합류하면 스냅샷 생략 → 빈 화면 폴백(기존과 동일), 라이브 프레임이 도착하면서 채워짐
- E2. **그리드=내용, 스타일은 라이브로 수렴**: 스냅샷은 그리드 텍스트라 색/ANSI 스타일을 잃지만(권위는 *내용*), 이어지는 라이브 raw 가 다음 프레임부터 완전한 스타일로 덮어씀
- E3. **세션 캐시 누수 0**: 세션 룸의 마지막 소켓이 떠나면 화면 캐시도 함께 정리(버퍼 파기와 동일 시점)

> **자동 회귀**: 게이트 기본값 반전(`shouldForwardCliPtyMirror`: CLI+undefined→true · false→false · SDK→false)은 `cliEngineUtils.test.ts`, 세션 화면 캐시 set/get/delete 는 `cliScreenCache.test.ts`, `session:join` 캐시 히트 시 합류 소켓에 `cli:screen-snapshot` 1회·미스 0회·같은 소켓 재-join dedup 0회 는 `websocket.test.ts`, 클라 미러의 스냅샷 수신 시 `clear()`+그리드 write·이어지는 raw write·cleanup 양쪽 off 는 `CliPtyMirror.test.tsx` 가 커버. 수동 단계는 실제 PTY/구독·다중 기기에서의 *육안* 화면 동기화만 확인(PTY 화면은 dev shell 재현 불가).
