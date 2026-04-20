# H. 큐 러너 (배치 자동화)

**범위**: 큐 문법, 실행/일시정지/재개, 중단, PRD→Queue, 실행 중 이벤트.
**선행 도메인**: A, B. 큐 실행 테스트는 C (채팅) 기능이 살아있어야 함.

---

## H1. 큐 문법 파싱 `[CORE]`

### H-01-01: 기본 문법 검증
**절차**: 큐 편집기에 다음 스크립트 입력 → "파싱" 또는 실행:
```
# Comment line
@new
Hello 1
@model claude-haiku-4-5
@delay 2000
Hello 2
@save session-A
@loop max=2
  Inside loop {iteration}
@end
```

**기대 결과**:
- 주석 무시
- `@new` → 새 세션 블록 시작
- `@model` → 모델 전환
- `@delay 2000` → 2초 대기
- `@save` → 세션 저장
- `@loop max=2 ... @end` → 블록 2회 반복, `{iteration}` 치환

### H-01-02: `@load` 세션 참조
**절차**: `@save foo` 이후 별도 큐에서 `@load foo` 사용.
**기대 결과**: 저장된 세션에서 이어서 실행.

**엣지케이스**:
- E1. 존재하지 않는 이름 참조 → 실행 시 명확한 오류
- E2. `@loop` 중첩 또는 비대칭 `@end` → 파싱 단계에서 오류

---

## H2. 큐 실행 / 일시정지 / 재개 `[ASYNC] [SDK]`

### H-02-01: 실행 & 진행률 배너
**절차**: 유효한 큐 입력 → "Run" 버튼 또는 Ctrl+Enter.
**기대 결과**:
- `queue:start` 이벤트
- QueueLockedBanner: 현재 항목 인덱스 + 진행률
- 각 항목 완료 시 `queue:itemComplete` + 세션 ID 링크

### H-02-02: 일시정지 & 편집 & 재개
**절차**:
1. 실행 중 "Pause" → 현재 항목 완료까지 대기
2. 편집기에서 미실행 항목 수정 / 추가
3. "Resume"

**기대 결과**:
- 상태: running → (isPauseRequested) → paused
- 편집 가능 상태 진입 (`queue:editStart`)
- Resume 시 수정된 리스트로 다음 항목부터 계속

---

## H3. 큐 중단 & 상태 리셋 `[EDGE]`

### H-03-01: 실행 중 Abort
**절차**: 실행 중 "Abort" → 확인 → 즉시 중지.
**기대 결과**:
- `queue:abort` → 현재 스트림도 함께 abort
- 배너 닫기 가능, 편집기 원상 복귀

**엣지케이스**:
- E1. 권한 프롬프트 대기 중 abort: 모달 닫히고 권한 요청 취소
- E2. `@delay` 대기 중 abort: 즉시 해제

---

## H4. PRD → Queue 자동 생성 `[CORE]`

### H-04-01: BMad PRD 파싱

