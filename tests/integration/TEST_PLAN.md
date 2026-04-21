# Hammoc 통합 테스트 지시서 (Playwright MCP)

> **목적**: Claude Agent SDK 버전이 업데이트될 때마다 Hammoc의 유저 기능이 회귀 없이 작동하는지 검증한다. 단위 테스트로 포착되지 않는 실제 유저 워크플로우 · 엣지케이스를 Playwright MCP로 직접 시뮬레이션한다.
>
> **대상 실행자**: Claude Code(또는 호환 에이전트)가 Playwright MCP 도구를 호출하며 본 지시서를 따른다.

---

## 1. 문서 구조

```
tests/integration/
├── TEST_PLAN.md               (← 이 문서: 실행 규약·보고 포맷)
├── TAXONOMY.md                (도메인 계층 · 태그 정의)
├── shortcuts-matrix.md        (키보드 단축키 부록)
└── scenarios/
    ├── A-auth.md              (인증·온보딩)
    ├── B-project.md           (프로젝트 라이프사이클)
    ├── C-chat.md              (채팅·세션) ★ SDK 핵심
    ├── D-permission.md        (권한·인터랙션) ★ SDK 핵심
    ├── E-model.md             (모델·SDK 파라미터) ★ SDK 핵심
    ├── F-input.md             (채팅 입력·첨부)
    ├── G-chain.md             (프롬프트 체인)
    ├── H-queue.md             (큐 러너)
    ├── I-board.md             (보드·이슈)
    ├── J-files.md             (파일 탐색기)
    ├── K-git.md               (Git)
    ├── L-terminal.md          (터미널)
    ├── M-quickpanel.md        (Quick Panel)
    ├── N-dashboard.md         (대시보드 실시간)
    ├── O-notify.md            (알림)
    ├── P-settings.md          (전역 설정)
    ├── Q-bmad.md              (BMad)
    ├── R-websocket.md         (WebSocket 복원력) ★ SDK 핵심
    └── S-viewer.md            (뷰어·렌더러)
```

---

## 2. 실행 모드

테스트 실행 요청은 아래 4가지 모드 중 하나로 지정된다.

### 2.1 `full` — 전체 회귀
모든 리프 시나리오 수행. 메이저 릴리스 전 최종 검증용. 74개 기능 노드 / 152개 시나리오.

### 2.2 `sdk-sensitive` — SDK 민감영역만
`[SDK]` 태그가 붙은 리프만 수행. **SDK 버전 업그레이드 직후 최우선 실행.**
해당되는 도메인: C, D, E, R (+ C10, H2, H5, P4 등 일부)

### 2.3 `smoke` — 핵심 경로 스모크
`[CORE]` 태그가 붙은 리프만 수행. 일상 개발 중 빠른 헬스체크.

### 2.4 `domain:<letters>` — 특정 도메인
예: `domain:C,D` → 채팅 + 권한만. 부분 기능 수정 후 검증용.

### 2.5 커스텀 태그 조합
`tag:SDK+EDGE` 처럼 태그 교집합으로 필터 가능. 태그 정의는 [TAXONOMY.md](TAXONOMY.md) 참조.

---

## 3. 실행 규약

### 3.1 환경 전제
- Hammoc 서버가 `http://localhost:3000`(기본) 에서 기동 중
- 로그인 비밀번호 제공 방식 (택1):
  1. 스킬 인자 `password:<값>` 또는 `--password=<값>` → 일회성 자동 로그인. 값은 세션 메모리에만 존재하고 로그/리포트/스크린샷/메모리에 절대 저장하지 않는다.
  2. 수동 입력: 유저가 브라우저에 직접 입력
