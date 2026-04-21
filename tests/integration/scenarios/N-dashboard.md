# N. 대시보드 실시간 상태

**범위**: 프로젝트 리스트 상단 5개 카드, 구독/구독해제 라이프사이클.
**선행 도메인**: A.

---

## 공통 계측 스니펫

N 도메인 시나리오에서 반복 사용되는 계측 코드. `browser_evaluate` 로 필요할 때 주입한다.

### C1. 대시보드 카드 값 읽기

```js
() => {
  const cards = [...document.querySelectorAll('[role="status"][aria-label*="대시보드"] > div')];
  return cards.map(c => ({
    label: c.textContent.replace(/^\d+/, '').trim(),
    value: Number(c.textContent.match(/\d+/)?.[0] ?? NaN),
  }));
}
// → [{label:'프로젝트', value:10}, {label:'세션', value:2866}, {label:'활성', value:0}, {label:'큐', value:0}, {label:'터미널', value:0}]
```

순서 보장: projects / sessions / active / queue / terminals.

### C2. 서버 집계값 비교용 API 호출

```js
() => fetch('/api/projects', { credentials: 'include' }).then(r => r.json()).then(d => {
  const arr = Array.isArray(d) ? d : (d.projects || []);
  return {
    totalProjects: arr.length,
    visibleProjects: arr.filter(p => !p.hidden).length,
    totalSessions: arr.reduce((s, p) => s + (p.sessionCount || 0), 0),
  };
});
```

> 참고: `GET /api/projects` 는 `{ projects: [...] }` 를 반환한다. 배열이 아님에 주의.

### C3. socket.io polling 프레임 캡처 (XHR patch)

```js
() => {
  if (window.__pollBodiesPatched) { window.__pollBodies = []; return { reset: true }; }
  window.__pollBodies = [];
  const OpenOrig = XMLHttpRequest.prototype.open;
  const SendOrig = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) { this.__url = u; return OpenOrig.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b) {
    if (this.__url?.includes('/socket.io/') && b) {
      window.__pollBodies.push({ t: Date.now(), body: String(b).slice(0, 200) });
    }
    return SendOrig.apply(this, arguments);
  };
  window.__pollBodiesPatched = true;
  return { installed: true };
}
```

> Playwright MCP 환경에서는 socket.io 가 polling transport 로 남는 경우가 많아 `WebSocket.prototype.send` 패치만으로는 프레임을 못 잡는다. XHR 패치가 더 신뢰성 있음. WebSocket 으로 업그레이드된 세션을 대비해 필요시 두 가지 다 주입.

### C4. dashboard:subscribe / unsubscribe 발화 검증

`window.__pollBodies` 에서 `42["dashboard:subscribe"]` / `42["dashboard:unsubscribe"]` 문자열 포함 여부 확인.

```js
() => {
  const bodies = (window.__pollBodies || []).map(f => f.body);
  return {
    subscribe: bodies.some(b => b.includes('dashboard:subscribe')),
    unsubscribe: bodies.some(b => b.includes('dashboard:unsubscribe')),
    all: bodies,
  };
}
```

---

## N1. 5개 통계 카드 `[CORE] [ASYNC]`

### N-01-01: 초기 렌더 값 검증

**목적**: 대시보드 진입 시 5개 카드가 서버 상태와 정확히 일치하는지 확인.

**선행 조건**: 프로젝트가 최소 1개 이상 존재 (공통 setup 에서 테스트 프로젝트 보장).

**절차**:
1. `browser_navigate("<TARGET>/")` → `/projects` 진입.
2. `browser_wait_for(text="대시보드")` 또는 요약 카드 가시화 대기.
3. **C1** 스니펫으로 카드 값 5개 읽기 (`uiCards`).
4. **C2** 스니펫으로 서버 집계 획득 (`serverAgg`).
5. 각 카드별 비교:
   - `uiCards[0].value` (프로젝트) = `serverAgg.visibleProjects` — UI 상 "숨긴 항목 보기 (N)" 버튼이 있다면 숨김 제외 visible 개수가 표시됨
   - `uiCards[1].value` (세션) = `serverAgg.totalSessions` — **숨김 여부 무관한 전체 프로젝트의 sessionCount 합**
   - `uiCards[2].value` (활성) = 현재 스트리밍 중 세션 수 (초기 진입 직후라면 0 이 일반적)
   - `uiCards[3].value` (큐) = `queueStatus==='running'` 인 프로젝트 수 (초기 진입 시 0)
   - `uiCards[4].value` (터미널) = 활성 PTY 개수 (초기 진입 시 0)

