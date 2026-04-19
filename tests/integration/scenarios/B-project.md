# B. 프로젝트 라이프사이클

**범위**: 프로젝트 목록, 생성, 숨김/삭제, 대시보드 카드.
**선행 도메인**: A (로그인).

---

## B1. 프로젝트 목록 & 대시보드 카드 `[CORE] [ASYNC]`

### B-01-01: 프로젝트 리스트 렌더링
**절차**:
1. 로그인 후 `/projects` 진입
2. `browser_snapshot` 으로 ProjectCard 그리드 확인

**기대 결과**:
- 대시보드 상단 5개 카드: 프로젝트 수 / 세션 / 활성 세션 / 큐 / 터미널
- 각 카드 숫자가 실제 상태와 일치 (타 탭 · 서버 상태로 교차검증)
- 콘솔 오류 없음

**엣지케이스**:
- E1. 프로젝트 0개: "프로젝트 생성" CTA만 표시
- E2. 다수 프로젝트(50+): 스크롤 가능, 지연 없는 렌더링

### B-01-02: 대시보드 카드 실시간 업데이트
**목적**: 다른 탭에서 세션 생성 시 "세션" 카드 숫자 증가.
**절차**:
1. `browser_snapshot`으로 현재 탭 A의 "세션" 카드 숫자 기록
2. `browser_tabs(action="new")`로 탭 B 오픈 → `/projects` 진입
3. 탭 B에서 기존 프로젝트 선택 → 세션 리스트 탭 → "새 세션" 버튼 클릭 → 임의 메시지 전송
4. `browser_tabs(action="select", index=0)`로 탭 A로 복귀
5. 1초 대기 후 `browser_snapshot` → "세션" 카드 숫자가 1 이상 증가 확인

**기대 결과**: 300ms 디바운스 이후 카드 숫자 갱신 (`dashboard:status-change` 이벤트).

> `browser_tabs`로 멀티탭 시뮬레이션 가능. 복잡도를 이유로 스킵하지 말 것.

---

## B2. 프로젝트 생성 `[CORE]`