- Playwright MCP (`mcp__playwright__*`) 도구 사용 가능 — 프로젝트 `.mcp.json`이 `--grant-permissions=notifications,clipboard-read,clipboard-write,geolocation`과 함께 자체 서버를 등록하므로 해당 권한들은 사전 부여됨 (Chrome 권한 프롬프트 자동화)
- 테스트 격리를 위해 **전용 테스트 프로젝트** 사용 (3.3 참조)
- **`packages/server/dist/` 가 최신 src 와 동기화된 상태** — 런처(`scripts/run-integration-test.mjs`)는 `dist/index.js` 존재 시 이를 실행하므로, src 수정 후 재빌드하지 않으면 구버전이 돌아가 false FAIL 을 유발한다 (2026-04-21 K-03-02/K-03-03 선례: dist 의 `git.branch()` + 인자 없는 `git.push()` 구버전이 실행돼 자동 전환 실패·500 재현). 선행 빌드:
  ```bash
  npm run build --workspace=@hammoc/server
  ```
  또는 `dist/` 를 삭제해 tsx 개발 모드로 강제할 수 있다. 장기적으로는 런처가 기동 전 빌드 산출물 최신성을 검증하도록 개선 예정.

### 3.2 Playwright MCP 기본 동작 규약

| 상황 | 사용할 도구 |
|---|---|
| 페이지 이동 | `browser_navigate` |
| 현재 UI 상태 파악 | `browser_snapshot` (accessibility tree 우선, 스크린샷은 증거용) |
| 클릭·호버 | `browser_click`, `browser_hover` |
| 텍스트 입력 | `browser_type` (textarea/input 대상) |
| 폼 일괄 입력 | `browser_fill_form` |
| 단축키 | `browser_press_key` |
| 드래그·드롭 | `browser_drag` |
| 파일 업로드 | `browser_file_upload` |
| 네트워크 확인 | `browser_network_requests` (WebSocket 이벤트 검증) |
| 콘솔 오류 확인 | `browser_console_messages` |
| 비동기 대기 | `browser_wait_for` (text 또는 element 가시성) |
| 증거 스크린샷 | `browser_take_screenshot` (pass/fail 모두) |
| JS 상태 조회 | `browser_evaluate` (예: Zustand store 값) |

### 3.2.1 API 병렬 호출 주의 (rate limit)

서버는 `express-rate-limit` 으로 동일 IP 의 과도한 요청을 차단한다. 특히 사전 점검 단계(`/api/preferences`, `/api/debug/kill-ws`, `/api/cli-status` 등)를 **같은 메시지에서 병렬 `browser_evaluate` 로 동시 호출**하면 429 (`Too many requests, please try again later.`) 가 발생해 응답이 JSON 파싱 실패로 이어진다.

- **규칙**: 인증·설정·헬스체크류 API는 **순차 호출**한다. 한 번에 1개씩, 응답을 받은 뒤 다음 호출로 진행한다.
- **429 를 만났을 때**: 30초 이상 대기 후 순차 재시도. 시나리오 본절차가 아닌 사전 점검은 재시도 후 통과하면 문제없다.
- 시나리오가 병렬 호출을 꼭 필요로 한다면(예: 동시성 검증) 해당 시나리오 절차에 "rate limit 단일 IP 완화 훅" 설치 절차를 포함시킨다.

### 3.3 공통 Setup / Teardown

**Setup (테스트 세션 시작 시 1회) — Interactive 모드**
1. `browser_navigate("http://localhost:3000")`
2. 현재 상태 판별 (snapshot):
   - 이미 인증된 페이지 → 바로 3단계로
   - 로그인 페이지 → 유저에게 "직접 로그인해 주세요" 안내 후 `browser_wait_for` 로 최대 10분 대기
3. 테스트 전용 프로젝트가 없으면 생성:
   - 이름: `__hammoc_test_<타임스탬프>__`
   - 경로: `<임시 디렉토리>/hammoc-test-<타임스탬프>`
   - BMad 초기화: 필요한 경우만 (Q 도메인 실행 시)
4. 프로젝트 진입 완료 확인

> **비밀번호 정책**: 테스트 코드·환경변수·파일에 비밀번호를 저장하지 않는다. 유저가 브라우저에 직접 입력한다. 원격 실행이 필요하면 RDP/VNC로 GUI 접근 후 동일하게 수행한다.