**기대 결과**:
- 프로젝트 / 세션 카드가 서버 집계와 정확 일치.
- 활성 / 큐 / 터미널 카드는 초기 진입 시 모두 0 이 기본 (다른 세션에서 활성 작업 없을 때).

**엣지케이스**:
- E1. 프로젝트가 0개: 이론상 5개 카드 모두 0. 공통 setup 에서 테스트 프로젝트를 생성하므로 이 케이스는 setup 실패 시에만 발생.
- E2. 매우 많은 세션 (> 10000): 숫자 포맷 오버플로/잘림 체크는 시각적 회귀로 별도.

### N-01-02: 실시간 증감

> **SKIP 금지.** Claude API 호출 1회(짧은 프롬프트)로 충분히 검증 가능하다. API 비용이 부담되어도 `"Reply with: OK"` 같은 1~2 토큰 응답을 유도하면 $0.0001 수준이므로 이 시나리오는 실제로 실행해야 한다. "실시간 반영" 확인은 대시보드의 핵심 가치이며 스킵 시 회귀 감지 불가.

**목적**: 다른 탭/프로젝트에서 세션이 생성될 때 대시보드가 300ms 디바운스 이후 자동 증가하는지 확인.

**선행 조건**: 기존 비-BMad 테스트 프로젝트 존재 (`__hammoc_test_*__` 패턴).