> **선행 조건 필수**: **BMad 초기화된 프로젝트**에서만 실행. 비-BMad 프로젝트에서는 `GET /api/projects/:slug/queue/stories`가 404 "BMad 설정을 찾을 수 없습니다" 반환. 반드시 B-02-02로 BMad 프로젝트를 먼저 생성하거나 Q-01-02("BMad 전환" 메뉴)로 기존 프로젝트를 BMad화 한 뒤 진행.
>
> **PRD 구조 주의**: BMad 기본 `.bmad-core/core-config.yaml`은 **sharded PRD**(`prdSharded: true`, `prdShardedLocation: docs/prd`, `epicFilePattern: epic-{n}*.md`)로 설정됨 ([번들 템플릿](../../packages/server/resources/bmad-method/4.44.3/.bmad-core/core-config.yaml)). 단일 `docs/prd.md`를 생성해도 [queueTemplateController.extractStories](../../packages/server/src/controllers/queueTemplateController.ts#L141)는 기본 설정 하에서 읽지 않습니다. 반드시 `docs/prd/epic-<N>-<slug>.md` 형태로 배치. 자세한 내용은 Q-03-01 시나리오 참조.

**절차**:
1. **BMad 프로젝트 준비** — B-02-02로 BMad 프로젝트 생성 (또는 Q-01-02로 기존 프로젝트 BMad 전환)
2. **PRD 파일 주입 (sharded 구조)** — 파일 탐색기에서 아래 2개 파일을 생성:

   `docs/prd/epic-1-login-flow.md`:
   ```markdown
   # Epic 1: Login Flow

   ## Story 1.1: Email input validation

   ## Story 1.2: Password strength meter
   ```

   `docs/prd/epic-2-dashboard.md`:
   ```markdown
   # Epic 2: Dashboard

   ## Story 2.1: Stats cards
   ```

3. 큐 탭 → "템플릿으로 생성" / "PRD에서 생성" 클릭
4. `browser_snapshot` → Story 1.1 / 1.2 / 2.1 목록 미리보기 확인 (`GET /api/projects/:slug/queue/stories` 응답)
5. 기본 템플릿 선택 → "생성" → 큐 편집기에 스크립트 자동 주입 확인
6. `browser_evaluate` fetch로 `/api/projects/:slug/fs/raw?path=.hammoc/queue-templates.json` → 저장 확인

**기대 결과**:
- Story 1.1 ~ 2.1 추출
- 템플릿 치환자 `{story_num}`, `{epic_num}`, `{story_title}` 적용
- 큐 편집기에 스크립트 채워짐, `queue-templates.json` 저장
- "모든 스크립트 문법이 정상입니다" 표시

**엣지케이스**:
- E1. 비-BMad 프로젝트에서 시도: API 404 + UI 에러 토스트 ("BMad 설정을 찾을 수 없습니다")
- E2. `prdSharded: false` 변경 후 단일 `docs/prd.md`: monolithic 경로 fallback 동작 확인 (`queueTemplateController.ts:220-228`)
- E3. 빈 epic 파일(Epic 헤더만, Story 없음): 해당 epic의 스토리 0개로 표시, 다른 epic은 정상 파싱

---

## H5. 실행 중 권한 · 예산 이벤트 `[SDK] [EDGE]`

### H-05-01: 큐 실행 중 권한 요청 발생
**목적**: Ask 모드 큐 실행 중 도구 호출이 발생하면 권한 모달이 뜨고, 모달에 응답할 때까지 큐가 대기하는지 검증.

**도구 선택**: Write 도구는 SDK 계약상 Read 선행이 필수("File has not been read yet")라 처음 보는 파일에 직접 Write를 요구하면 권한 모달 이전에 SDK 오류가 선행한다. 대신 **Bash 도구**를 유도하면 read-before-X 제약 없이 권한 모달이 깨끗이 발동한다.

**절차**:
1. Ask 모드로 전환 (Shift+Tab 등으로 Ask 확인)
2. 큐 탭 → 3개 항목 구성:
   - `"Run \`echo hello\` in the shell."` (Bash 권한 모달 유도)
   - `"Say 'done' and stop."` (후속 대기 확인용)
   - `"Say 'ok' and stop."`
3. 실행 시작 → 첫 항목에서 Bash 도구 호출 → 권한 모달 등장 확인
4. 모달이 뜬 상태로 3초 대기 → 두 번째 항목이 `pending` 유지되는지 확인
5. 모달에서 "도구 실행 허용" 클릭 → Bash 실행 완료 후 두 번째 항목으로 진행
6. 두 번째 항목에서 다시 모달이 뜨면 "도구 실행 거절" 클릭 → 해당 항목의 ToolCard가 `실패` 상태, 큐는 설정에 따라 다음 항목으로 넘어가거나 중단

**기대 결과**:
- Allow: 해당 도구 실행 후 Claude 응답 계속, 큐 다음 항목 자동 진행
- Deny: 해당 도구 호출은 "거절됨"으로 기록, 큐는 preferences의 `queueContinueOnError` 값에 따라 계속/중단
- 모달이 열려있는 동안 큐 상태는 "대기 중"으로 잠금 (`queueLocked=true`)

**엣지케이스**:
- E1. Bypass 모드였다면 모달이 발동하지 않고 자동 허용 — 시작 전 반드시 Ask 모드 확인.
- E2. 권한 타임아웃 (D-04-01과 교차): 모달에 응답하지 않고 `__HAMMOC_PERMISSION_TIMEOUT_MS__` 단축 시 자동 deny 후 큐 진행 방식 확인.

### H-05-02: 큐 실행 중 Budget 초과
**목적**: `maxBudgetUsd` 초과 시 SDK가 `error_max_budget_usd` 결과로 종료하고 큐가 중단되는지 검증.

**SDK 동작 이해 (중요)**: SDK의 `maxBudgetUsd`는 **turn 경계 사이**에서만 체크된다 ([claude-agent-sdk sdk.d.ts:4931](../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L4931) "budget/retry limits checked between yields"). 단일 응답을 스트리밍하는 도중에는 mid-response abort가 일어나지 않는다. 따라서 **반드시 도구 호출로 turn을 여러 번 나누는 프롬프트**로 유도해야 두 번째 turn 시작 시점에 `error_max_budget_usd` subtype이 emit된다. 1000단어 에세이처럼 단일 턴 프롬프트는 항상 완주되므로 검증 불가.

**UI min 우회**: Settings UI의 "Max Budget" input은 `min={0.01}`로 고정되어 있어 UI로 $0.01 미만 값을 넣을 수 없다. 현재 Sonnet/Haiku 가격에서 $0.01은 한두 턴으로 초과되지 않으므로, `PATCH /api/preferences`로 직접 아주 작은 값(예: $0.0001)을 설정한다. 서버는 값 검증을 하지 않아 그대로 SDK에 전달된다.

**선행 조건**: `permissionMode='bypassPermissions'` 또는 `acceptEdits`로 도구 호출 자동 승인 (그렇지 않으면 권한 모달에서 멈춰 budget 검증이 의미 없어짐).

**절차**:
1. 현재 `maxBudgetUsd` 값 기록:
   ```js
   browser_evaluate(`() => fetch('/api/preferences').then(r => r.json()).then(p => p.maxBudgetUsd)`)
   ```
2. UI를 우회해 아주 작은 값으로 설정:
   ```js
   browser_evaluate(`() => fetch('/api/preferences', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ maxBudgetUsd: 0.0001 }),
     credentials: 'include'
   }).then(r => r.json())`)
   ```
