# P. 전역 설정

**범위**: 언어 / 테마 / 채팅 타임아웃 / 고급 설정 / 서버 업데이트.
**선행 도메인**: A.

---

## P1. 언어 전환 `[CORE]`

### P-01-01: 6개 로케일 순회
**선행 조건**: 원래 `preferences.language` 값을 기록해둔다 (시나리오 종료 시 복구용).

**절차**: `<TARGET>/settings` 진입 후 언어 `select` 를 찾아 `en → ko → ja → zh-CN → es → pt` 순서로 값 주입. 각 전환마다 UI 레이블·`localStorage.i18nextLng`·`/api/preferences.language` 를 확인한다.

```js
// Combobox 는 value 기반으로 찾는 것이 aria-label 다국어 변동보다 안정적
const select = Array.from(document.querySelectorAll('select'))
  .find(s => Array.from(s.options).some(o => o.value === 'en'));
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
for (const locale of ['en', 'ko', 'ja', 'zh-CN', 'es', 'pt']) {
  setter.call(select, locale);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  // 검증: h1 텍스트, localStorage, preferences API 가 동일 locale 기준으로 일관됨
}
```

**기대 결과**:
- `h1`/`h2` 텍스트가 각 locale 에 맞게 전환됨 (예: en="Settings/Global Settings", ko="설정/전역 설정", ja="設定/グローバル設定", zh-CN="设置/全局设置", es="Configuración/Configuración global", pt="Configurações/Configurações globais")
- `localStorage.getItem('i18nextLng')` == 선택 locale
- `/api/preferences.language` == 선택 locale
- 종료 시 원래 locale 로 복구

**엣지케이스**:
- E1. 일부 번역 누락: 기본 언어(en) 폴백
- E2. 폰트 지원: zh-CN/ja 의 한자 렌더링 이상 없음

---

## P2. 테마 `[CORE]`

### P-02-01: Dark / Light / System
**선행 조건**: 원래 `preferences.theme` 값을 기록해둔다 (복구용).

**절차**: `<TARGET>/settings` 전역 설정의 `radiogroup "테마"` 에서 `다크/라이트/시스템` 각각 클릭 — 라벨 텍스트는 locale 에 따라 달라지므로 `input[type="radio"]` 순회하며 부모 라벨 텍스트로 매칭한다.

```js
const labelMap = {
  light: ['Light', '라이트', 'ライト', '浅色', 'Claro'],
  dark:  ['Dark', '다크', 'ダーク', '深色', 'Oscuro', 'Escuro'],
  system:['System', '시스템', 'システム', '系统', 'Sistema'],
};
for (const theme of ['light', 'dark', 'system']) {
  const radio = Array.from(document.querySelectorAll('input[type="radio"]')).find(r => {
    const label = (r.closest('label') || r.parentElement)?.textContent?.trim() || '';
    return labelMap[theme].some(k => label.includes(k));
  });
  radio.click();
  await new Promise(r => setTimeout(r, 300));
  // 검증: documentElement.classList.contains('dark'), preferences.theme
}
```

**기대 결과**:
- `light` → `document.documentElement.classList.contains('dark') === false` / `preferences.theme === 'light'`
- `dark`  → `...dark') === true` / `preferences.theme === 'dark'`
- `system` → `dark` 클래스 값이 `window.matchMedia('(prefers-color-scheme: dark)').matches` 와 일치 / `preferences.theme === 'system'`
- 종료 시 원래 theme 로 복구

**엣지케이스**:
- E1. OS 레벨 prefers-color-scheme 변경 시 `system` 모드 실시간 반영 (Playwright 로는 `browser_evaluate` 에서 `matchMedia` 결과를 강제로 바꾸기 어려우므로 이 부분은 수동 회귀에서 보강)
- E2. 테마 전환 시 깜빡임 (FOUC) — CI 자동화 보다 실제 눈으로 체감 판정

---

## P3. 채팅 타임아웃 `[EDGE]`

