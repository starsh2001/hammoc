# L. 터미널 (PTY)

**범위**: 터미널 생성·입력·리사이즈, 다중 터미널, 보안.
**선행 도메인**: A, B. `TERMINAL_ENABLED` 환경변수 활성 필요.

---

## L1. 터미널 생성 · 입력 · 리사이즈 `[CORE] [ASYNC]`

### L-01-01: 터미널 탭 생성 & 명령 실행
**절차**:
1. 터미널 탭 진입 → "+" 버튼
2. `browser_wait_for` 프롬프트 표시
3. `browser_type` 로 `echo hello` 입력 후 Enter

**기대 결과**:
- `terminal:create` → `terminal:created` (terminalId 수신)
- 출력에 "hello" 표시
- 콘솔 오류 없음

### L-01-02: 창 리사이즈 → PTY cols/rows 전달
**절차**: 브라우저 창 크기 변경.
**기대 결과**: `terminal:resize` 이벤트 발송, xterm.js 레이아웃 조정.

### L-01-03: 폰트 크기 단축키
**절차**:
1. 터미널 탭 생성 후 터미널 영역 클릭으로 포커스
2. `browser_evaluate`로 현재 폰트 크기 기록: `() => getComputedStyle(document.querySelector('.xterm-rows')).fontSize`
3. `browser_press_key(key="Equal", modifiers=["Control"])` → 폰트 크기 증가 확인
4. `browser_press_key(key="Minus", modifiers=["Control"])` → 축소 확인
5. `browser_press_key(key="0", modifiers=["Control"])` → 기본 복귀 확인 (1단계 값과 일치)

**기대 결과**: 각 단축키별로 `.xterm-rows`의 `fontSize` 스타일이 변경 → 기본값 복귀.

---

## L2. 다중 터미널 관리 `[EDGE]`

### L-02-01: 여러 탭에서 독립 프로세스
**절차**: 3개 터미널 생성 → 각각 다른 명령(예: `top`, `ls`, `python`).
**기대 결과**: 탭별 PID 독립, 전환 시 상태 유지.

### L-02-02: 터미널 종료 & 프로세스 정리
**절차**: 탭 X 버튼 → 확인.
**기대 결과**: `terminal:close` 이벤트, 서버에서 프로세스 kill, 좀비 없음.

### L-02-03: 폭주 출력 방어
**절차**:
1. 터미널 탭 생성, 포커스
2. `browser_type`로 명령 주입 (운영체제별):
   - Unix: `yes | head -n 100000`
   - Windows(PowerShell): `1..100000 | %% { 'y' }`
3. Enter 후 3초 대기
4. `browser_evaluate` — UI가 응답하는지 확인 (`document.querySelector('.xterm').scrollHeight > 0`)
5. `browser_press_key(key="c", modifiers=["Control"])` (Ctrl+C) 중단 → 프롬프트 복귀 확인

**기대 결과**: 렌더링 스로틀링으로 브라우저 프리징 없음, Ctrl+C로 즉시 중단 가능.

---

## L3. 보안 `[EDGE]`

### L-03-01: 로컬 IP 만 허용

> **전제**: 이 시나리오는 반드시 `TRUST_PROXY=true` 환경에서 실행해야 한다. 브라우저의 TCP peer는 항상 `127.0.0.1`(루프백)이므로, `TRUST_PROXY=false` (기본값)에서는 `X-Forwarded-For` 헤더가 무시되어 외부 IP 위장이 불가능하다 — **이는 올바른 보안 동작**이며 버그가 아님. 필터 로직 자체의 검증은 TRUST_PROXY=true 환경에서만 유효하다.

**절차**:
1. 서버 실행 환경 확인: `fetch('/api/server/info').then(r => r.json())` 응답의 `trustProxy` 필드 또는 런처 로그로 TRUST_PROXY 설정 확인
2. **TRUST_PROXY 비활성 시 본 시나리오는 `N/A (환경 미충족)` 로 기록하고 건너뜀**. TRUST_PROXY=true 런처 플래그(`--trust-proxy`) 없이 실행한 경우 FAIL이 아닌 SKIP 처리
3. TRUST_PROXY=true 확인된 경우에만: `browser_evaluate`로 외부 IP를 가장한 헤더로 터미널 생성 API 직접 호출:
   ```js
   fetch('/api/terminals', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.42' },
     body: JSON.stringify({ projectSlug: '<slug>' })
   }).then(r => ({ status: r.status }))
   ```
4. 응답 상태코드 403 또는 에러 코드 `TERMINAL_ACCESS_DENIED` 확인
5. 정상 요청(헤더 없음)은 생성 성공 확인

**기대 결과**: TRUST_PROXY=true 환경에서 외부 IP (`X-Forwarded-For: 203.0.113.42`) 감지 시 403, 로컬 요청은 정상 처리.

> **구현 메커니즘**: `networkUtils.extractRequestIP`는 `TRUST_PROXY=true` + TCP peer가 루프백일 때만 `X-Forwarded-For`를 참조. TRUST_PROXY=false일 때는 항상 TCP peer(127.0.0.1) 사용 → 헤더 주입 무의미. 따라서 본 시나리오는 반드시 TRUST_PROXY=true 환경에서만 실행할 것.

### L-03-02: TERMINAL_ENABLED=false
**선행 조건**: 런처 `--with-terminal-disabled` 플래그로 보조 서버(기본 포트+1 = 21214) 기동.

**절차**:
1. `browser_navigate("http://127.0.0.1:21214")` → 로그인 확인 (주 서버와 동일 자격증명)
2. 기존 프로젝트 선택 또는 생성 → 프로젝트 페이지 진입
3. 터미널 탭 클릭
4. `browser_wait_for(text="터미널이 비활성화되었습니다", time=10)` — 소켓 연결 후 `terminal:access` 이벤트 도착 대기
5. `browser_snapshot` → 안내 메시지 + ShieldAlert 아이콘 확인, "새 터미널" 버튼 없음 확인
6. `browser_evaluate("() => fetch('/api/terminal-status').then(r=>r.status)")` — WebSocket 전용 기능이므로 404 이상 확인으로 충분
7. `browser_navigate("http://127.0.0.1:21213")` 로 주 서버 복귀

**기대 결과**: 터미널 탭에 "터미널이 비활성화되었습니다" 안내 + ShieldAlert 아이콘 표시, "새 터미널" 버튼 없음.

> 터미널 생성은 WebSocket(`terminal:create`)으로만 가능하므로 API 레벨 거부는 WebSocket 에러 응답(`TERMINAL_DISABLED`)으로 확인. `browser_wait_for`로 소켓 연결 완료를 반드시 대기할 것.
