# D. 권한 & 인터랙션 ★ SDK 핵심

**범위**: 권한 프롬프트, 권한 모드, AskUserQuestion, 타임아웃.
**선행 도메인**: A, B, C.

---

## D1. 권한 프롬프트 응답 `[SDK] [CORE]`

### D-01-01: 파일 편집 권한 Allow
**절차**:
1. ChatInput 포커스 → Shift+Tab 반복으로 권한 모드를 **"Ask"** 로 변경 (aria-label `"권한 모드: Ask. 파일 수정 전 승인을 요청합니다"` 배지 확인)
2. "Create a file named test.txt with content: hello" 프롬프트 전송
3. 권한 요청이 뜰 때까지 `browser_wait_for(text="도구 실행 허용")` — 단, ToolCard 버튼과 PendingToolsIndicator 바 모두에 동일 텍스트가 존재하므로 wait_for 가 여러 매치로 타임아웃될 수 있음. 타임아웃 시에도 스냅샷으로 버튼 존재를 재확인.
4. "도구 실행 허용" 버튼 클릭 (aria-label `"도구 실행 허용"`)

**UI 구조 주의**: 권한 요청은 `role="dialog"` 모달이 아닌 **ToolCard 인라인 버튼** 방식으로 표시됨. ToolCard 내부에 `button "도구 실행 허용"` / `button "도구 실행 거절"` 이 노출되며, `PendingToolsIndicator` 바에도 동일 버튼이 함께 표시된다.

**기대 결과**:
- `permission:request` 이벤트 수신
- ToolCard 내용: 툴 이름(Write), 대상 경로, 허용/거절 버튼
- "도구 실행 허용" 클릭 후 `permission:respond` 전송, 파일 실제 생성
- ToolCard 상태 Running → Completed

### D-01-02: Deny 응답
**절차**: D-01-01 과 동일하되 "도구 실행 거절" 클릭.
**기대 결과**:
- 히스토리에 SDK 표준 거부 메시지 + `[Request interrupted by user for tool use]` 기록
- Hammoc ToolCard 하단에 `"오류: during execution"` 라벨과 `[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use` 진단 라인 출력 (의도된 거절 흐름이지만 현재 UX 는 에러처럼 보임 — 중립 라벨 분리는 별도 UX 개선 이슈)
- 도구 실행 중단, 파일 미생성

**엣지케이스**:
- E1. 모달 표시 중 다른 탭에서 응답: 한쪽 탭만 적용, 다른 탭 모달은 자동 닫힘 (다중 브라우저 동기화)

### D-01-03: CLI 엔진 모드 권한 → 독립 카드 `[MANUAL]`
**배경**: SDK 모드(D-01-01)는 권한을 ToolCard 인라인 버튼으로 붙여 표시한다. CLI 엔진은 *승인 필요* 도구의 도구 실행 이벤트(`tool:call`)를 (Story 32.9에서) 의도적으로 **억제**한다 — 승인 전엔 진짜 도구 id 가 JSONL 에 없고 권한 카드는 합성 id(`cli-perm-N`)라, 라이브 도구 카드를 더하면 진짜 id 카드와 합성 id 권한 카드가 분리되기 때문. 따라서 붙일 ToolCard 가 없어, CLI 모드의 일반(승인 필요) 도구 권한 요청은 서버가 `permission:request` 에 `standalone:true` 를 실어 보내고, 클라이언트는 이를 AskUserQuestion 과 동일한 독립 `InteractiveResponseCard`(`type='permission'`)로 렌더한다. (자동 승인·안전 도구 — Bypass 전체·default 모드 read-only — 는 32.9에서 라이브 `tool:call`/`tool:result` 를 보내 ToolCard 가 뜨지만, 그건 권한 다이얼로그가 없는 경로라 D-01-03 대상이 아니다. AskUserQuestion·SDK 모드 권한은 불변 — 회귀 없음.)

**[MANUAL] 사유**: C11(C-chat.md)과 동일 — 구독-인증된 실제 `claude` 바이너리 + 인터랙티브 PTY 가 필요해 헤드리스 하네스에서 자동화가 구조적으로 불안정. 릴리즈 직전 수동 회귀로 검증.