> **공통 타이밍 주의 (중요)**:
> "생성" 버튼은 `isValidating || !path.trim() || showExistingWarning` 조건 중 하나라도 true면 disabled됩니다 ([NewProjectDialog.tsx:359](../../packages/client/src/components/NewProjectDialog.tsx#L359)). 경로 입력 후 `handlePathChange`는 400ms debounce 후 `validatePath`를 호출하고, 체크박스 클릭 등 다른 액션으로 input에서 focus가 빠지면 `onBlur` 핸들러가 validation을 즉시 실행합니다. 이 validation이 진행 중이면 버튼 클릭이 무반응처럼 보입니다.
>
> **권장 대기 패턴**:
> 1. 경로 입력 직후 `browser_evaluate`로 validation 완료를 폴링:
>    ```js
>    // 버튼이 enabled가 될 때까지 대기 (validation 완료 신호)
>    browser_wait_for({ text: /* 버튼이 enabled인 스냅샷 마커 */ })
>    ```
>    또는 직접 상태 확인:
>    ```js
>    await page.evaluate(() => {
>      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '생성');
>      return !btn?.disabled;
>    });
>    ```
> 2. 위 값이 `true`가 된 뒤에 "생성" 클릭.
>
> 자동화가 validation debounce보다 빨리 클릭하면 첫 클릭이 무반응처럼 보이고 두 번째 클릭에서만 성공하는 증상이 관찰됩니다 (실제 코드 버그 아님).

### B-02-01: 일반 프로젝트 생성
**절차**:
1. "새 프로젝트" 버튼 클릭
2. 이름 `__hammoc_test_<timestamp>__`, 경로 `<tmp>/hammoc-test` 입력
3. "BMad Method 초기화" 체크박스 상태 확인 → 체크된 경우 `browser_evaluate("() => document.querySelector('input[type=checkbox]').click()")` 로 해제, **`browser_evaluate("() => document.querySelector('input[type=checkbox]').checked")`로 `false` 반환 검증 후 진행** (주의: `browser_click`으로 aria role 체크박스를 클릭하면 wrapper만 클릭되어 실제 input 값이 토글 안 될 수 있음)
4. **"생성" 버튼이 enabled가 될 때까지 대기** (위 공통 타이밍 주의 참조) — 경로 validation이 완료되어야 함
5. "생성" 클릭

**기대 결과**:
- 프로젝트 리스트에 카드 추가
- 경로 디렉토리 실제 생성 (파일 탐색기 탭에서 확인)
- 파일 탐색기에서 `.bmad-core/` 디렉토리 **없음** 확인

**엣지케이스**:
- E1. 경로 충돌 (이미 존재): 오류 표시, 생성 실패
- E2. 잘못된 경로(권한 없음): 명확한 오류 메시지

### B-02-02: BMad 옵션으로 생성
**절차**:
1. "새 프로젝트" 버튼 클릭
2. 이름 `__hammoc_test_bmad_<timestamp>__`, 경로 `<tmp>/hammoc-test-bmad` 입력
3. "BMad Method 초기화" 체크박스 상태 확인 → 체크 해제된 경우 `browser_evaluate("() => document.querySelector('input[type=checkbox]').click()")` 로 체크, **`browser_evaluate("() => document.querySelector('input[type=checkbox]').checked")`로 `true` 반환 검증 후 진행**
4. **"생성" 버튼이 enabled가 될 때까지 대기** (공통 타이밍 주의 참조) — 체크박스 클릭으로 input onBlur가 발화되어 validation이 재실행될 수 있음
5. "생성" 클릭
6. 생성된 프로젝트 → 파일 탐색기 탭 → `.bmad-core/` 디렉토리 존재 확인

**기대 결과**: `.bmad-core/` 디렉토리 생성, 프로젝트 설정에 BMad 플래그 온.

---

## B3. 프로젝트 숨김 · 삭제 `[EDGE]`

### B-03-01: 프로젝트 숨김 토글
> 숨김/해제는 완전히 되돌릴 수 있는 작업. 파괴적이지 않으므로 자동화 실행 가능.

**절차**:
1. `/projects` 페이지에서 테스트 대상 프로젝트 카드 확인
2. 카드 우측 점 메뉴(⋯) → "숨김" 클릭
3. `browser_snapshot` → 해당 카드가 리스트에서 사라짐 확인
4. "숨김 표시" 토글(상단 필터) 클릭 → 숨긴 카드 재표시 확인
5. 재표시된 카드 우측 메뉴 → "숨김 해제" 클릭 → 정상 목록으로 복귀 확인
6. 새로고침 후 `browser_snapshot` → 복귀 상태 유지 확인

**기대 결과**: 설정 파일 즉시 반영, 새로고침 후에도 유지.

### B-03-02: 프로젝트 등록 해제 (파일 보존)
> 테스트 전용 임시 프로젝트를 생성 후 해제. 원본 파일 유지 여부만 검증.

**절차**:
1. B-02-01 절차로 임시 프로젝트 `__hammoc_test_unregister_<timestamp>__` 생성 (경로: `<tmp>/hammoc-unregister-test`)
2. 생성된 프로젝트 카드 우측 메뉴 → "프로젝트 삭제" 클릭
3. 확인 모달 표시 확인:
   - 문구: "세션 데이터가 모두 삭제됩니다."
   - 체크박스: "프로젝트 파일도 함께 삭제" (기본 **해제** 상태)
   - `browser_evaluate("() => document.querySelector('[data-testid=\"delete-files-checkbox\"] input, input[type=checkbox]').checked")` → `false` 검증
4. "삭제" 버튼 클릭
5. `browser_snapshot` → 카드 제거 확인, 대시보드 프로젝트 카운트 감소 확인
6. 파일 탐색기 또는 OS에서 `<tmp>/hammoc-unregister-test` 디렉토리 **여전히 존재** 확인

**모달 구성** (현재 구현 기준):
- 문구: "세션 데이터가 모두 삭제됩니다."
- 체크박스: "프로젝트 파일도 함께 삭제" (기본 해제)
- 버튼: 취소 / 삭제

**기대 결과**:
- 프로젝트 리스트에서 카드 제거 (대시보드 카운트 감소)
- `~/.claude/projects/<slug>/` 등록 제거
- **원본 디렉토리는 유지** (체크박스 해제 시)
- 동일 경로로 재등록 가능

### B-03-02-A: 프로젝트 파일 함께 삭제 `[EDGE]` (destructive)
**절차**: B-03-02와 동일하되 "프로젝트 파일도 함께 삭제" 체크박스 **체크** 후 "삭제".

**기대 결과**:
- 프로젝트 등록 해제 + 원본 디렉토리 **전체 삭제**
- 동일 경로로 재생성 시 빈 디렉토리여야 함

**엣지케이스**:
- E1. 원본 디렉토리 내부 파일이 다른 프로세스(활성 터미널·에디터)에 의해 잠긴 경우: 삭제 실패 또는 부분 삭제 가능. UI는 실패를 사용자에게 알려야 함.
- E2. 실패 시 고아 디렉토리 정리 재시도 수단 제공 (현재 미확인).

**엣지케이스 (B-03-02 공통)**:
- E1. 활성 세션/터미널이 있는 프로젝트 삭제 시도: 경고 또는 PTY 선제 종료 필요. 현재는 경고 없이 삭제되며 PTY가 오펀화되어 디렉토리 삭제를 차단함.