### P-03-01: 짧은 타임아웃 유도
**절차**:
1. 보조 런처 백그라운드 기동: `node scripts/run-integration-test.mjs --port=21215 --chat-timeout=10000` (기본 런처는 그대로 유지 — 재기동하면 재로그인 강제됨)
2. 최대 30초 폴링으로 `<TARGET_SECONDARY>/api/health` 200 대기. 준비되면 `browser_tabs(action="new")` → **`http://localhost:21215`** 로 접속 (반드시 `localhost` — `127.0.0.1` 은 주 서버와 쿠키 origin 이 달라 자동 로그인 실패)
3. `/api/preferences` 호출 → `chatTimeoutMs: 10000` 및 `_overrides: ["chatTimeoutMs"]` 포함 확인
4. 새 세션 생성 후 입력바 권한 칩이 `Ask` 인지 확인 (기본값이 `Ask` 가 아니면 클릭으로 순환해 `Ask` 로 설정). 파일 쓰기 권한을 유도하는 메시지 전송 — 예: `Create a file named test.txt with content "hello"`
5. `Write` ToolCard 가 보이기 시작하면 **응답 없이 ≥12초 대기** (10초 + 버퍼 2초). 이 구간 동안 권한 모달을 승인/거부하지 않는다
6. 메시지 영역에 "응답 시간이 초과되었습니다. 다시 시도해 주세요." 가 노출되는지 확인 — 주 확인은 `main` 컨테이너의 `innerText` 에 해당 문자열이 포함되는지로 판정
7. 탭 닫기 (`browser_tabs(action="close", index=<보조탭>)`) 후 보조 런처 종료:
   ```bash
   # 런처 로그에서 primary PID 추출
   grep "\[primary\] PID" <launcher-secondary.log> | tail -1
   # Windows:  taskkill /PID <pid> /T /F
   # macOS/Linux: kill <pid>
   ```

**기대 결과**: SDK 활동이 10초 이상 없을 때 타임아웃 발동 → 자동 abort + 메시지 버블 내 "응답 시간이 초과되었습니다. 다시 시도해 주세요." 노출 (tool card 에는 보통 `사용자가 응답을 취소했습니다.` + `오류: error` 가 함께 표시됨).