**선행 조건**: 구독 로그인된 `claude` 바이너리(호스트 PATH 또는 설정 경로), 전역 설정에서 CLI 엔진 선택(P-06-01).

**절차 (수동)**:
1. CLI 엔진 모드 + **Ask** 권한 모드로 전환
2. "Create a file named cli-perm.txt with content: hi" 전송
3. 권한 카드 노출 대기 (PTY 가 권한 다이얼로그를 그릴 때까지)

**기대 결과**:
- 독립 `InteractiveResponseCard` 렌더 — Shield 아이콘 + 권한 문장("…create cli-perm.txt?") + 승인/거부 버튼. ToolCard 부착 형태가 **아님**.
- (Story 32.9) 승인 필요 도구는 별도 라이브 ToolCard 가 **뜨지 않는다** — 독립 권한 카드 하나만 (라이브 `tool:call` 억제 보장 → 카드 분리/중복 없음). 턴 완료 reload 시 도구 블록은 히스토리에 자연 렌더된다.
- "승인" → `permission:respond` 전송 → CLI PTY 에 Enter 주입 → 파일 실제 생성, 카드 "승인됨" 표시
- "거부" → Esc 주입 → 파일 미생성, 표준 거부 흐름

**엣지케이스**:
- E1. (수정 전 회귀 신호) 권한 카드가 전혀 안 뜨고 턴이 멈추면 `standalone` 미전달 — 서버 emit 또는 클라 분기 회귀. 클라 렌더 분기 자체는 `useStreaming.interactive.test.ts` 단위로 가드됨.

---

## D2. 권한 모드 전환 `[SDK]`

### D-02-01: Shift+Tab 사이클
**절차**:
1. ChatInput 포커스 상태에서 Shift+Tab 반복
2. 4개 모드가 `Plan → Ask → Auto → Bypass → Plan …` (wrap-around) 순환하는지 확인 — 시작 모드는 이전 세션 상태에 따라 달라질 수 있으나 순서/총 모드 수는 고정.
3. 각 프레스 후 `document.querySelector('button[aria-label*="권한 모드"]').getAttribute('aria-label')` 로 현재 모드 레이블 검증 (`"권한 모드: Plan"`, `"권한 모드: Ask"`, `"권한 모드: Auto"`, `"권한 모드: Bypass"`).

**기대 결과**:
- UI 배지 표시 변경 (짧은 라벨 — `Plan` / `Ask` / `Auto` / `Bypass`)
- `permission:mode-change` 이벤트 브로드캐스트
- 다중 탭 동기화 (동일 세션 다른 탭도 배지 변경)

### D-02-02: 큐 실행 중 권한 모드 변경 잠금
**절차**:
1. 큐 탭에서 2개 이상 항목을 포함한 큐 실행
2. 큐 실행 중 하단 입력바 상태 확인
3. 권한 모드 배지 버튼이 비활성(disabled) 상태인지 확인

**기대 결과**: 큐 실행 중에는 입력바 전체가 잠기므로 권한 모드 변경 버튼도 비활성화됨 — 모드 변경 시도 자체가 차단되는 것이 의도된 동작.

> **구현 근거**: 큐 러너 실행 중 하단 입력바가 잠금 상태로 전환되어 Shift+Tab 포커스 진입 자체가 불가능. 따라서 "실행 중 모드 변경 후 다음 항목 적용" 시나리오는 현재 구현과 맞지 않음.

---

## D3. AskUserQuestion 응답 `[SDK] [EDGE]`

### D-03-01: 선택지형 질문 응답
**배경**: `InteractiveResponseCard` 컴포넌트(`type='permission'|'question'`)는 SDK `AskUserQuestion` 과 `ExitPlanMode` 양쪽에서 재사용되므로, 둘 중 어느 경로로든 선택지형 카드의 렌더·응답 왕복을 검증할 수 있다. Opus 는 일반 프롬프트로 AskUserQuestion 을 자발적으로 호출하지 않으므로 **명시 유도**가 필요.

