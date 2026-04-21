# L. 터미널 (PTY)

**범위**: 터미널 생성·입력·리사이즈, 다중 터미널, 보안.
**선행 도메인**: A, B. `TERMINAL_ENABLED` 환경변수 활성 필요.

---

## L1. 터미널 생성 · 입력 · 리사이즈 `[CORE] [ASYNC]`

### L-01-01: 터미널 탭 생성 & 명령 실행
**절차**:
1. 터미널 탭 진입 → "새 터미널" 버튼 클릭 (빈 상태 안내에 표시되는 버튼 또는 헤더 우측 버튼)
2. `browser_wait_for`로 탭 헤더 상태 "연결됨" 표시 대기 (1~2초)
3. Terminal input textbox(`textarea[aria-label="Terminal input"]`) 클릭 → 포커스
4. `browser_type`로 `echo hello` 입력 후 Enter (`submit: true`)
5. `browser_evaluate`로 `.xterm-rows` 내 출력 라인 조회

**기대 결과**:
- `terminal:create` → `terminal:created` (terminalId 수신)
- 출력에 "hello" 라인 표시
- 콘솔 오류 없음 (사전 `/api/debug/kill-ws` 프로브로 인한 404 제외)

### L-01-02: 창 리사이즈 → PTY cols/rows 전달
**절차**:
1. 터미널 활성 상태에서 초기 xterm 상태 기록: `browser_evaluate`로 `.xterm-rows > div` 개수와 `.xterm-screen`의 `clientWidth/Height` 조회
2. `browser_resize(900, 700)` (또는 다른 크기)
3. 1초 대기 후 동일 속성 재조회 → xterm rowCount 변화 확인
4. **PTY 실측 검증**: 터미널 input에 OS별 명령 주입 후 출력 확인
   - Windows(PowerShell): `$Host.UI.RawUI.WindowSize` → `Width`/`Height` 출력
   - Unix: `stty size` → `rows cols` 출력
   반환값이 리사이즈 후 xterm이 표시하는 cols/rows와 일치하는지 확인

**기대 결과**:
- `terminal:resize` 이벤트가 socket.io로 서버에 전달됨
- xterm.js 레이아웃이 새 창 크기에 맞춰 재계산됨 (rowCount 갱신)
- 쉘의 RawUI WindowSize(또는 `stty size`)가 xterm 값과 일치 → PTY `resize()` 실제 호출 증명

> socket.io는 WebSocket 업그레이드 후 네트워크 로그에 이벤트 페이로드가 보이지 않으므로, PTY 실측이 가장 확실한 검증 경로.

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
**절차**:
1. "새 터미널" 버튼 3회 클릭 → `powershell 1/2/3` 또는 `bash 1/2/3` 탭 생성 확인
2. 각 탭 활성화 후 OS별 PID 출력 명령 실행:
   - Windows(PowerShell): `"PIDN=$PID"` (N=1~3)
   - Unix: `echo "PIDN=$$"`
3. 탭을 순회하며 `browser_evaluate`로 각 탭의 `.xterm-rows` 마지막 PID 라인 읽기
4. 3개 PID가 모두 다른지 확인
5. (선택) 서버에서 `tasklist` (Windows) 또는 `ps aux` (Unix)로 동일 PID 존재 검증

**기대 결과**:
- 탭별 PID 독립 (3개 값 서로 다름)
- 탭 전환 시 각 탭의 출력 이력이 그대로 유지됨
- 서버 프로세스 리스트에 3개 쉘 프로세스가 동시에 존재

### L-02-02: 터미널 종료 & 프로세스 정리
**절차**: 탭 X 버튼 → 확인.
**기대 결과**: `terminal:close` 이벤트, 서버에서 프로세스 kill, 좀비 없음.

### L-02-03: 폭주 출력 방어
**절차**:
1. 터미널 탭 생성, 포커스
2. `browser_type`로 명령 주입 (운영체제별):
   - Unix: `yes | head -n 100000`
   - Windows(PowerShell): `1..100000 | %{'y'}` (주의: `%`는 `ForEach-Object` 별칭 하나. `%%`는 cmd.exe batch 문법이므로 PowerShell에서 쓰면 오류)
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

**선행 조건**: 런처 `--with-terminal-disabled` 플래그로 보조 서버(기본 포트+1, 예: `--port=3020`이면 3021, `--port=21213`이면 21214) 기동.

**런처 실행 예시** (필수):
```
node scripts/run-integration-test.mjs --port=3000 --with-terminal-disabled
```
주 서버는 `--port`(3000 또는 21213)에서 터미널 활성 상태로, 보조 서버는 `<port>+1`에서 `TERMINAL_ENABLED=false`로 동시에 기동됨 ([run-integration-test.mjs:253](../../scripts/run-integration-test.mjs#L253)). 보조 서버가 없으면 본 시나리오는 **SKIP이 아니라 런처 재기동으로 해결**한다.

**절차**:
1. `browser_tabs(action="new")`로 새 탭 오픈 후 `browser_navigate("http://localhost:<port+1>")`. 주 서버 탭은 유지
   > **중요**: 반드시 `localhost` 사용. `127.0.0.1`은 브라우저 쿠키 관점에서 별도 origin이라 주 서버(`localhost:<port>`)의 세션 쿠키가 전달되지 않아 자동 로그인이 실패한다. 런처는 `localhost:<port>` URL을 인쇄한다.
2. 기존 프로젝트 선택 또는 생성 → 프로젝트 페이지 진입
3. 터미널 탭 클릭
4. `browser_wait_for(text="터미널 기능이 비활성화되어 있습니다", time=10)` — 소켓 연결 후 `terminal:access` 이벤트 도착 대기
5. `browser_snapshot` → alert 영역 내 ShieldAlert 아이콘 + 안내 메시지 2줄 확인 ("터미널 기능이 비활성화되어 있습니다" / "설정 페이지의 고급 설정에서 터미널 기능을 활성화할 수 있습니다"), "새 터미널" 버튼이 alert 영역에 없음 확인
6. 시나리오 완료 후 `browser_tabs(action="close", index=<보조 탭 index>)`로 보조 탭 닫기. 주 서버 탭으로 복귀

**기대 결과**: 터미널 탭에 "터미널 기능이 비활성화되어 있습니다" 안내 + ShieldAlert 아이콘 표시, "새 터미널" 버튼 없음.

> 터미널 생성은 WebSocket(`terminal:create`)으로만 가능하므로 API 레벨 거부는 WebSocket 에러 응답(`TERMINAL_DISABLED`)으로 확인. `browser_wait_for`로 소켓 연결 완료를 반드시 대기할 것.
>
> **함정**: `/api/terminal-status`는 존재하지 않는 REST 엔드포인트다. Vite SPA fallback이 200 HTML(index.html)을 반환하므로 status 코드로는 비활성화 여부를 판별할 수 없다. UI 안내 표시로만 검증하고, HTTP 프로브 단계는 포함하지 않는다 (2026-04-21 실측).
