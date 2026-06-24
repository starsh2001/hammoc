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
- E2. 초기 비밀번호 미설정 상태: `/onboarding` 위저드로 리디렉션 (비밀번호 설정은 위저드 Password 스텝에서 처리)

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

## A2. 온보딩 위저드 `[CORE]` `[MOBILE]`

> **BS-9 리디자인**: 기존 체크리스트 기반 OnboardingPage를 다단계 위저드 (`/onboarding`)로 교체. 각 스텝은 CSS fade+translateY 애니메이션으로 전환되며, 완료 시 `UserPreferences.onboardingComplete=true`를 저장하고 홈으로 이동.

### A-02-01: 최초 사용자 전체 위저드 플로우
**목적**: 비밀번호 미설정 상태에서 위저드가 전체 스텝을 순서대로 표시하는지 검증.
**선행 조건**: 비밀번호 미설정 (`isPasswordConfigured=false`), 미인증.

**절차**:
1. `browser_navigate("<TARGET>/onboarding")` → `browser_snapshot`
2. **Display Name 스텝**: 제목("어떻게 불러드릴까요?" 류) + 텍스트 입력 + "다음" 버튼 + "건너뛰기" 버튼 가시성 확인
3. "건너뛰기" 클릭 → **Password 스텝** 전환 확인
4. **Password 스텝**: 비밀번호 + 확인 필드 (setup mode) 가시성 확인
5. 비밀번호 안전 주입 + 확인 필드 동일 값 → 제출
6. 인증 성공 → **Auth Method 스텝** 전환: "구독" / "API 키" 두 카드 가시성 확인
7. **여기서 중단** — auth step 이후 플로우는 외부 서비스(Claude OAuth) 의존으로 A-02-05에서 별도 검증

**기대 결과**:
- 스텝 전환 시 fade 애니메이션 적용 (`.wizard-step-enter` / `.wizard-step-exit` 클래스)
- 진행 표시 도트(dots)가 현재 스텝 위치 반영
- 콘솔 오류 없음

---

### A-02-02: 완전 설정 사용자 — `/onboarding` 직접 접근 시 리디렉션
**목적**: `onboardingComplete=true`인 사용자가 `/onboarding`에 접근하면 즉시 홈으로 리디렉션.
**선행 조건**: 로그인 + `onboardingComplete=true` + 프로젝트 ≥1개.

**절차**:
1. `browser_navigate("<TARGET>/onboarding")`
2. `browser_wait_for(time=2)` — 리디렉션 대기
3. 현재 URL 확인

**기대 결과**: URL이 `/`로 자동 전환. 위저드 UI 미노출.

---

### A-02-03: 부분 완료 재개 — 프로젝트 없는 인증 사용자
**목적**: 인증 완료 + Claude 계정 연결 완료했으나 프로젝트 미생성 상태에서 위저드가 First Project 스텝으로 점프.
**선행 조건**: 로그인 + `authenticated=true` (CLI 계정 있음) + 프로젝트 0개 + `onboardingComplete=false`.

**절차**:
1. `browser_navigate("<TARGET>/onboarding")`
2. `browser_snapshot` → 위저드가 First Project 스텝 직접 표시 확인 (display-name, password, auth-method 스텝 건너뜀)
3. "건너뛰기" 클릭 → Completion 스텝("준비 완료!") 표시 → 자동 홈 이동

**기대 결과**:
- 이미 완료된 스텝은 건너뛰고 첫 미완료 스텝부터 표시
- Completion 스텝 후 `onboardingComplete=true` 저장 + `/`로 이동

---

### A-02-04: AuthGuard 리디렉트 체인 검증
**목적**: AuthGuard가 사용자 상태에 따라 올바른 리디렉트를 수행하는지.
**선행 조건**: 로그인 상태에서 시작.

**절차**:
1. **onboardingComplete=false 상태**: `browser_navigate("<TARGET>/settings")` → `/onboarding`으로 리디렉션 확인
2. **onboardingComplete=true 상태**: `browser_navigate("<TARGET>/settings")` → 설정 페이지 정상 렌더 확인
3. 로그아웃 후 `browser_navigate("<TARGET>/settings")` → `/login`으로 리디렉션 확인

**기대 결과**:
- 우선순위: (1) 비밀번호 미설정 → `/onboarding`, (2) 미인증 → `/login`, (3) onboarding 미완료 → `/onboarding`, (4) 정상 → 자식 렌더

---

### A-02-05: 위저드 내 Claude 로그인 플로우 (UI) `[CORE]`
**목적**: 위저드의 Auth Method 스텝에서 "구독" 선택 시 Claude OAuth 플로우가 위저드 내에서 동작하는지 검증.
**선행 조건**: 인증 완료 (password step 통과) + `authenticated=false` (Claude 계정 미연결).

> **비파괴 원칙**: 실제 인증 코드를 제출하면 기존 자격증명이 교체된다. **코드 입력란 노출까지만 검증**하고 코드 미제출 (서버 PTY는 소켓 disconnect 시 자동 정리).

**절차**:
1. 위저드의 Auth Method 스텝에서 "구독" 카드 클릭
2. **Claude Login 스텝** 전환: 진행 표시("로그인 시작 중…") → 3개 로그인 방법 카드 렌더 확인
3. 1번(구독) 카드 클릭 → OAuth URL 링크 + "인증 페이지 열기" 버튼 가시
4. 코드 입력란 노출 확인
5. **여기서 중단**

**기대 결과**:
- 로그인 방법 카드 3개 표시
- OAuth URL이 탭 가능 링크 (모바일 접근 가능)
- 코드 입력란 표시
- 에러 시 "다시 시도" 버튼 가시
- 콘솔 오류 없음

**엣지케이스**:
- E1. 에러/타임아웃: 에러 메시지 + "다시 시도" 버튼 (페이지 리로드 없이 재시작)
- E2. Settings 페이지의 Claude 로그인은 동일 `useClaudeLogin` 훅 기반 — P-settings에서 별도 검증

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