3. `permissionMode='bypassPermissions'`로 전환 (Shift+Tab 반복 또는 PATCH).
4. 큐 탭 → **multi-turn 유도 프롬프트 1개**로 큐 구성. 도구 호출 3~5회가 순차 발생해야 함. 예:
   ```
   Run these commands one by one, each as a separate Bash tool call:
   1. echo "step 1"
   2. echo "step 2"
   3. echo "step 3"
   4. echo "step 4"
   ```
   각 `echo`가 별도 Bash turn이 되어 turn 경계에서 budget 체크가 여러 번 일어난다.
5. 실행 시작 → 첫 1~2 turn 사이 `error_max_budget_usd` subtype으로 SDK 종료 → 큐가 중단되고 배너/상태에 budget 관련 사유 표시.
6. 서버 로그 또는 `lastError`에서 subtype 확인:
   ```js
   browser_evaluate(`() => fetch('/api/queue/status').then(r => r.json())`)
   // lastError.error 가 budget / error_max_budget_usd / 'Max budget' 중 하나를 포함해야 함
   ```
7. **정리**: 원래 값 복원
   ```js
   browser_evaluate(`(orig) => fetch('/api/preferences', {
     method: 'PATCH', headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ maxBudgetUsd: orig }), credentials: 'include'
   })`, <원래값>)
   ```

**기대 결과**: turn 경계에서 SDK가 `error_max_budget_usd`를 emit → 큐가 중단 + `lastError`에 budget 사유 기록 + 후속 항목 pending 유지.

> **단일 응답 프롬프트 사용 금지**: "Write a 1000-word essay"처럼 단일 턴으로 완결되는 프롬프트는 budget이 $0.0001이어도 완주된다 (turn 경계가 없어 abort 불가). 반드시 tool-use를 여러 번 유발하는 multi-step 지시를 사용할 것.

### H-05-03: 네트워크 끊김 & 복구
**절차**:
1. 3개 항목이 담긴 큐 실행 시작 → 1번째 항목 응답 수신 대기
2. 1번째 완료 직후 R-websocket의 표준 끊김 절차 실행:
   ```js
   browser_evaluate(`() => {
     Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
     window.dispatchEvent(new Event('offline'));
   }`)
   ```
3. 3초 대기 후 `online` 이벤트 디스패치로 복구
4. 큐 진행 상태 모니터링 → 2번째 항목부터 이어서 실행되는지 확인
5. 완료 후 세션 히스토리 검사 → 1번째 항목이 중복 전송되지 않았는지 확인 (`messageId` 유니크)

**기대 결과**: 재연결 후 미완료 항목부터 재개, 중복 전송 없음.
