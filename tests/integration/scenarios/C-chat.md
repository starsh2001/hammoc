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
