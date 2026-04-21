# O. 알림

**범위**: 웹 푸시, Telegram.
**선행 도메인**: A. 외부 서비스 연결 필요.
**필수 런처 플래그**: `--with-notifications --mock-telegram` (모든 O 시나리오 공통)
```
node scripts/run-integration-test.mjs --port=<PORT> --with-notifications --mock-telegram
```

> **구현 메모** — [notificationService.ts:93-95](../../packages/server/src/services/notificationService.ts#L93-L95) 의 `shouldNotify(socketCount)` 는 `socketCount === 0 || alwaysNotify` 규칙을 사용한다. 즉 **Hammoc 탭의 WebSocket이 살아있으면 알림은 억제**된다. "다른 탭을 여는 것"만으로는 원 탭 소켓이 끊기지 않으므로 알림이 발송되지 않는다. O-01-02/O-02-02 는 이 규칙에 맞춰 `alwaysNotify=true` 를 선행 설정하거나 `/api/debug/kill-ws` 로 소켓을 끊고 재현해야 한다.
>
> **클라이언트 구현 메모** — Hammoc 은 메인 스레드에서 `new Notification(...)` 을 **호출하지 않는다**. 모든 웹 푸시는 서비스 워커 [sw.ts:28-47](../../packages/client/src/sw.ts#L28-L47) 의 `push` 이벤트 핸들러에서 `registration.showNotification(...)` 을 통해 표시된다. 따라서 `window.Notification` 생성자 스파이로는 아무것도 캡처할 수 없다. 검증은 **서버 로그 + mock-telegram messages + 서비스 워커 레벨 스파이** 로 한다.

---

## O1. 웹 푸시 알림 `[EDGE]`

### O-01-01: 권한 요청 & 구독 활성화
**선행 조건**:
- 런처를 `--with-notifications` 로 기동 → Playwright context 에 `permissions: ['notifications']` 주입
- `/api/preferences/webpush` GET 이 VAPID public key 를 반환하는 환경 (`~/.hammoc/vapid-keys.json` 자동 생성)

**절차**:
1. `browser_evaluate("() => Notification.permission")` → `"granted"` 확인
2. `browser_navigate("http://localhost:<PORT>/settings/notifications")` → Settings → 알림 페이지
3. Web Push 섹션의 **"이 브라우저 구독"** 버튼 클릭 (이전에 구독된 적 있으면 "구독 해제" 만 보이므로 먼저 해제)
4. 서비스 워커 등록 확인:
   ```js
   () => navigator.serviceWorker.getRegistrations().then(regs => regs.map(r => ({ scope: r.scope, active: r.active?.scriptURL })))
   ```
   → `[{ scope: "http://localhost:<PORT>/", active: "http://localhost:<PORT>/sw.js" }]`
5. 네트워크 확인: `POST /api/preferences/webpush/subscribe` 가 `200 OK` 반환, 응답 body `subscriptionCount >= 1`
6. UI 상태 변화: "이 브라우저가 구독 중입니다" 문구 + "구독 해제" 버튼 활성화 + "테스트 푸시 보내기" 버튼 enabled
7. **"테스트 푸시 보내기"** 클릭
8. 검증 (셋 중 하나 이상):
   - 네트워크: `POST /api/preferences/webpush/test` → `200 OK`
   - 서버 로그 (launcher stdout 또는 `logs/server-<date>.log`): `[webPushService] [WebPush] sendPush tag=test total=<N> success=<N> failure=0`
   - SW 레벨 스파이: 아래 헬퍼를 **구독 클릭 직전에** 설치하고 `window.__swShowNotifications__` 배열 길이 ≥ 1 확인
     ```js
     () => navigator.serviceWorker.ready.then(reg => {
       if (reg.__hammocSpy) return;
       reg.__hammocSpy = true;
       window.__swShowNotifications__ = [];
       const orig = reg.showNotification.bind(reg);
       reg.showNotification = (title, options) => {
         window.__swShowNotifications__.push({ title, options, at: Date.now() });
         return orig(title, options);
       };
       return true;
     })
     ```
     > 주의: 이 프록시는 **메인 스레드에서 직접 호출된 `registration.showNotification`** 만 잡는다. SW 스레드 내부의 `push` 이벤트 핸들러가 호출한 `self.registration.showNotification` 은 별도 스레드이므로 잡히지 않을 수 있다. 헤드리스 Chromium 에서는 서버 로그 경로가 가장 신뢰 가능.

**기대 결과**:
- 서비스 워커 `/sw.js` 등록됨
- `subscribe` 엔드포인트 `200` + `subscriptionCount` 증가
- 테스트 푸시 클릭 시 서버 `[WebPush] sendPush tag=test ... success=<N>` 로그 1회 출력

**엣지케이스**:
- E1. 브라우저 미지원: `browser_evaluate`로 `delete window.Notification` 후 페이지 리로드 → "구독" 버튼 비활성화 및 안내 문구 확인
- E2. OS 알림 차단: `Notification.permission === 'denied'` 모킹 후 UI "비활성" 표시 확인

### O-01-02: Claude 응답 완료 웹 푸시 알림
**선행 조건**: O-01-01 상태 (구독됨) + `webPush.enabled=true` (구독 시 UI 체크박스가 자동 on, 혹은 `PATCH /api/preferences/webpush {enabled:true}`)

**절차**:
1. **알림 억제 해제** — 둘 중 하나:
   - (A) `PATCH /api/preferences/telegram { alwaysNotify: true }` 로 socketCount 무시 옵션 on (서버가 `await notificationService.reload()` 후 응답 → 응답 수신 시점에 반영됨). 직후 `GET /api/preferences/telegram` 로 `alwaysNotify: true` 재확인
   - (B) 탭 유지한 채 응답 시작 → 즉시 `POST /api/debug/kill-ws { sessionId }` 로 해당 세션 소켓 끊음 → `shouldNotify(0) === true` 경로. 주의: 이후 스트림 수신이 끊겨 DOM 에서 응답 확인 불가, 서버 로그만으로 판정
   - **(A) 권장** — kill-ws 는 후속 스트림 수신을 막아 검증 노이즈가 많음
2. 채팅 페이지로 이동 → `Reply with exactly: OK-PUSH-2` 같은 짧은 프롬프트 전송
3. 응답 완료까지 대기 (`browser_wait_for text="OK-PUSH-2"`, 30~45초)
4. 검증 — launcher 로그에서 아래 두 줄이 모두 나타나면 PASS:
   ```
   [notificationService] notifyComplete: session=<id> telegram=<bool> push=true
   [webPushService] [WebPush] sendPush tag=complete-<id> total=<N> success=<N> failure=<M>
   ```
   - `push=false` 로 찍히면 `webPush.enabled` 가 서비스 메모리에 반영되지 않은 것 — 서버 PATCH 경로 reload 누락 의심, `/api/preferences GET` 으로 파일 상태 확인
   - `failure=<N>` 이 `total` 과 같으면 모든 subscription 이 expire 됨 (410/404) → `~/.hammoc/push-subscriptions.json` 정리 필요 (`rm` 후 런처 재기동 + 구독 재등록)
5. **정리**: (A) 경로 사용했다면 `PATCH /api/preferences/telegram { alwaysNotify: false }` 로 복원. (B) 사용했다면 상태 오염 없음 (kill-ws 는 서버 메모리에만 영향)

**기대 결과**: `notifyComplete` + `sendPush` 로그 쌍이 프롬프트 응답 완료 직후 launcher 로그에 남음. 헤드리스 Chromium 에선 실제 SW push 수신/displayNotification 은 검증 대상이 **아님** (FCM 경로는 외부 의존).

**엣지케이스**:
- E1. `webPush.enabled=false` 에서 응답 완료 → `[WebPush] sendPush skipped: no subscriptions` 또는 `notifyComplete` 로그에 `push=false` 로 찍히는지 확인
- E2. 구독 0개 → `notifyComplete` 는 진입하지만 `sendPush skipped: no subscriptions` 로그 확인

---

## O2. Telegram 알림 `[EDGE]`

> **필수 런처 플래그**: O2 시나리오는 반드시 `--mock-telegram` 으로 기동된 런처에서 실행한다. 이 플래그 없이 기동하면 `BOT_API_BASE_URL` 환경변수 미주입으로 서버가 **실 `api.telegram.org`로 요청**을 보내고 테스트 토큰이 거부되어 `success:false, error:"Not Found"` 가 반환된다.
>
> ```
> node scripts/run-integration-test.mjs --port=<PORT> --mock-telegram
> ```
>
> 이 플래그는 `scripts/mock-telegram.mjs` 를 `<PORT>+17` 에 백그라운드로 기동하고 `BOT_API_BASE_URL=http://127.0.0.1:<mockPort>` 를 주 서버 env 에 주입한다. 사전 검증 (브라우저 CORS 차단이므로 Bash 로):
> ```bash
> curl -s http://127.0.0.1:<mockPort>/mock-telegram/health  # {"ok":true,"mode":"ok",...}
> ```
> `browser_evaluate` 로 http://127.0.0.1:<mockPort> 에 fetch 하면 CORS 로 거부되므로 **서브에이전트나 메인 에이전트가 Bash 로 확인**할 것.

### O-02-01: 설정 & 테스트 메시지
**선행 조건**:
- mock-telegram 헬스 200 확인
- `mock-telegram/reset` 호출로 이전 run 의 메시지 제거:
  ```bash
  curl -sS -X POST http://127.0.0.1:<mockPort>/mock-telegram/reset  # {"ok":true}
  ```

**절차**:
1. Settings → Notifications 페이지 열기
2. Bot Token "변경" → `test-token` 입력 → "저장"
3. Chat ID "변경" → `123456` 입력 → "저장"
4. 설정 저장 검증: `fetch('/api/preferences/telegram', { credentials: 'include' }).then(r => r.json())` →
   - `hasBotToken: true`, `hasChatId: true`, `maskedBotToken: "••••••••oken"`, `chatId: "123456"`
5. "Telegram 알림 활성화" 체크박스 on (이전 상태가 off 일 때만)
6. "테스트 알림 보내기" 클릭
7. mock-telegram messages 확인 (Bash):
   ```bash
   curl -s http://127.0.0.1:<mockPort>/mock-telegram/messages
   ```
   → `{"messages":[{"timestamp":"...","token":"test-token","chat_id":"123456","text":"🔔 <b>Hammoc</b>\n테스트 알림입니다. Telegram 알림이 정상 작동합니다!","parse_mode":"HTML"}]}`
8. **정리**: `PATCH /api/preferences/telegram { botToken: null, chatId: null, enabled: false }` 로 자격증명 제거

**기대 결과**: mock-telegram 에 `sendMessage` 호출 기록 1건 + 서버 `/api/preferences/telegram` 응답에 `hasBotToken/hasChatId = true`.

### O-02-02: 권한 요청 & 응답 완료 Telegram 알림
**선행 조건**:
- O-02-01 완료 후 다시 자격증명 설정 (또는 O-02-01 정리를 건너뛴 상태)
- `telegram.enabled=true`

**절차**:
1. mock-telegram 메시지 초기화:
   ```bash
   curl -sS -X POST http://127.0.0.1:<mockPort>/mock-telegram/reset
   ```
2. **"항상 알림" 토글 on** — 아래 둘 중 하나:
   - (A) UI: Settings → Notifications → Telegram 섹션 → "항상 알림 — 세션을 보고 있을 때에도 알림 전송" 체크박스 클릭
   - (B) API: `PATCH /api/preferences/telegram { alwaysNotify: true }` (응답 수신 시점에 서버 메모리 반영 완료)
   - 직후 `fetch('/api/preferences/telegram').then(r=>r.json())` 로 `alwaysNotify: true` 반영 확인. false 면 라우트 핸들러 구조분해 문제 재발 의심 ([preferences.ts:31-40](../../packages/server/src/routes/preferences.ts#L31-L40))
   - **(B) 권장** — API 경로가 UI 이벤트 순서에 영향받지 않고 명확함
3. 새 세션 시작 → `Use the Bash tool to create a directory: mkdir /tmp/hammoc-o-02-probe` 같은 권한 필요 프롬프트 전송
   - 참고: [`settings.local.json`](../../../.claude/settings.local.json) 에 `Bash(mkdir:*)` 허용 있으면 모달 없이 자동 실행될 수 있음. 그래도 `notifyInputRequired` 는 SDK `canUseTool` 훅 경로로 호출됨. 모달이 안 떠도 Telegram 권한 알림은 발송되어야 함.
4. 30초 이내 mock-telegram messages 확인:
   ```bash
   curl -s http://127.0.0.1:<mockPort>/mock-telegram/messages
   ```
   → `text` 에 `🔐 <b>권한 필요</b>\nSession: <code>...</code>\nBash` 포함된 메시지 1건
5. 응답 완료까지 대기 (`browser_wait_for text="OK"` 또는 ESC 로 abort 후 짧은 프롬프트 재시도)
6. 응답 완료 후 mock-telegram messages 재확인 → `✅ <b>완료</b>` 포함 메시지 1건 추가
7. 서버 로그 확인 (보조 검증):
   ```
   [notificationService] notifyInputRequired: session=<id> tool=Bash telegram=true push=<bool>
   [notificationService] notifyComplete: session=<id> telegram=true push=<bool>
   ```
8. **정리**: `PATCH /api/preferences/telegram { alwaysNotify: false }` 로 복원

**기대 결과**:
- mock-telegram messages 에 `🔐 권한 필요` + `✅ 완료` 두 건
- launcher 로그에 `notifyInputRequired` + `notifyComplete` 진입 로그

**엣지케이스**:
- E1. 토큰 만료: `curl -sS -X POST http://127.0.0.1:<mockPort>/mock-telegram/mode -H 'Content-Type: application/json' -d '{"mode":"401"}'` → 다음 "테스트 알림" 시 UI 에 실패 표시 확인. 정리: `curl -sS -X POST .../mock-telegram/mode -H 'Content-Type: application/json' -d '{"mode":"ok"}'` 복원
- E2. 채팅 ID 오기입: 위와 동일하게 `mode:"400"` → 실패 로깅 확인. 정리: `mode:"ok"` 복원
- E3. Rate limit: `mode:"429"` → 재시도 또는 드롭 정책 확인. 정리: `mode:"ok"` 복원
- E4. 큐 알림 토글 off 후에도 저장되는지: `PATCH /api/preferences/telegram { notifyQueueStart: false }` → `GET` 응답이 `notifyQueueStart: false` 인지 확인. true 그대로면 라우트 구조분해 문제 재발 의심 (버그 2 회귀 감시 포인트)