**시나리오 간**
- 각 시나리오 시작 전 `browser_snapshot` 으로 UI 초기 상태 기록
- 시나리오마다 **새 세션**을 원칙으로 사용 (세션 간 상태 오염 방지)
- 큐·체인·스트림이 실행 중이면 반드시 중단·초기화 후 다음 시나리오 진입

**Teardown (테스트 세션 종료 시)**
- 테스트 중 생성된 세션 목록을 `browser_snapshot` 으로 기록
- 정리 정책:
  - 기본: 삭제하지 않음 (분석용). 보고서에 정리 명령만 안내.
  - `cleanup=true` 옵션이 지정된 경우: 세션·이슈 일괄 삭제

### 3.4 비동기 상태 대기 가이드

SDK/WebSocket 이벤트 기반 UI는 타이밍 민감. 다음 원칙을 따른다.

- **고정 `sleep` 금지.** `browser_wait_for` 로 DOM/텍스트 조건을 기다린다.
- 스트리밍 완료 판정: UsageStatusBar에 토큰 집계가 갱신되었는지 + 입력바가 `idle` 상태인지 확인.
- 권한 모달 판정: `role="dialog"` + 모달 내 "Allow/Deny" 버튼 가시성.
- 도구 실행 판정: ToolCard의 상태 텍스트 `Running` → `Completed`/`Error` 전이.
- 타임아웃: 개별 wait 최대 90초 (CHAT_TIMEOUT 기본값 5분보다 짧게 잡고 실패 시 재시도).

### 3.5 엣지케이스 유도 방법

| 엣지케이스 유형 | 유도 방법 |
|---|---|
| 네트워크 끊김 | `navigator.onLine = false` + `offline` 이벤트 디스패치 (socket.io 내부 재연결 트리거). 세부 절차는 R-websocket.md 상단 참조 |
| 컨텍스트 오버플로 | 매우 긴 입력 (수만 토큰 상당) 또는 SDK 응답을 연속 유도 |
| 동시성 | `browser_tabs` 로 다중 탭 오픈 후 같은 세션 동시 조작 |
| 권한 타임아웃 | `window.__HAMMOC_PERMISSION_TIMEOUT_MS__` 주입 또는 런처 플래그로 타이머 단축. 실시간 5분 대기 금지 |
| 예산 초과 | Settings에서 maxBudgetUsd 를 극소값으로 설정 후 긴 작업 유도 |
| 채팅 타임아웃 | 런처 플래그 `--chat-timeout=<ms>`로 `CHAT_TIMEOUT_MS` 주입 (§3.6 별도 포트 런처 패턴 사용) |
| 드래그드롭 | `DragEvent` + `DataTransfer`를 `browser_evaluate`로 직접 디스패치 (`browser_drag` 툴보다 HTML5 DnD에 안정적) |
| 모바일/터치 | `browser_resize(width=400)` + `TouchEvent` 직접 디스패치 |
| 외부 IP 접근 | `fetch(..., headers: { 'X-Forwarded-For': '203.0.113.42' })` |
| Web Push 권한 | 프로젝트 `.mcp.json`이 `--grant-permissions=notifications`로 Playwright MCP를 기동하므로 Chrome 권한 프롬프트 **자동 승인**됨. 별도 조작 불필요. |
| TERMINAL_ENABLED=false | §3.6 별도 포트 런처 패턴 사용 (환경변수 주입) |
| Telegram API | 로컬 목 서버(`scripts/mock-telegram.mjs`)로 `BOT_API_BASE_URL` 리다이렉트 |
| 원격 Git | 로컬 bare repo (`git init --bare /tmp/hammoc-remote.git`)로 origin 설정 |

### 3.6 환경변수 주입 필요 시나리오 — 별도 포트 런처 패턴

`CHAT_TIMEOUT_MS`, `TERMINAL_ENABLED`, `BOT_API_BASE_URL` 등 **서버 시작 시 읽히는 환경변수**는 런타임 변경이 불가하다. 해당 값이 필요한 시나리오는 다음 절차로 실행한다.

