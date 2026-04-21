# A. 인증 & 초기화

**범위**: 로그인, 온보딩 체크리스트, 세션 유지·복구.
**선행 도메인**: 없음 (최초 진입).

---

## A1. 로그인 `[CORE]`

### A-01-01: 정상 비밀번호로 로그인
**목적**: 로그인 후 프로젝트 리스트로 정상 이동.
**선행 조건**: 서버 기동, 로그인 페이지 (`/login`) 또는 로그아웃 상태.

**절차**:
1. `browser_navigate("<TARGET>")` (필요 시 — 이미 로그인 페이지면 생략)
2. `browser_snapshot` → 로그인 페이지 가시성 확인
3. 패스워드 안전 주입 — **`browser_type` 대신 `browser_evaluate` 권장** (스냅샷/로그 노출 방지):
   ```js
   () => {
     const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
     const pw = document.querySelector('input[type="password"]');
     setter.call(pw, '<HAMMOC_TEST_PASSWORD>');
     pw.dispatchEvent(new Event('input', { bubbles: true }));
     return { ok: true };
   }
   ```
4. `browser_click` 로그인 버튼 (또는 `browser_press_key("Enter")`)
5. 로그인 완료 후 `location.reload()` 로 **fresh mount** → 이후 `browser_console_messages(level="error")` 확인
   > **주의**: A-01-02 직후 A-01-01을 연속 실행하면 로그아웃 시점에 pending 상태였던 `/api/preferences`, `/api/server/info` fetch 가 쿠키 무효화 후 401로 해소되며 콘솔 오류가 남는다. 이는 race 아티팩트이며, fresh mount 에서는 발생하지 않는다. "콘솔 오류 없음" 검증은 반드시 새로고침 이후에 수행한다.

**기대 결과**:
- URL이 프로젝트 리스트 페이지(`/`)로 전환
- 대시보드 상단 5개 통계 카드 가시
- **fresh mount 후** 콘솔 오류 없음 (`browser_console_messages(level="error")` → 0건)

**엣지케이스**:
- E1. 잘못된 비밀번호: 오류 메시지 가시, URL 유지
- E2. 초기 비밀번호 미설정 상태: 최초 설정 플로우로 진입

**증거**: `A-01-01-loggedin.png`

---

### A-01-02: 로그아웃
**목적**: 로그아웃 후 로그인 페이지로 복귀.
**절차**:
1. `browser_navigate("<TARGET>/settings")` → 사이드바 **Hammoc 사용자** (구 "Account") 섹션 클릭 → 하단 **로그아웃** 버튼 클릭
   - 푸터의 로그아웃 버튼으로도 동작은 동일하지만, 본 시나리오는 설정 페이지 경로를 표준으로 삼는다.

**기대 결과**:
- URL이 `/login`으로 이동
- 이후 보호된 URL(`/settings`, `/` 등) 접근 시 `/login`으로 리디렉션

---

## A2. 온보딩 체크리스트 `[CORE]`

### A-02-01: 온보딩 항목 자동 검증
**목적**: CLI 설치 · API 키 · MCP 상태가 체크리스트에 반영되는지.
**선행 조건**: CLI 미인증 & API 키 미설정 상태 (초기 설치 또는 설정 초기화 후).

> **설계 주의**: 설정 완료 환경(`authenticated=true` 또는 `apiKeySet=true`)에서 `/onboarding` 직접 접근 시 `OnboardingPage`가 500ms 후 `/`로 자동 리디렉션 (의도된 설계, [OnboardingPage.tsx:36-41](../../packages/client/src/pages/OnboardingPage.tsx#L36-L41)). 따라서 본 시나리오는 **미설정 상태**에서만 체크리스트 검증이 유효하다.

**절차**:
1. 설정 상태 확인: `fetch('/api/cli-status').then(r => r.json())`
2. `authenticated || apiKeySet` 이면 본 시나리오는 **N/A (설정 완료 환경)** 로 기록하고 A-02-02로 진행
3. 미설정 상태인 경우에만: `browser_navigate("/onboarding")` → `browser_snapshot` → 체크리스트 항목 상태 수집

**기대 결과**:
- CLI 설치 상태(`claude` 실행 가능 여부) 자동 감지 표시
- API 키 유효성 표시
- "시작하기" 버튼은 필수 항목 모두 만족 시 활성

**엣지케이스**:
- E1. CLI 없음: 설치 가이드 링크 표시, "확인" 재클릭 시 재감지
- E2. API 키 불일치: 경고 표시

### A-02-02: 설정 완료 환경에서 자동 리디렉션
**목적**: 이미 설정이 완료된 사용자가 `/onboarding` 직접 접근 시 홈으로 자동 이동.
**선행 조건**: `authenticated=true || apiKeySet=true`.

**절차**:
1. `browser_navigate("/onboarding")`
2. ~1초 대기 (500ms 리디렉션 타이머 + 여유)
3. 현재 URL 확인

**기대 결과**: URL이 `/`로 자동 전환.

---

## A3. 세션 유지 / 복구 `[EDGE]`

### A-03-01: 브라우저 새로고침 후 로그인 유지
**선행 조건**: 로그인된 상태 (URL = `/`).

> **라우트 주의**: Hammoc SPA 는 프로젝트 리스트를 루트 `/` 에서 렌더링한다. `/projects` 경로는 존재하지 않으며 네비게이션하면 루트로 폴백된다. 따라서 "새로고침"은 `location.reload()` 또는 `F5` 로 트리거한다.

**절차**:
1. `browser_evaluate("() => { location.reload(); return 'reloading'; }")` 로 하드 새로고침
2. `browser_wait_for(time=2)` — 페이지 재마운트 대기
3. 로그인 상태 확인:
   - URL 이 `/login` 이 아님 (`location.href` 검증)
   - 페이지에 "로그아웃" 버튼이 존재 (`Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === '로그아웃')`)
   - 참고: 세션 쿠키는 `httpOnly` 라 `document.cookie` 로는 보이지 않는다 — 쿠키 존재 검증 대신 위 UI 시그널로 확인한다.

**기대 결과**: 재로그인 요구 없음, 동일한 프로젝트 리스트 페이지 유지.

### A-03-02: 토큰 만료 후 보호된 경로 접근
**선행 조건**: 로그인된 상태.

> 세션 쿠키는 `httpOnly` 여서 JS 로 직접 삭제 불가. 서버 API 로 무효화한다.

**절차**:
1. 로그인 상태 확인 — 루트 `/` 접근 가능, 대시보드 5개 통계 카드 가시
2. `browser_evaluate("() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(r => r.status)")` → 200 확인
3. `browser_navigate("<TARGET>/settings")` (보호된 경로 재접근 — `/settings` 는 실제 존재하는 SPA 라우트로 권장)
4. `browser_snapshot` → URL 이 `/login` 으로 리디렉션됨 확인
5. **대체 검증** — 쿠키 만료를 직접 시뮬레이션하려면 dev 서버가 `POST /api/auth/expire-now` 를 제공하는 경우 해당 엔드포인트를 사용

**기대 결과**: 보호된 경로 접근 시 `/login` 으로 리디렉션.