**절차** (경로 택1):
- **경로 A — AskUserQuestion 명시 유도**:
  1. ChatInput 포커스, Bypass 모드에서 프롬프트 전송:
     ```
     Use the AskUserQuestion tool to ask me exactly one question:
     "What is your favorite color?" with 3 choices (red, blue, green).
     Only invoke AskUserQuestion, do not do anything else.
     ```
  2. `browser_wait_for(text="AskUserQuestion")` 로 도구 호출 대기 (최대 90초)
  3. 선택지 버튼 중 하나 클릭 (예: `Red`)
- **경로 B — ExitPlanMode 경유**:
  1. 새 세션 + Plan 모드로 전환
  2. "Plan a simple hello world file creation. Keep the plan short and then exit plan mode." 프롬프트 전송
  3. ExitPlanMode 도구 호출 대기
  4. 4개 선택지(`예 (Ask)` / `예 (Auto)` / `예 (Bypass)` / `No`) 중 하나 클릭

**기대 결과**:
- `InteractiveResponseCard` 렌더 (선택지 버튼 + `기타...` 버튼 포함)
- 선택지 클릭 → `permission:respond` 전송 → 대화 재개 (경로 A: SDK 가 `User has answered your questions: ...` 메시지 수신 후 응답 생성. 경로 B: Plan 승인/거절에 따라 실제 편집 단계로 진입하거나 `[Request interrupted]` 기록)

### D-03-02: 자유 입력형 질문
**절차**:
1. D-03-01 경로 A 와 동일한 프롬프트로 AskUserQuestion 유도
2. 카드 렌더 후 `"기타..."` 버튼 클릭 (aria-label `"기타 (직접 입력)"`)
3. 노출된 `input[aria-label="기타 응답 입력"]` 에 자유 텍스트 입력 (예: `purple`)
4. `button[aria-label="기타 응답 제출"]` 클릭 (표시 텍스트 `"전송"`)

**기대 결과**:
- `기타` 클릭 시 text input + 전송 버튼 노출 (placeholder `"응답을 입력하세요..."`)
- 제출 시 SDK 로 `User has answered your questions: "<question>"="<값>"` 전달
- Claude 가 해당 값을 반영한 응답 재개 (예: `"Noted — purple."`)

---

## D4. 권한 타임아웃 `[EDGE]`

### D-04-01: 장시간 응답 없음 → 자동 거부
**절차**:
1. **타임아웃 단축** — `browser_evaluate`로 클라이언트 타임아웃 전역 주입:
   ```js
   () => { window.__HAMMOC_PERMISSION_TIMEOUT_MS__ = 3000; return true }
   ```
   `usePermissionTimeout` 훅이 해당 전역을 이미 우선 참조하도록 구현되어 있으므로([usePermissionTimeout.ts:5,28](../../packages/client/src/hooks/usePermissionTimeout.ts)) 추가 선행 작업 불필요.
2. Ask 모드로 전환 (D-01-01 절차 1 참고) 후 편집 권한 요청 유도 프롬프트 전송 ("Create a file named d-04-01-timeout.txt with content: hi")
3. ToolCard에 허용/거절 버튼 노출 대기, 응답하지 않고 최대 30초 정도 대기 (실제 타이머는 3초)
4. ToolCard 의 Allow/Deny 버튼이 사라지고 D-01-02 Deny 와 동일한 경로로 처리되었는지 확인 — `[Request interrupted by user for tool use]` 메시지 + `"오류: during execution"` 라벨
5. 입력창 `textarea[aria-label="메시지 입력"]` 의 `disabled=false` + placeholder `"메시지를 입력하세요..."` 복귀 확인
6. 대상 파일이 실제로 생성되지 않았음을 파일 시스템으로 확인

**기대 결과**:
- 타이머 만료 시 `onPermissionRespond(false)` 호출 → Deny와 동일한 경로로 처리
- ToolCard: 허용/거절 버튼 제거 + 거절 표준 메시지 표시 (타임아웃 전용 UI 메시지 없음 — `usePermissionTimeout`이 단순 deny 호출)
- 세션 활성 유지, 다음 메시지 전송 가능

> 실시간 5분 대기는 금지. 반드시 전역 주입 방식으로 타이머 단축.