**절차**:
1. 탭 A: `browser_navigate("<TARGET>/")` — `/projects` 대시보드. **C1** 으로 세션 카드 값 읽어 `N_before` 기록.
2. 탭 B: `browser_tabs(action="new")` → `browser_navigate("<TARGET>/project/<비-BMad 테스트 프로젝트 slug>")`.
3. 탭 B: "새 세션 시작" 버튼 클릭 (정확한 selector: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('새 세션 시작'))`).
4. 탭 B 세션 진입 후 채팅 입력창에 `"Reply with exactly: OK"` 주입 + Enter. `native value setter + InputEvent` 패턴 사용:
   ```js
   () => {
     const ta = document.querySelector('textarea[placeholder*="메시지"], [role="textbox"]');
     const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
     setter.call(ta, 'Reply with exactly: OK');
     ta.dispatchEvent(new Event('input', { bubbles: true }));
   }
   ```
5. `browser_press_key("Enter")` → `browser_wait_for(text="OK", time=30)`.
6. Claude 응답 수신 직후 **추가 500ms 대기** (서버 debounce 300ms + 이벤트 라운드트립 여유).
7. 탭 A 로 `browser_tabs(action="select", index=0)` → **C1** 재실행.

**기대 결과**:
- 세션 카드 값 = `N_before + 1` (300ms 디바운스 이후).
- (부가) 스트리밍 중 "활성" 카드 +1 → 스트리밍 종료 시 -1. 짧은 응답(OK 1~2 토큰)에서는 윈도우가 너무 짧아 놓칠 수 있음 — 관찰되면 기록, 놓쳐도 FAIL 아님.

**엣지케이스**:
- E1. 빈 세션 생성만 하고 메시지 미전송: 현재 구현은 빈 세션을 "세션 수" 카운트에 포함시키지 않을 수 있음 (B-01-02 관찰). 반드시 메시지 1회 전송 후 관찰해야 함.
- E2. 응답이 5초 이상 걸리는 모델/프롬프트: `browser_wait_for(time=30)` 한도 내라면 OK. 타임아웃 시 시나리오 프롬프트를 더 짧게 조정.

---

## N2. 구독 / 구독해제 라이프사이클 `[EDGE]`

### N-02-01: 다른 페이지로 이동 시 구독 해제

**목적**: 대시보드 페이지 언마운트 시 `dashboard:unsubscribe` 가 서버에 전송되어 불필요한 broadcast 구독이 해제되는지 확인.

**절차**:
1. `browser_navigate("<TARGET>/")` → `/projects` 진입.
2. **C3** 스니펫으로 XHR 패치 주입. `window.__pollBodies` 초기화됨.
3. 프로젝트 카드(예: `__hammoc_test_*__`) 클릭해 프로젝트 페이지로 **SPA 네비게이션** (새 탭 아님).
   - 이때 ProjectListPage 언마운트 → `useDashboard` cleanup 실행 → `unsubscribe()` emit.
4. **C4** 스니펫 실행 — `unsubscribe: true` 확인.
5. `browser_navigate_back()` 으로 `/projects` 복귀.
6. **C4** 재실행 — `subscribe: true` 도 포함되어야 함 (다시 구독).

**기대 결과**:
- 네비게이션 경로별 emit:
  - `/projects` 진입 (cold) → `42["40"]` 엔진 connect + `42["dashboard:subscribe"]` (페이지 최초 로드 직후)
  - `/projects` → `/project/<slug>` → `42["dashboard:unsubscribe"]`
  - `/project/<slug>` → `/projects` (back) → `42["dashboard:subscribe"]` (재구독)
- 페이지 reload(`browser_navigate` 로 동일 URL 이동) 시 새 socket session 으로 재연결되므로 프레임 캡처가 리셋될 수 있음 — **SPA navigation (클릭/`browser_navigate_back`) 사용 권장**.

**엣지케이스**:
- E1. WebSocket 업그레이드된 세션: 프레임이 polling XHR 이 아닌 WebSocket 으로 전송됨. 이 경우 **C3** 주입 직후 `WebSocket.prototype.send` 도 같이 패치해야 캡처 가능.
- E2. 프로젝트 메뉴 버튼 오클릭 주의: 카드의 케밥 메뉴 버튼(`[aria-label="프로젝트 메뉴"]`) 이 아닌 카드 본체를 클릭해야 네비게이션 발생. role="button" with aria-label="프로젝트: <이름>" 셀렉터 사용.

### N-02-02: 다중 탭 동시 구독

**목적**: 같은 유저가 여러 탭으로 대시보드를 열었을 때 모두 동일한 실시간 업데이트를 수신하는지 확인.

> Playwright MCP 에서 "두 브라우저" 대신 **두 탭**을 사용한다 (쿠키 공유로 동일 유저 세션). 본질은 같은 유저의 중복 구독 처리가 서버측에서 올바른지 검증.

**선행 조건**: 기존 비-BMad 테스트 프로젝트 존재.

**절차**:
1. 탭 A: `browser_navigate("<TARGET>/")` — 대시보드.
2. 탭 B: `browser_tabs(action="new")` → `browser_navigate("<TARGET>/")` — 두 번째 대시보드.
3. 두 탭에서 **C1** 실행 → 카드 값이 **일치** 확인 (`uiCardsA` == `uiCardsB`).
4. 탭 C: `browser_tabs(action="new")` → 비-BMad 테스트 프로젝트로 이동 → 새 세션 시작 → `"Reply with exactly: OK"` 전송 → 응답 수신 후 500ms 대기 (N-01-02 절차와 동일).
5. 탭 A 선택 → **C1** 재실행. 세션 카드가 `before + 1` 로 증가 확인.
6. 탭 B 선택 → **C1** 재실행. 세션 카드가 동일하게 `before + 1` 로 증가 확인.

**기대 결과**:
- 탭 A / 탭 B 모두 동일한 갱신값 수신 — **브로드캐스트 누락 없음**.
- 서버 로그에 `Client connected. Total: 3` (3개 탭 동시 연결) 가 찍혀야 함.
- 대시보드 broadcast 가 중복 전송되지 않음 (서버측 'dashboard' room 방식으로 1회만 emit).

**엣지케이스**:
- E1. 한 탭만 포커스: Chromium 백그라운드 탭 스로틀링으로 인해 비포커스 탭의 socket.io 재연결 타이머가 지연될 수 있음. 본 시나리오는 양 탭이 **active 상태** 유지 가정 (탭 전환만 허용, suspend 안 됨).
- E2. 3개 이상 탭: 서버 브로드캐스트는 room 당 1회지만 socket.io 내부적으로 각 socket 에 개별 전송 — 성능 측면은 본 시나리오 범위 밖.

### N-02-03: 장시간 유지 · 재연결 후 자동 재구독

**목적**: 네트워크 블립 또는 탭 일시 suspend 로 인한 socket.io 재연결 시, 대시보드가 자동으로 재구독·재조회하여 최신 상태를 복원하는지 확인.

**배경 (중요)**: `/api/debug/kill-ws` 는 `sock.disconnect(true)` 로 서버 측에서 의도적 disconnect 를 발생시킨다. [socket.io-client v4 규격](https://socket.io/docs/v4/client-socket-instance/#disconnect) 상 **서버 이니시에이트 disconnect ("io server disconnect" reason) 는 자동 재연결 대상이 아니다** — 클라이언트가 수동으로 `socket.connect()` 를 호출해야 한다. 실제 유저 환경에서는 네트워크 단절 후 복구 시 `online` 이벤트가 발화되고, [useAppResumeRecovery](packages/client/src/hooks/useAppResumeRecovery.ts) 가 `forceReconnect()` 를 호출해 재연결을 트리거한다. 따라서 테스트도 이 경로를 재현해야 한다.

**선행 조건**: 대시보드 페이지 진입 상태.

**절차**:
1. `browser_navigate("<TARGET>/")` → `/projects` 진입. **C1** 으로 `before` 기록.
2. **C3** 스니펫으로 XHR 패치 주입.
3. `fetch('/api/debug/kill-ws', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}', credentials: 'include' })` 호출. 응답 `disconnected >= 1` 확인.
4. 2초 대기 후 kill-ws 재호출 — `disconnected: 0` 이어야 함 (auto-reconnect 되지 않음을 확인). **이 단계는 socket.io 규격 증거용이며 FAIL 사유가 아니다.**
5. 복구 트리거: `window.dispatchEvent(new Event('online'))` — `useAppResumeRecovery.handleOnline` → `forceReconnect()` 호출 → 새 socket 생성.
6. 2.5초 대기.
7. **C4** 실행 — `subscribe: true` 확인. 구체적으로 `window.__pollBodies` 에 `42["40"]` (engine.io connect) 와 `42["dashboard:subscribe"]` 프레임이 **둘 다** 포함되어야 한다.
8. 다른 탭에서 새 세션 생성 + 짧은 메시지 전송 (N-01-02 절차). 본 탭으로 돌아와 **C1** 재실행 — 카드 값이 `before + 1` (또는 `fetchStatus()` 로 풀 싱크된 서버 최신 총합) 로 갱신되는지 확인.

