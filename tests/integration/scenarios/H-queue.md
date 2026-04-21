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

> **타이밍 주의** (2026-04-21 교훈): `Pause` 는 **현재 아이템 완료까지 대기** 하는 요청형 동작이다. 짧은 프롬프트(`Say 'hi'`)로만 구성된 큐는 Pause 클릭 전에 이미 완료되어 paused 상태로 전이하지 않는다. 반드시 **`@delay 15000ms` 이상의 긴 아이템** 이나 긴 응답을 유도하는 프롬프트를 포함시켜 Pause 요청이 적용될 시간 창을 확보한다.

**절차**:
1. 큐 편집기에 미실행 여유가 충분한 스크립트 구성. 예:
   ```
   @new
   @model claude-haiku-4-5
   @delay 15000
   Say 'a' only.
   Say 'b' only.
   ```
2. Ctrl+Enter 실행 → `@delay 15000ms` 진입(아이템 3) 확인 후 "Pause" 클릭
3. 배너가 `"현재 항목 완료 후 일시정지..."` → `"일시정지됨 · 사유: 사용자가 일시정지했습니다"` 로 전이 확인. `/api/projects/:slug/queue/status` 에서 `isPaused: true`
4. 편집기(또는 배너 내부 리스트)에서 **미실행 아이템을 수정 / 추가 / 삭제**
5. "재개" 클릭 → 수정된 리스트로 다음 항목부터 계속

**기대 결과**:
- 상태: running → (isPauseRequested) → paused → running
- 편집 가능 상태 진입 (`queue:editStart`)
- 재개 후 **미실행 아이템 = 수정된 리스트**, 재개 시점 기준 남은 아이템 전부 정상 완료
- completed 아이템 은 재실행되지 않음(중복 전송 없음)

---

## H3. 큐 중단 & 상태 리셋 `[EDGE]`

### H-03-01: 실행 중 Abort `[MANUAL]`

> **자동화 불가 사유 (2026-04-20 확인)**: 큐가 짧은 프롬프트(예: "Say 'hello'")로 구성되면 첫 항목이 1초 미만에 완료되어 Abort 버튼 포착 타이밍을 자동화로 확보하기 어렵다. 긴 응답 프롬프트로 시도해도 `browser_wait_for`로 버튼을 잡는 순간 이미 다음 항목으로 넘어가거나 큐가 완료되는 경우가 관찰됨. 자동화는 FAIL-negative(false FAIL)가 잦아 신뢰도가 낮음 — **릴리즈 직전 수동 회귀에서 확인**한다.

**수동 절차**:
1. 큐 편집기에 3개 항목 구성 (각 항목이 오래 걸리도록 긴 응답 유도):
   ```
   Write a detailed 2000-word essay on topic A.
   Write a detailed 2000-word essay on topic B.
   Write a detailed 2000-word essay on topic C.
   ```
2. "실행" 버튼 클릭
3. 1번 항목 스트리밍 진행 확인 → QueueLockedBanner에 "Abort" 버튼 가시 확인
4. "Abort" 버튼 클릭 → 확인 다이얼로그 "예"
5. 즉시 스트림 중지 확인 + 현재 어시스턴트 메시지에 부분 텍스트 + "중단됨" 표시 확인

**기대 결과**:
- `queue:abort` 이벤트 → 현재 스트림도 함께 abort
- 배너 닫기 가능, 편집기 원상 복귀

**엣지케이스** (수동으로 함께 확인):
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
**목적**: Ask 모드(`permissionMode='default'`) 큐 실행 중 Bash 도구 호출이 발생하면 권한 모달이 뜨고, 응답할 때까지 큐가 대기하는지 검증.

**도구 선택 — 함정 주의** (2026-04-21 교훈): Write/Edit 는 "File has not been read yet" SDK 오류가 권한 모달 이전에 선행하므로 부적합. **Bash 도구**를 사용하되, **SDK 가 `canUseTool` 을 스킵하는 3 가지 우회 경로**를 모두 피해야 한다:

1. `~/.claude/settings.json` 의 `permissions.allow` 패턴 매치
2. `~/.claude/settings.local.json` 의 `permissions.allow` 패턴 매치 *(과거에 빠졌던 항목 — settingSources = ['user', 'project', 'local'] 로 **둘 다** 로드됨)*
3. Claude Code / Agent SDK 번들 내장 **read-only safe-bash 기본 허용** — `whoami`, `ls`, `pwd`, `date`, `env`, `cat` 등은 어느 allowlist 에도 없어도 모달이 안 뜸. 번들 내부 목록이라 외부에서 비가시

→ 안전한 선택은 **allowlist 매치가 없고 read-only 가 아닌 쓰기 명령**: `mkdir /tmp/<unique>`, `touch /tmp/<unique>`, `rm /tmp/<unique>` 같은 파일시스템 변경 명령. 아래 선행 조건 체크리스트로 최종 확인.

**선행 조건 확인** (모두 통과해야 실제 모달 등장 보장):

```bash
# 1) 유저 전역 allowlist
cat ~/.claude/settings.json | grep -A 40 '"allow"'
# 2) 유저 로컬 allowlist (2026-04-21 이후 필수)
cat ~/.claude/settings.local.json | grep -A 40 '"allow"'
# 3) 프로젝트 scope (있는 경우만)
cat <projectDir>/.claude/settings.json 2>/dev/null
```
- 사용할 Bash 명령(예: `mkdir`, `touch`)이 세 allowlist 어디에도 매치되지 않는지 확인
- **read-only 명령(`echo`, `whoami`, `ls`, `pwd`, `date`, `cat`)은 SDK 번들 safe-bash 에 걸려 모달이 안 뜨므로 선택 금지**

**절차**:
1. Ask 모드로 전환 — `PATCH /api/preferences { permissionMode: 'default' }` **+ 세션 입력바의 권한 모드 칩 클릭해서 "Ask" 표시 확인**. preferences 값은 초기값일 뿐 실제 큐가 참조하는 것은 `useChatStore.permissionMode` (세션 UI 에서 변경되는 값)이다. 두 값이 어긋날 수 있으니 UI 칩 확인이 최종.
2. 큐 탭 → 3개 항목 구성 (명령의 경로는 **runtime-unique** 접미사로 충돌 회피):
   ```
   @new
   @model claude-haiku-4-5
   Use the Bash tool to create a directory: mkdir /tmp/hammoc-h0501-<random-6char>
   Say 'done' and stop.
   Say 'ok' and stop.
   ```
3. 실행 시작 → 첫 Bash 호출 시 큐 배너에 **"입력 대기 중..."** + 에디터 버튼들 disabled + 세션 화면에 **"허용/거부" 버튼** 노출
4. 모달이 뜬 상태로 3초 대기 → 두 번째 항목(`Say 'done'`)이 `pending` 유지 확인 (`/api/projects/:slug/queue/status` 로 `isPaused:true` + `currentIndex` 정체 확인)
5. **"허용"** 클릭 → Bash 실행 완료 후 두 번째 항목으로 진행
6. 두 번째 항목에서 모달이 다시 뜨면 (또는 쓰기 명령을 하나 더 추가해서 강제) **"거부"** 클릭 → ToolCard `실패` 상태, 큐는 preferences 의 `queueContinueOnError` 값에 따라 계속/중단

**기대 결과**:
- Allow: 도구 실행 후 Claude 응답 계속, 큐 다음 항목 자동 진행
- Deny: 해당 도구 호출은 "거절됨" 기록, 큐는 `queueContinueOnError` 에 따라 계속/중단
- 모달이 열린 동안 `/api/projects/:slug/queue/status` 는 `isPaused: true`, `isWaitingForInput: true`, `pauseReason: "…permission…"` 반환

