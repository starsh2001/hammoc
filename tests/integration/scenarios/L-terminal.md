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
**절차**:
1. `browser_evaluate`로 외부 IP를 가장한 헤더로 터미널 생성 API 직접 호출:
   ```js
   browser_evaluate(`() => fetch('/api/terminals', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.42' },
     body: JSON.stringify({ projectSlug: '<slug>' })
   }).then(r => ({ status: r.status, body: r.statusText }))`)
   ```
2. 응답 상태코드 403 또는 에러 코드 `TERMINAL_ACCESS_DENIED` 확인
3. 정상 요청(헤더 없음)은 생성 성공 확인

**기대 결과**: 외부 IP 감지 경로에서 403, 로컬 요청은 정상 처리.

> 서버의 `networkUtils.extractRequestIP` + `isLocalIP`가 `X-Forwarded-For` 헤더를 참조하는지 확인 필요. 참조하지 않으면 버그로 기록하고 시나리오를 코드 경로에 맞게 조정.

### L-03-02: TERMINAL_ENABLED=false
**절차**:
1. **테스트 모드 환경 설정** — `scripts/run-integration-test.mjs` 또는 전용 런처가 `TERMINAL_ENABLED=false`로 보조 서버 인스턴스를 포트 N+1에 띄우도록 구성 (런처 미구현 시 신규 추가)
2. `browser_navigate("http://localhost:<N+1>/projects/<slug>")` 로 해당 인스턴스 접근
3. 프로젝트 진입 후 터미널 탭 클릭
4. `browser_snapshot` → "터미널이 비활성화되었습니다" 안내 표시 확인
5. `browser_evaluate` fetch로 `POST /api/terminals` → 403 또는 `TERMINAL_DISABLED` 오류 확인
6. 테스트 종료 후 보조 인스턴스 종료

**기대 결과**: 터미널 탭 비활성, API 레벨 거부, 안내 메시지 노출.

> 보조 인스턴스 실행 방법이 없으면 `run-integration-test.mjs`에 `--with-terminal-disabled` 플래그 추가 구현 필요 (테스트 러너 인프라 업데이트 — 별도 작업).
