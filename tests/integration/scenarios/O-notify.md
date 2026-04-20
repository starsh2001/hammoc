# O. 알림

**범위**: 웹 푸시, Telegram.
**선행 도메인**: A. 외부 서비스 연결 필요.

---

## O1. 웹 푸시 알림 `[EDGE]`

### O-01-01: 권한 요청 & 활성화
**절차**:
1. **테스트 러너가 Playwright context에 `permissions: ['notifications']` 부여** — 이 전제가 있어야 브라우저 권한 프롬프트가 자동 허용됨. 런처(`scripts/run-integration-test.mjs` 등)에서 context 생성 시 옵션 주입
2. `browser_evaluate("() => Notification.permission")` → `"granted"` 확인
3. Settings → Notifications → "Enable Web Push" 클릭
4. `browser_evaluate`로 서비스워커 등록 확인:
   ```js
   () => navigator.serviceWorker.getRegistrations().then(regs => regs.map(r => r.scope))
   ```
5. "테스트 알림" 버튼 클릭
6. `browser_evaluate`로 Notification API 스파이가 받은 호출 기록 확인:
   ```js
   () => window.__notifications__ || []
   ```
   (테스트 러너가 `window.Notification`을 훅킹해 호출을 배열로 기록하도록 설정)

**기대 결과**:
- 서비스워커 `/sw.js` 등록됨
- 테스트 알림 호출 1회 이상 기록

> 전제가 충족되지 않으면 시나리오를 실행하지 말고 런처 설정을 선행 수정. 통합 테스트 자체에서 스킵하지 말 것.

### O-01-02: Claude 응답 완료 알림
**절차**:
1. O-01-01 상태(알림 활성)에서 긴 응답 유도 프롬프트 전송 (예: "Count from 1 to 100 with short sentences")
2. `browser_tabs(action="new")` 로 다른 URL 오픈 → 원 세션 탭이 배경 전환
3. 응답 완료까지 대기 (원 탭의 DOM은 background 상태에서도 스트림 진행)
4. `browser_tabs(action="select", index=0)` 복귀 후 `window.__notifications__` 확인 → 최소 1회 알림 호출 기록 확인

**기대 결과**: 응답 완료 시 `new Notification(...)` 호출 기록 남음.

**엣지케이스**:
- E1. 브라우저 미지원: `Notification` 전역 삭제 후 UI 안내 확인
- E2. OS 알림 차단: `Notification.permission === 'denied'` 모킹 후 UI "비활성" 표시 확인

---

## O2. Telegram 알림 `[EDGE]`

> **필수 런처 플래그**: O2 시나리오는 반드시 `--mock-telegram` 플래그로 기동된 테스트 런처에서 실행해야 한다. 이 플래그 없이 기동하면 `BOT_API_BASE_URL` 환경변수가 설정되지 않아 서버가 **실제 `api.telegram.org`로 요청**을 보내고, 검증용 토큰이 거부되어 `"Not Found"` 응답이 반환된다.
>
> ```
> node scripts/run-integration-test.mjs --port=3000 --mock-telegram
> ```
>
> 이 플래그는 `scripts/mock-telegram.mjs`를 `<port>+17`에 백그라운드로 기동하고 `BOT_API_BASE_URL=http://127.0.0.1:<mockPort>`를 주 서버 env에 주입한다. 사전 검증:
> ```js
> browser_evaluate(`() => fetch('http://127.0.0.1:<mockPort>/mock-telegram/health').then(r => r.ok)`)  // true 필요
> ```
> 주 서버 프로세스에 환경변수가 실제로 들어갔는지는 `/api/preferences`에 직접 노출되지 않으므로, O-02-01의 "Send Test" 결과를 보고 **목 서버 messages 로그에 기록이 남는지**로 확인할 것. 실 Telegram API로 빠지면 `success:false, error:"Not Found"`가 반환된다.

### O-02-01: 설정 & 테스트 메시지
**절차**:
1. 목 Telegram 서버 기동 확인 (`browser_evaluate` fetch `http://127.0.0.1:<mockPort>/mock-telegram/health` (mockPort = 주 포트 + 17) → 200)
2. Settings → Notifications → Telegram 섹션
3. 토큰 `test-token`, 채팅 ID `123456` 입력 → "저장"
4. "Send Test" 클릭
5. `browser_evaluate` fetch로 `http://127.0.0.1:<mockPort>/mock-telegram/messages` (mockPort = 주 포트 + 17, 예: 3000 → 3017, 21213 → 21230) → 최근 메시지 목록에 테스트 메시지 포함 확인
6. 설정 저장 검증: `fetch('/api/preferences/telegram', { credentials: 'include' }).then(r => r.json())` → 토큰(마스킹된 형태)과 채팅 ID가 저장되어 있는지 확인

**기대 결과**: 목 서버에 `sendMessage` 호출 기록, 설정 저장.

### O-02-02: 권한 요청 & 응답 완료 알림
**절차**:
1. O-02-01 상태에서 Settings → Notifications → Telegram 섹션 → **"Always notify (even when session is visible)"** 토글 활성화 → 저장
   - 이 옵션이 없으면 세션이 활성(소켓 연결됨) 상태에서는 알림이 억제되어 테스트 불가
2. 채팅 페이지로 이동 → "Read file /etc/passwd" 같은 권한 필요 프롬프트 전송
3. 권한 모달 발생 → `http://127.0.0.1:<mockPort>/mock-telegram/messages` (mockPort = 주 포트 + 17, 예: 3000 → 3017, 21213 → 21230)에 "권한 요청" 알림 도착 확인
4. "허용" 클릭 → 응답 완료 대기
5. 목 서버에 "응답 완료" 알림 도착 확인
6. **정리** — Always notify 토글 비활성화 (원래 상태 복원)

**기대 결과**: 권한 요청과 응답 완료 각각 Telegram 알림 발송 기록.

> **설계 동작**: `alwaysNotify=false`(기본값)에서는 소켓이 연결된 활성 세션에 알림을 보내지 않는다. 이 시나리오는 반드시 `alwaysNotify=true` 활성화 후 실행해야 한다.

**엣지케이스**:
- E1. 토큰 만료: 목 서버가 401 반환하도록 설정 → UI에 명확한 오류 표시 확인
- E2. 채팅 ID 오기입: 목 서버 400 반환 → 실패 로깅 확인
- E3. Rate limit: 목 서버 429 반환 → 재시도 또는 드롭 정책 확인