**엣지케이스**:
- E1. `bypassPermissions` / `acceptEdits` 모드에서는 모달이 발동하지 않는다. 시작 전 반드시 `default` 모드인지 확인.
- E2. Bash 명령이 allowlist 에 있거나 SDK 번들 safe-bash 에 해당하면 `canUseTool` 이 호출되지 않는다. **둘 중 어느 쪽에 걸려도 동일한 증상**이므로 선행 조건 체크리스트를 스킵하지 말 것.
- E3. 권한 타임아웃 (D-04-01 과 교차): 모달에 응답하지 않고 `__HAMMOC_PERMISSION_TIMEOUT_MS__` 단축 시 자동 deny 후 큐 진행 방식 확인.
- E4. 테스트 프로젝트에 `/tmp/hammoc-h0501-*` 가 누적되지 않게 teardown 에서 정리(`rm -rf /tmp/hammoc-h0501-*`).

### H-05-02: 큐 실행 중 Budget 초과 `[SDK] [EDGE]`
**목적**: `maxBudgetUsd` 초과 시 SDK가 `isError=true` 결과(`error_max_budget_usd` subtype)를 반환해 큐가 자동 일시정지되는지 검증.

> **상태 변경 기록**:
> - 2026-04-20: SDK 0.2.114에서 budget이 enforce되지 않는다고 관찰 → `[SDK_BLOCKED]` 분류.
> - **2026-04-21: 3개 모델(`claude-haiku-4-5` / `claude-sonnet-4-6` / `claude-opus-4-7`) 모두에서 enforce 작동 확인. `[SDK_BLOCKED]` 태그 제거, 정상 시나리오로 복귀.** 당시 관찰이 전파 경로 버그(`aff86d9` 이전 상태) 시기와 겹쳤던 것으로 추정. 자세한 재검증 기록은 [tests/integration/reports/2026-04-21T02-52-02Z-domain-H.md](../reports/2026-04-21T02-52-02Z-domain-H.md) 참조.

**SDK 동작 이해**: SDK `maxBudgetUsd`는 **`query()` 호출 경계 사이**에서 누적 비용을 체크한다. 현재 SDK(비베타)는 유저의 대화 중간 개입(mid-stream turn)을 지원하지 않으므로, **하나의 큐 아이템 = 하나의 `query()` 호출 = 하나의 단위**다. 단일 아이템 내부에서는 스트림이 끝날 때까지 abort되지 않고, 다음 아이템으로 넘어가기 직전에 `isError` 응답으로 떨어진다.

따라서 budget 차단을 관찰하려면 **아이템이 2개 이상** 필요하다:
- 아이템 1이 실행되어 누적 비용 > `maxBudgetUsd` 발생
- 아이템 2 시작 시점에 SDK가 `isError=true` 응답 → Hammoc `queueService.executePrompt` 가 `pauseWithError` 호출 → 큐 일시정지

**UI min 우회**: Settings UI는 `min={0.01}` 고정. `PATCH /api/preferences`로 직접 작은 값을 설정한다 (서버 검증 없음).

**절차**:
1. 현재 `maxBudgetUsd` 기록:
   ```js
   browser_evaluate(`() => fetch('/api/preferences').then(r => r.json()).then(p => p.maxBudgetUsd)`)
   ```
2. 아주 작은 budget 설정 (UI min 우회):
   ```js
   browser_evaluate(`() => fetch('/api/preferences', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ maxBudgetUsd: 0.0001 }),
     credentials: 'include'
   }).then(r => r.json())`)
   ```
3. 큐 탭 → **아이템 4개** 구성 (`@new` + `@model` + 2개 프롬프트):
   ```
   @new
   @model claude-haiku-4-5
   Say 'hello' only.
   Say 'world' only.
   ```