1. **현재 서버를 건드리지 말 것.** 기본 서버(테스트 런처, 보통 `:3000` 또는 `:21213`)는 유지한다. 재기동하면 재로그인이 강제되고 진행 중인 다른 테스트 상태가 소실된다.

2. **비어있는 포트로 별도 런처 기동** (백그라운드):
   ```bash
   node scripts/run-integration-test.mjs --port=21215 --chat-timeout=10000
   # 필요 시 추가 플래그: --with-notifications, --mock-telegram 등
   ```

3. **`browser_tabs`로 새 탭 오픈** → 새 포트로 접속. 쿠키가 공유되므로 보통 재로그인 불필요. 로그인 페이지가 뜨면 유저에게 수동 로그인 요청.

4. **환경변수 적용 여부 검증** — 예: `fetch('/api/preferences').then(r=>r.json()).then(p => p.chatTimeoutMs)` 값이 주입한 값인지 확인.

5. 해당 시나리오 실행 후 **탭 닫기 + 백그라운드 런처 프로세스 종료**. 다음 시나리오는 기본 서버에서 계속 진행.

> 이 패턴은 시나리오 파일 절차 1단계에 명시해 서브에이전트가 자연스럽게 따라할 수 있게 한다. 예시: [P-settings.md](scenarios/P-settings.md) P-03-01.

---

### 3.6.1 Playwright MCP 도구 함정 모음 (false FAIL 방지)

이번 실행들에서 반복적으로 관측된 **도구 경로의 한계**. 시나리오 작성 시 우회 패턴을 써야 함.

