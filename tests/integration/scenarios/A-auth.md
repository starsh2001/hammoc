# A. 인증 & 초기화

**범위**: 로그인, 온보딩 체크리스트, 세션 유지·복구.
**선행 도메인**: 없음 (최초 진입).

---

## A1. 로그인 `[CORE]`

### A-01-01: 정상 비밀번호로 로그인
**목적**: 로그인 후 프로젝트 리스트로 정상 이동.
**선행 조건**: 서버 기동, 브라우저 쿠키 없음.

**절차**:
1. `browser_navigate("http://localhost:3000")`
2. `browser_snapshot` → 로그인 페이지 가시성 확인
3. `browser_type(element="password input", text="<HAMMOC_TEST_PASSWORD>")`
4. `browser_press_key("Enter")` 또는 로그인 버튼 `browser_click`

**기대 결과**:
- URL이 프로젝트 리스트 페이지로 전환
- 대시보드 상단 5개 통계 카드 가시
- 콘솔 오류 없음 (`browser_console_messages`)

**엣지케이스**:
- E1. 잘못된 비밀번호: 오류 메시지 가시, URL 유지
- E2. 초기 비밀번호 미설정 상태: 최초 설정 플로우로 진입

**증거**: `A-01-01-loggedin.png`

---

### A-01-02: 로그아웃
**목적**: 로그아웃 후 로그인 페이지로 복귀.
**절차**:
1. 설정 페이지(`/settings`) → Account 섹션 → Logout 버튼 클릭
**기대 결과**: 로그인 페이지로 이동, 이후 보호된 URL 접근 시 로그인 페이지로 리디렉션.

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
**절차**:
1. 로그인 완료 후 `browser_navigate("/projects")` (또는 F5)
2. `browser_evaluate("() => document.cookie")` 로 세션 토큰 존재 확인

**기대 결과**: 재로그인 요구 없음, 동일 페이지 유지.

### A-03-02: 토큰 만료 후 보호된 경로 접근
**절차**:
> 세션 쿠키는 httpOnly여서 JS로 직접 삭제 불가. 서버 API로 무효화.
1. 로그인 상태 확인 (`/projects` 접근 가능)
2. `browser_evaluate("() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(r => r.status)")` → 200 확인
3. `browser_navigate("/projects")` (보호된 경로 재접근)
4. `browser_snapshot` → 로그인 페이지로 리디렉션 확인 (URL이 `/login` 또는 `/`)
5. **대체 검증** — 쿠키 만료를 직접 시뮬레이션하려면 dev 서버가 `POST /api/auth/expire-now` 제공 시 해당 엔드포인트 사용

**기대 결과**: 보호된 경로 접근 시 로그인 페이지로 리디렉션.