4. 실행 → 아이템 3(`Say 'hello'`) 실행 후 아이템 3 경계에서 SDK가 `isError=true` 응답. 아이템 4(`Say 'world'`)는 미실행으로 남음.
5. 큐 상태 확인:
   ```js
   browser_evaluate(`() => {
     const slug = location.pathname.split('/project/')[1]?.split('/')[0];
     return fetch('/api/projects/' + slug + '/queue/status', { credentials: 'include' }).then(r => r.json());
   }`)
   // 기대:
   //   isPaused: true
   //   currentIndex: 2 (아이템 3)
   //   pauseReason 과 lastError.error 에 "SDK 오류:" 프리픽스 (현재 response.content만 포함 — 개선 필요)
   ```
6. **정리**: `maxBudgetUsd` 를 원래 값(없었다면 `null`)으로 복원. 실행 중이면 "중단" 버튼 클릭 후 확인 다이얼로그 수락.

**기대 결과**: 아이템 3 완료 직후 `isError=true` → 큐 `isPaused=true`, `lastError.itemIndex=2`, 아이템 4 미실행. 모델별 차이 없음(Haiku/Sonnet/Opus 동일).

**엣지케이스**:
- E1. 에러 메시지 품질: 현재 [queueService.ts:880-882](../../packages/server/src/services/queueService.ts#L880-L882) 가 `response.content` 만 에러 사유로 사용하여 `pauseReason` 이 `"SDK 오류: hello"` (부분 응답 텍스트) 처럼 보임. SDK `subtype` (예: `error_max_budget_usd`) 를 메시지에 합쳐 `"SDK 오류: error_max_budget_usd — hello"` 처럼 표시하도록 개선 후 기대값 업데이트 필요.
- E2. 대용량 `maxBudgetUsd` 로 되돌릴 때 "첫 아이템 2번 반복 실행" 이 가능한지(session resume 후 중복 prompt 전송 금지) 확인.

### H-05-03: 네트워크 끊김 & 복구

> **타이밍 주의** (2026-04-21 교훈): offline/online 이벤트를 **큐 실행 중간 구간** 에 정확히 주입해야 의미 있는 회귀가 된다. Haiku 의 짧은 프롬프트만 있으면 전 아이템이 수 초 내 끝나 주입 창을 놓친다. `@delay 15000ms` 같은 긴 대기 아이템을 끼워넣어 확실한 offline 창을 만든다.

**절차**:
1. 큐 편집기에 offline 창을 포함한 5-아이템 스크립트 구성:
   ```
   @new
   @model claude-haiku-4-5
   @delay 15000
   Say 'first' only.
   Say 'second' only.
   ```
2. Ctrl+Enter 실행 → `대기: 15000ms` 배너 확인 후 즉시 offline 이벤트 주입:
   ```js
   browser_evaluate(`() => {
     Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
     window.dispatchEvent(new Event('offline'));
   }`)
   ```
3. 3초 대기 후 online 복구:
   ```js
   browser_evaluate(`() => {
     Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
     window.dispatchEvent(new Event('online'));
   }`)
   ```
4. `완료 (5개 아이템 실행됨)` 배너 대기 (최대 60s) → `/api/projects/:slug/queue/status` 로 완료 확인
5. 세션 연속성 검증 — **모든 `completedSessionIds` 값이 동일** 하고 아이템 결과 링크의 `href` 들이 같은 세션 UUID 를 가리키는지 확인:
   ```js
   browser_evaluate(`() => {
     const links = [...document.querySelectorAll('a[href*="/session/"]')].map(a => a.href.split('/session/')[1]);
     return { count: links.length, unique: [...new Set(links)] };
   }`)
   // 기대: unique.length === 1 (모든 아이템이 같은 세션에 연속 기록)
   ```

**기대 결과**:
- 재연결 후 미완료 항목부터 재개 → 5/5 완료
- 동일 세션 ID 로 연속 기록 (중복 세션 생성 없음)
- 동일 유저 프롬프트가 중복 전송되지 않음 (세션 히스토리에서 messageId 유니크 확인)
