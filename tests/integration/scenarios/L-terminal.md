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

### L-03-01: 로컬 IP 만 허용 `[MANUAL]`

**자동화 불가 사유**: 터미널 생성은 WebSocket `terminal:create` 이벤트 전용이며 REST 엔드포인트가 없다 (`POST /api/terminals`는 존재하지 않음). 서버는 socket.io 핸드셰이크 시점의 `extractClientIP(socket)` 결과로 필터링하는데, 브라우저 JS는 WebSocket 업그레이드 요청의 헤더(특히 `X-Forwarded-For`)를 제어할 수 없다. 외부 IP를 가장하려면 socket.io client에 `extraHeaders` 옵션을 실제 reverse-proxy 앞단에서 주입해야 하며, Playwright MCP 자동화로는 재현 불가.

**수동 절차 (릴리즈 직전 회귀 시)**:
1. 런처를 `--trust-proxy` 플래그로 기동
2. `curl` 또는 외부 도구로 WebSocket 업그레이드 요청에 `X-Forwarded-For: 203.0.113.42` 헤더 주입:
   ```bash
   # 예: websocat + 헤더 주입
   websocat -H "X-Forwarded-For: 203.0.113.42" ws://localhost:3000/socket.io/
   ```
3. `terminal:create` 이벤트 전송 → 서버가 `terminal:error` with `TERMINAL_ACCESS_DENIED` 반환 확인
4. 헤더 없이 동일 요청 → 정상 생성

**기대 결과**: `TRUST_PROXY=true` + 외부 IP 헤더 시 `TERMINAL_ACCESS_DENIED`, 로컬 IP는 정상 처리.

> **구현 참조**: `networkUtils.extractRequestIP`는 `TRUST_PROXY=true` + TCP peer가 루프백일 때만 `X-Forwarded-For`를 참조 ([networkUtils.ts](../../packages/server/src/utils/networkUtils.ts)). `packages/server/src/utils/__tests__/networkUtils.test.ts` 에 단위 테스트 커버리지 있으므로 수동 회귀 시에도 해당 유닛테스트 실행으로 1차 검증 가능.

### L-03-02: TERMINAL_ENABLED=false

**선행 조건**: 런처 `--with-terminal-disabled` 플래그로 보조 서버(기본 포트+1 = 21214) 기동.

**런처 실행 예시** (필수):
```
node scripts/run-integration-test.mjs --port=3000 --with-terminal-disabled
```
주 서버는 `--port`(3000 또는 21213)에서 터미널 활성 상태로, 보조 서버는 `<port>+1`에서 `TERMINAL_ENABLED=false`로 동시에 기동됨 ([run-integration-test.mjs:253](../../scripts/run-integration-test.mjs#L253)). 보조 서버가 없으면 본 시나리오는 **SKIP이 아니라 런처 재기동으로 해결**한다.

**절차**:
1. `browser_navigate("http://localhost:<port+1>")` → 로그인 확인 (주 서버와 동일 자격증명)
   > **중요**: 반드시 `localhost` 사용. `127.0.0.1`은 브라우저 쿠키 관점에서 별도 origin이라 주 서버(`localhost:<port>`)의 세션 쿠키가 전달되지 않아 자동 로그인이 실패한다. 런처는 `localhost:<port>` URL을 인쇄한다.
2. 기존 프로젝트 선택 또는 생성 → 프로젝트 페이지 진입
3. 터미널 탭 클릭
4. `browser_wait_for(text="터미널 기능이 비활성화되어 있습니다", time=10)` — 소켓 연결 후 `terminal:access` 이벤트 도착 대기
5. `browser_snapshot` → 안내 메시지 + ShieldAlert 아이콘 확인, "새 터미널" 버튼 없음 확인
6. `browser_evaluate("() => fetch('/api/terminal-status').then(r=>r.status)")` — WebSocket 전용 기능이므로 404 이상 확인으로 충분
7. `browser_navigate("http://localhost:<port>")` 로 주 서버 복귀

**기대 결과**: 터미널 탭에 "터미널이 비활성화되었습니다" 안내 + ShieldAlert 아이콘 표시, "새 터미널" 버튼 없음.

> 터미널 생성은 WebSocket(`terminal:create`)으로만 가능하므로 API 레벨 거부는 WebSocket 에러 응답(`TERMINAL_DISABLED`)으로 확인. `browser_wait_for`로 소켓 연결 완료를 반드시 대기할 것.