**기대 결과**:
- Step 4: kill-ws 직후 재연결 시도 없음 (`disconnected: 0`) — socket.io 규격대로 동작.
- Step 7: `online` 이벤트 후 새 socket 생성되고 `dashboard:subscribe` 프레임 자동 emit.
- Step 8: 세션 카드가 서버 최신값으로 갱신됨 (fetchStatus 로 풀 싱크 또는 subsequent broadcast 수신).

**엣지케이스**:
- E1. `visibilitychange` 경로: 탭을 background 로 전환했다가 돌아올 때 `useAppResumeRecovery.handleVisibilityChange` 가 동일하게 `forceReconnect()` 를 호출. 재현 시:
  ```js
  () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // ... (delay)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }
  ```
  단 `FORCE_RECONNECT_THRESHOLD_MS = 3 * 1000` 이므로 hidden 지속 3초+ 가 필요. 테스트 시 3.5초 대기.
- E2. ping/pong 연결 유지: 수십 분 방치 후에도 kill-ws 없이 `disconnected >= 1` 유지되어야 함. 실행 시간 상 자동화보다 수동 회귀로 검증 권장 (socket.io 기본 pingInterval=25s, pingTimeout=20s, 총 45s 내에 ping 미응답 시 timeout disconnect).
- E3. 여러 번 연속 kill-ws → online 반복: 각 사이클마다 동일하게 재구독되어야 함. race condition 검증용.

**증거**:
- `browser_take_screenshot(filename="N-02-03.png")` — 카드 갱신 후 모습.