> **중요**: 타임아웃은 **활동 기반(activity-based)** — [websocket.ts:2626-2640](../../packages/server/src/handlers/websocket.ts#L2626-L2640) 참고. SDK 콜백 이벤트마다 `resetTimeout()` 이 호출되므로, 단순히 긴 응답을 유도하는 것으로는 타임아웃이 발동하지 않음. 권한 요청 대기처럼 SDK 이벤트가 완전히 멈춘 상태여야 함.
> 클램프: 5s~30min 범위 외 값은 기본값(300000ms)으로 대체됨 ([websocket.ts:2630](../../packages/server/src/handlers/websocket.ts#L2630)).

**엣지케이스**:
- E1. 서버 `CHAT_TIMEOUT_MS` 와 불일치 시 더 짧은 쪽이 우세

---

## P4. 고급 설정 & 서버 재시작 `[SDK] [EDGE]`

### P-04-01: Thinking / Max Turns / Budget 값 저장
**선행 조건**: `/api/preferences` 에서 현재 `maxThinkingTokens`, `maxTurns`, `maxBudgetUsd` 값을 기록 (복구용 — 대부분 기본 미설정 = `undefined`).

**절차**: `<TARGET>/settings/advanced` 진입 후 아래 3개 `input[type="number"]` 각각에 값을 주입한다. React controlled input 이므로 native setter + `input/change/blur` 3종 이벤트가 모두 필요. 입력 후 ~1.5초 대기 (preferences PATCH debounce 반영).

| 필드 | `id` | 허용 범위 | 테스트 값 |
|---|---|---|---|
| 최대 사고 토큰 수 | `max-thinking-tokens` | 1024 ~ 128000 | `12345` |
| 최대 턴 수 | `max-turns` | 1 ~ 100 | `33` |
| 최대 예산 (USD) | `max-budget` | 0.01 ~ 100 | `5.5` |

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
const setVal = (id, v) => {
  const el = document.getElementById(id);
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
};
setVal('max-thinking-tokens', '12345');
setVal('max-turns', '33');
setVal('max-budget', '5.5');
await new Promise(r => setTimeout(r, 1500));
```

**기대 결과**:
- `/api/preferences` 가 `{ maxThinkingTokens: 12345, maxTurns: 33, maxBudgetUsd: 5.5 }` 를 반환
- 시나리오 종료 시 각 입력값을 빈 문자열로 되돌려 기본값(undefined) 복원 — 런타임 SDK 호출에 남기지 않음
- (선택) 새 세션 생성 후 WebSocket `session:start` payload 에 위 값들이 SDK 파라미터로 전달되는지 E 도메인과 교차검증

**엣지케이스**:
- E1. 범위 밖 값 (예: `maxThinkingTokens=100`, `maxTurns=0`, `maxBudget=999`) 주입 시 UI validation — 경고 메시지 또는 값 클램프 여부
- E2. 비어있는 값을 저장 후 `/api/preferences` 응답에서 해당 키가 `undefined`/누락 상태인지 (기본값 복구 경로)

### P-04-02: 서버 재시작
**목적**: "서버 재빌드 & 재시작" 액션이 서버 프로세스를 실제로 재기동하고, 재기동 이후에도 세션이 유지되며 이전 세션의 히스토리가 JSONL에서 정상 복원되는지 검증.

> **세션 유지가 의도된 동작**: Hammoc 은 `~/.hammoc/config.json` 에 영속된 `sessionSecret` 을 재시작 시 재사용한다 ([authConfigService.ts:157-179](../../packages/server/src/services/authConfigService.ts#L157-L179)). 재시작 컨트롤러 ([serverController.ts:216-237](../../packages/server/src/controllers/serverController.ts#L216-L237)) 는 `rotateSessionSecret()` 을 호출하지 않으므로 재시작 후에도 쿠키 서명 키가 동일해 기존 세션이 유효하다. **로그인 페이지 재노출을 기대하지 말 것** — 2026-04-21 P-04-02 선례에서 이 가정이 한 번 깨졌다.

**선행 조건**:
- 로그인된 상태. `password:<값>` 스킬 인자는 재시작 후 재로그인 용도로는 불필요하지만, 엣지케이스(세션 무효화 정책이 바뀌는 경우)에 대비해 준비돼 있다면 사용.

**절차**:
1. 현재 접속 호스트가 `localhost` 또는 `127.0.0.1` 인지 확인 (`browser_evaluate("() => location.hostname")`). 다른 값이면 `<TARGET>` 으로 재접속 (원격 IP에서는 재시작 버튼 비활성 — E1 검증).
2. 재시작 전 상태 기록:
   ```js
   // 서버 health + 포트 점유 PID
   browser_evaluate(`() => fetch('/api/health').then(r => r.json())`)
   // 쉘에서: netstat -ano | findstr LISTENING | findstr ":<TARGET_PORT> "  (Windows)
   //         lsof -iTCP:<TARGET_PORT> -sTCP:LISTEN                          (macOS/Linux)
   ```
   `preRestartPid` 를 기록해둔다 (재시작 성공 판정용).
3. Settings → Advanced → "서버 재빌드 & 재시작" 버튼 클릭 → confirm 모달에서 `browser_handle_dialog(accept=true)` 로 승인
4. 서버 재기동 대기 — 포트가 일시 내려간 뒤 재바인딩까지 최대 90초 폴링:
   ```bash
   for i in $(seq 1 90); do
     code=$(curl -sSf -o /dev/null -w "%{http_code}" --max-time 1 <TARGET>/api/health 2>/dev/null)
     [ "$code" = "200" ] && echo "ready at ${i}s" && break
     sleep 1
   done
   ```
   재바인딩 확인 후 `netstat`/`lsof` 로 새 PID 를 조회해 `postRestartPid != preRestartPid` 인지 검증.
5. `browser_navigate(<TARGET>/settings/advanced)` 또는 이전 세션 URL 로 탐색 — **`/login` 으로 리다이렉트되지 않고** 그대로 인증된 상태로 진입되는지 확인. `/api/preferences` 가 200 반환하는지도 같이 검증.
6. 재시작 이전에 있던 세션 URL 로 이동 → 메시지 히스토리가 JSONL 에서 복원되는지 확인 (이전 유저 메시지 + tool card 가 그대로 보이면 PASS).

**기대 결과**:
- 서버 프로세스 재기동 (포트 3020 재바인딩, PID 변경)
- 클라이언트: `io server disconnect` → `useWebSocket` 복구 로직으로 자동 재연결
- **세션 유지** — 재로그인 불필요. `/api/preferences` 인증 유지. `/login` 리다이렉트 발생 안 함
- 재시작 이전 세션의 메시지 히스토리 모두 보존 (JSONL 에서 로드)

**엣지케이스**:
- E1. 원격 접속(비-loopback)에서 재시작 버튼 비활성 — `location.hostname` 이 로컬 IP 가 아닐 때 UI 상태 검증
- E2. 재시작 직전 활성 스트림 있음: 스트림 abort 처리되고 마지막 상태까지의 메시지 JSONL 저장 확인

> **런처 인프라 주의 (2026-04-21 선례)**: `scripts/run-integration-test.mjs` wrapper 는 child 재시작 훅을 인지하지 못한다. "서버 재빌드 & 재시작" 을 누르면 원본 child 가 종료되면서 wrapper 도 exit 13 으로 함께 죽고, `✓ Preferences restored from snapshot` 이 실행되어 유저의 실제 preferences 가 복구된다. child 가 `npm run prod` 로 띄운 **grandchild 서버**는 `HAMMOC_PORT=<TARGET_PORT>` 환경변수를 상속해 다시 `<TARGET_PORT>` 에 바인딩되므로 테스트 자체는 계속 진행 가능. 다만 **teardown 이 `autoLaunched=true` 의 런처 PID 만 추적하면 grandchild 가 고아가 된다** — 본 시나리오 종료 시 `netstat`/`lsof` 로 `<TARGET_PORT>` 의 현재 PID 를 재조회해 `taskkill /T /F` (Windows) 또는 `kill` (Unix) 로 명시 종료할 것. 또한 launcher 의 preferences 롤백 타이밍상 P-04-01 에서 설정한 값이 재시작 직후 원복되므로, P-04-01 뒤에 바로 이어 붙이지 말고 P-04-01 완료 직후 원복하거나 P-04-02 를 마지막 시나리오로 배치한다.

---

## P5. 서버 업데이트 체크 & 업데이트 `[EDGE]`

### P-05-01: 업데이트 확인 `[MANUAL]`
**절차 (수동)**: About 섹션 → "Check for Updates" 또는 백엔드 `/api/server/check-update` 호출.

**기대 결과**:
- 현재 버전 vs npm 레지스트리 최신 버전 표시
- 신버전 있을 시 업데이트 버튼 활성

> **[MANUAL] 사유**: 개발 모드(소스 체크아웃 환경)에서는 [serverController.ts:246-249](../../packages/server/src/controllers/serverController.ts#L246-L249)가 `501 NOT_APPLICABLE`을 반환하고 About UI에도 버튼이 숨겨진다. 글로벌/npx 설치 환경에서만 동작하므로 릴리즈 직전 수동 회귀에 포함.

### P-05-02: 업데이트 수행 `[MANUAL]`
**절차 (수동)**:
1. 별도 머신/VM에 `npm install -g hammoc@<이전버전>` 으로 구버전 설치
2. 해당 Hammoc 서버 기동 후 Settings → About → "Update" 버튼 클릭
3. `/api/server/update` 호출 → npm update 실행 → 서버 자동 재시작 확인
4. 재접속 후 버전이 최신으로 올라갔는지 확인

**기대 결과**:
- `/api/server/update` 호출 → npm update 실행
- 완료 후 서버 재시작 플로우 진입 (P-04-02)
- 실패 시 롤백 안내

> **[MANUAL] 사유**: 개발 모드(소스 체크아웃 환경)에서는 [serverController.ts:273-275](../../packages/server/src/controllers/serverController.ts#L273-L275)가 `DEV_ONLY` 403을 반환함. 실제 검증은 글로벌/npx 설치 환경에서만 가능하므로 릴리즈 직전 수동 회귀에 포함.

**엣지케이스**:
- E1. 네트워크 차단 → 조용히 실패하지 말고 명확히 오류
- E2. 권한 부족 (glob 설치 경로) → 사용자 가이드 표시