| 함정 | 증상 | 우회 패턴 |
|---|---|---|
| `browser_type(...).fill()` 의미론 | 기존 텍스트를 **덮어씀**. `Shift+Enter`로 줄바꿈 후 추가 입력할 때 이전 내용 사라짐 | 줄바꿈 포함 입력은 `browser_press_key` 문자 단위 + `Shift+Enter` 조합, 또는 `browser_evaluate`에서 `native value setter + InputEvent` 주입 |
| `browser_file_upload`의 File.type 공란 | OS fixture를 통해 올린 파일의 `File.type`이 빈 문자열로 전달됨. `files.filter(f => f.type.startsWith('image/'))` 같은 MIME 체크에서 조용히 탈락해 validation UI 미노출 | **MIME 의존 시나리오는 `browser_evaluate`에서 `new File([bytes], name, { type })` + `DataTransfer` + `input.files = dt.files` + `change` 이벤트 주입**. F-02-04 참고 |
| 합성 `TouchEvent` | `TouchEvent`를 디스패치해도 Chromium 데스크톱에서 **네이티브 수평 스크롤 트리거 안 됨** | 스크롤 가능성은 `overflowX === 'auto' && scrollWidth > clientWidth`로 간접 검증 + 프로그램적 `scrollLeft = N` 반영 여부 확인. 실제 제스처 스크롤은 수동 회귀 |
| 합성 HTML5 `DragEvent` (파일 drop) | React `onDrop` 핸들러가 파일 수신 못 함. 보안상 사용자 제스처만 허용 | `[MANUAL]` 태그 후 수동 회귀. F-02-02, F-05-02 선례 |
| 바깥 wrapper vs 내부 컨테이너 selector 혼동 | `data-testid` 이름이 비슷한 두 요소 중 **실제 behavior를 가진 쪽이 아닌 바깥 wrapper를 참조**해 속성 측정 실패 | 시나리오 작성 시 **구현 파일을 직접 grep해 `data-testid` 소유 요소의 CSS/동작**을 확인. 예: F-05-03은 `favorites-chip-bar`(wrapper, `overflow: visible`)가 아니라 `chip-scroll-area`(scroll container, `overflow-x: auto`) |
| accessibility tree 상 nested button 이 실제 DOM 에선 `<span role="button">` | snapshot yaml 에 `button "부모 텍스트": button "자식": ...` 로 찍혀 nested button 처럼 보이지만, `HTMLButtonElement` 안에 `<button>` 은 invalid HTML. Chrome accessibility 가 `span[role="button"][tabindex]` 를 button 으로 노출해 생긴 착시. `parentBtn.querySelector('button')` 은 0 반환 | `parentBtn.querySelector('span[role="button"]')` 로 찾고 `.click()` 호출. 예: K-02-01 Git 탭 섹션 헤더 내부의 "전체" 버튼은 span 임 |
| 3초 auto-dismiss 알림 놓치기 | `[data-testid="validation-error"]` 같은 일시 알림이 snapshot 지연 사이에 사라짐 | 이벤트 주입 **직후 같은 evaluate** 안에서 `await new Promise(r => setTimeout(r, 200))` 후 바로 읽기. snapshot/다음 툴 호출 전에 확인 |
| Quick Panel이 모바일 뷰에서 입력바 가림 | `browser_resize(400, ...)` 하면 Quick Panel이 full-screen dialog로 전환되어 전송 버튼 pointer events 가로챔 | 모바일 viewport 전환 **전에** 패널 닫기 (`[aria-label="패널 닫기"]` 또는 `Alt+1` 토글) |
| `~/.claude/settings.local.json` allowlist 놓침 | SDK 가 `settingSources: ['user', 'project', 'local']` 로 `settings.json` + `settings.local.json` 을 **둘 다** 로드. 로컬 파일에 `Bash(echo:*)` 같은 항목이 있으면 Ask 모드여도 `canUseTool` 호출 없이 자동 허용됨. 2026-04-21 H-05-01 오판 사례 | 권한 시나리오 선행 조건에서 **두 파일 모두** `grep -A 40 '"allow"'` 확인. 매치되는 명령은 피하거나 allowlist 에서 일시 제거 후 복원 |
| Claude Code 번들 safe-bash 기본 허용 | `whoami`, `ls`, `pwd`, `date`, `env`, `cat` 등 read-only bash 명령은 어느 allowlist 에도 없어도 SDK 내부 판단으로 `canUseTool` 을 스킵해 모달이 안 뜸. 번들 내부 목록이라 외부 조회 불가 | 권한 모달 유도용 Bash 명령은 **쓰기 계열**로 선택: `mkdir /tmp/<unique>`, `touch`, `rm`. read-only 조회(`whoami`/`ls`)로는 Ask 모드 검증 불가능 |
| Preferences `permissionMode` 와 `useChatStore.permissionMode` 불일치 | `PATCH /api/preferences` 로 `permissionMode: 'default'` 로 바꿔도 실제 큐가 쓰는 값은 `useChatStore.permissionMode` — 세션 입력바 권한 칩 클릭으로 업데이트되는 클라이언트 상태. preferences 만 건드리면 이전 세션의 Bypass 가 그대로 큐에 전달 | 권한 시나리오 시작 전 반드시 **세션 입력바 권한 칩의 표시가 의도한 모드인지 UI 에서 확인**. preferences PATCH 는 보조 수단 |
| Quick Panel 오픈 직후 내부 검색 input 자동 포커스 → 후속 Alt+N 무시 | Alt+1 으로 세션 패널을 열면 내부 검색 input 이 즉시 포커스됨. 이 상태에서 Alt+2 를 누르면 [usePanelShortcuts.ts:26-30](../../packages/client/src/hooks/usePanelShortcuts.ts#L26-L30) 의 `isInputFocused` 가드가 이벤트를 조기 리턴해 키가 조용히 삼켜짐. 패널은 그대로 세션 탭에 남아 "Alt+2 가 깨졌다" 는 false FAIL 발생. 2026-04-21 M-01-01 선례 | 매 Alt+N 전에 `browser_evaluate` 로 `document.activeElement.blur(); document.body.focus();` 를 실행해 포커스를 body 로 되돌린다. M 시나리오 M-01-01 절차가 이 패턴을 이미 반영 — 다른 단축키 기반 시나리오 작성 시 참고 |
| `/api/debug/kill-ws` 는 auto-reconnect 가 아니다 | `sock.disconnect(true)` 는 socket.io 에서 **"io server disconnect"** reason 으로 전파되며, [socket.io-client v4 공식 규격](https://socket.io/docs/v4/client-socket-instance/#disconnect) 상 클라이언트는 자동 재연결하지 않는다 (수동 `socket.connect()` 필요). kill-ws 만 호출한 뒤 dashboard/session broadcast 를 기다리면 **false FAIL** 발생. 서버 로그에는 "Client disconnected. Total: 0" 이후 "Client connected" 가 없음. 2026-04-21 N-02-03 선례 — 서버 2870 vs 탭 2868 에서 영원히 stale | kill-ws 직후 **복구 이벤트를 수동 트리거**: `window.dispatchEvent(new Event('online'))` → [useAppResumeRecovery.handleOnline](../../packages/client/src/hooks/useAppResumeRecovery.ts#L122-L124) → `forceReconnect()` (= `disconnect() + connect()`). 이 경로가 실제 유저의 네트워크 복구 시나리오와 동일. `visibilitychange` 경로도 동일하게 `forceReconnect` 호출. 재연결 후에는 [useDashboard.ts:46-47](../../packages/client/src/hooks/useDashboard.ts#L46-L47) 의 `socket.on('connect', onConnect)` 가 `subscribe() + fetchStatus()` 를 정상 실행하므로 dashboard 상태는 최신값으로 복구됨 |
| Web Push: `window.Notification` 생성자 스파이는 아무것도 못 잡음 | 메인 스레드에서 `new Notification(...)` 을 프록시해도 Hammoc 은 이 경로를 **전혀 사용하지 않는다**. 서비스 워커 [sw.ts:28-47](../../packages/client/src/sw.ts#L28-L47) 의 `push` 이벤트 핸들러가 `self.registration.showNotification(...)` 을 호출하는 경로만 실제로 알림을 표시함. 메인 스레드 프록시로는 배열이 영원히 빈 채로 남아 **false FAIL** 발생. 2026-04-21 O-01-02 선례 | 검증은 3가지 경로 중 하나: (1) 서버 로그의 `[webPushService] [WebPush] sendPush tag=... success=<N>` (notifyComplete/notifyInputRequired 진입 로그와 쌍으로 확인), (2) 네트워크 `POST /api/preferences/webpush/test` → 200, (3) `navigator.serviceWorker.ready.then(reg => { const o=reg.showNotification.bind(reg); reg.showNotification=(...a)=>{ window.__sw__.push(a); return o(...a); }; })` 로 **메인 스레드 직접 호출만** 캡처 (SW 내부의 push 핸들러 호출은 별도 스레드라 이 프록시에도 안 잡힐 수 있음 — headless Chromium 은 서버 로그 경로가 가장 신뢰 가능) |
| `notificationService.shouldNotify` 는 "소켓 0개" 기반, "탭 가시성" 아님 | [notificationService.ts:93-95](../../packages/server/src/services/notificationService.ts#L93-L95) `return socketCount === 0 \|\| this.alwaysNotify`. Playwright 새 탭을 열어 원 탭을 백그라운드로 돌려도 원 탭의 WebSocket 은 그대로 살아있어 `socketCount > 0` → 알림 억제. "다른 탭 오픈 = 탭 비활성화 = 알림 발송" 가정은 **잘못**. 2026-04-21 O-01-02 선례 | 알림 발송 시나리오는 두 경로 중 하나로 `socketCount === 0 \|\| alwaysNotify === true` 을 만든다: (A) `PATCH /api/preferences/telegram { alwaysNotify: true }` 호출 (reload 자동) → GET 으로 반영 재확인. (B) `POST /api/debug/kill-ws { sessionId }` 로 해당 세션 소켓 종료 후 스트림 완료 대기. (A) 는 상태 복원이 간단하고 스트림 노이즈 없음 → 기본 권장 |
| mock-telegram 은 `browser_evaluate` fetch 에서 CORS 차단 | 주 서버 `localhost:<PORT>` vs mock-telegram `127.0.0.1:<PORT+17>` 은 다른 origin 으로 간주되어 Access-Control 헤더 없이는 브라우저가 응답 파싱 거부 (`Failed to fetch` 로만 보임). 서버 로직 버그처럼 보이나 사실 CORS 블록 | `browser_evaluate` 대신 **Bash `curl`** 로 mock-telegram 관리 엔드포인트 호출: `curl -s http://127.0.0.1:<mockPort>/mock-telegram/messages`, `curl -sS -X POST .../mock-telegram/reset`, `curl -sS -X POST -H "Content-Type: application/json" -d '{"mode":"401"}' .../mock-telegram/mode`. 주 서버 경로 (`/api/preferences/telegram/test` 등) 는 동일 origin 이라 브라우저 fetch 그대로 가능 |

> 새 함정을 발견하면 이 표에 추가해 다음 시나리오 작성 시 재사용한다.

### 3.7 SDK 사전 검증 의무

본 테스트 착수 전, **SDK가 실제로 어떤 스펙을 반환하는지 간단한 샘플 요청으로 먼저 확인**한다. 특히 아래 항목은 SDK 버전마다 달라질 수 있으므로 테스트 기대값을 SDK 실측에 맞춰야 한다.
- `contextWindow` 보고값
- `thinkingTokens` 필드 존재 여부
- `message:chunk` 이벤트 포맷
- 도구 호출 입력 스키마

SDK 실측과 지시서 기대값이 불일치하면 **지시서 수정** 후 진행 (테스트를 억지로 통과시키는 우회 금지).

---

## 4. 시나리오 파일 포맷

각 `scenarios/*.md` 파일은 다음 구조를 따른다.

```markdown
# <도메인 기호>. <도메인 이름>

**범위**: (한 줄 요약)
**선행 도메인**: (예: A 로그인 필요)

## <기능노드 번호>. <기능노드 이름> [태그들]

### 시나리오 ID: <도메인>-<번호>-<서브번호>
**목적**: 한 줄
**선행 조건**:
- (필요한 사전 상태)

**절차**:
1. (액션) → MCP 도구 힌트: `browser_click(...)`
2. ...

**기대 결과**:
- UI: (관찰 가능한 상태)
- 이벤트: (WebSocket/네트워크 관찰값)
- 상태: (Zustand 등)

**엣지케이스**:
- E1. (상황) → (확인 방법)

**증거**:
- `browser_take_screenshot(filename="<scenario-id>.png")`
```

---

## 5. 보고 포맷

테스트 실행이 끝나면 아래 Markdown 보고서를 생성한다.

```markdown
# Hammoc 통합 테스트 결과

**실행일시**: <ISO-8601>
**Hammoc 버전**: <package.json version>
**SDK 버전**: <@anthropic-ai/claude-agent-sdk version>
**실행 모드**: <full|sdk-sensitive|smoke|domain:X|tag:X>
**소요시간**: <mm:ss>

## 요약
- 총 시나리오: N
- PASS: N  FAIL: N  SKIP: N  BLOCKED: N

## 도메인별 결과
| 도메인 | 통과 | 실패 | 스킵 |
|---|---|---|---|
| C. 채팅·세션 | 8 | 1 | 0 |
| ... | | | |

## 실패 상세
### <scenario-id>: <제목>
- **증상**: (실측 동작)
- **기대**: (기대 동작)
- **재현 절차**: (번호 리스트)
- **증거**: ![](./artifacts/<scenario-id>.png)
- **SDK 관련 의심**: yes/no (근거)

## SDK 회귀 의심 영역
(SDK 민감 시나리오 실패만 집계)

## 수동 체크리스트 `[MANUAL]`
자동화 불가능한 시나리오 — 릴리즈 직전 수동 회귀 시 체크
- [ ] <scenario-id>: <한 줄 요약> (사유: <왜 자동화 불가>, 절차: <간단 절차 또는 파일 링크>)

## 다음 조치
- (우선순위 정렬된 액션 아이템)
```

### 상태 코드 정의
- **PASS**: 모든 기대 결과 충족
- **FAIL**: 기대와 실측 불일치 (버그 또는 기대값 수정 필요)
- **MANUAL**: `[MANUAL]` 태그가 붙은 시나리오 — 자동화 불가, 수동 체크리스트로 전달

> **SKIP / BLOCKED 는 원칙적으로 금지.** 모든 시나리오는 테스트 가능하도록 설계되어 있다. 전제가 필요한 경우, 그 전제의 생성 단계를 절차 안에 포함시켜야 한다.
>
> - 선행 데이터(세션·이슈·에픽·스니펫 등)는 시나리오 절차 첫 단계에서 직접 생성한다.
> - 환경 제약(모바일·오프라인·외부 IP 등)은 `browser_resize`, `navigator.onLine` 오버라이드, `X-Forwarded-For` 헤더 등으로 시뮬레이션한다.
> - 인프라가 부족해 실행이 불가능하면 **시나리오를 스킵하지 말고 지시서와 인프라(런처 플래그·테스트 훅·목 서버 등)를 수정**한다. 그 작업 자체를 FAIL 또는 후속 작업으로 보고한다.
> - 과거 스킵 사유 예시(복잡도·파괴적 작업·선행 데이터 없음·세션 재사용 필요·원격 저장소 미설정 등)는 모두 절차 개선으로 해결 가능하므로 재사용하지 말 것.

---

## 6. SDK 업데이트 대응 체크리스트

SDK 버전이 올라가면 아래 순서로 실행한다.

1. `npm list @anthropic-ai/claude-agent-sdk` 로 신규 버전 확인
2. SDK CHANGELOG 훑어 **스펙/계약 변경 항목** 추출
3. 본 지시서에서 영향받는 시나리오 번호를 도메인별로 리스트업
4. **`sdk-sensitive` 모드 실행** → 실패 집계
5. 실패를 분류:
   - (a) 지시서 기대값 업데이트 필요 → 지시서 수정 후 재실행
   - (b) Hammoc 측 어댑터(예: `correctContextWindow`) 수정 필요 → 이슈 등록 후 수정
   - (c) SDK 버그 → 업스트림 보고
6. `smoke` 모드로 나머지 핵심 경로 확인
7. 필요 시 `full` 모드 실행

---

## 7. 제외 범위 (Not Applicable)

아래 기능은 현재 **Hammoc에 미구현**이므로 시나리오가 없다. 구현되면 택소노미 업데이트.

- MCP 서버 설정/관리 UI
- Claude Code hooks 편집 UI
- CLAUDE.md 편집 UI (프로젝트별)
- 세션 export / import (JSON)
- 채팅/세션 스크린샷 공유 기능
- 사용자 정의 키보드 단축키
- 서버 로그 뷰어
- 플러그인/확장 시스템
- 세션 공유 링크 / 읽기전용 뷰
- 외부 MCP OAuth UI (Gmail/Drive 등)
- 외부 webhook / REST API
- PWA 설치 매니페스트
- 커스텀 서브에이전트 관리
- 세션 태그/아카이브
- Language Server (LSP)

---

## 8. 우선순위 레퍼런스

**항상 가장 먼저 확인:**
- C1, C2, C4 — 채팅 기본 동작, 오버플로·compact
- C5 — 세션 재개/fork 분기 생성
- C7 — Abort
- D1, D2 — 권한 모달 동작, 모드 전환
- E1, E2, E4 — 모델 전환, Thinking, 1M 컨텍스트
- R1, R2 — WebSocket 재연결 복구

이 영역이 모두 통과하면 유저 체감상 "주요 기능은 살아있음" 상태로 판단할 수 있다.
