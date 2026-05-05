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
3. 탭 B에서 기존 프로젝트 선택 → 세션 리스트 탭 → "새 세션" 버튼 클릭 → **임의 메시지를 전송하여 응답을 받은 뒤** 다음 단계 진행 (예: `Reply only with: OK`)
4. `browser_tabs(action="select", index=0)`로 탭 A로 복귀
5. 1초 대기 후 `browser_snapshot` → "세션" 카드 숫자가 1 이상 증가 확인

**기대 결과**: 300ms 디바운스 이후 카드 숫자 갱신 (`dashboard:status-change` 이벤트).

> **주의**: 빈 세션(첫 메시지 전)은 세션 카드 집계에서 제외된다. "새 세션" 버튼만 누르고 메시지를 전송하지 않으면 카드 숫자가 변하지 않으므로 반드시 3단계에서 메시지까지 전송해 세션을 "non-empty" 상태로 만들어야 한다. 세션 리스트 탭의 "빈 세션 표시" 토글과 동일한 집계 기준.
>
> `browser_tabs`로 멀티탭 시뮬레이션 가능. 복잡도를 이유로 스킵하지 말 것.

---

## B2. 프로젝트 생성 `[CORE]`

> **UI 구조 주의**: "새 프로젝트" 다이얼로그에는 **프로젝트 경로 입력란 1개와 BMad 체크박스만** 존재한다. 별도의 "이름" 필드가 없으며, 경로의 **말단 디렉토리명이 프로젝트 이름**으로 사용된다. 따라서 고유한 테스트 프로젝트 이름은 경로 말단에 포함시켜야 한다 (예: `C:\Users\<user>\AppData\Local\Temp\__hammoc_test_B-02-01_<timestamp>__`).

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
2. 경로 입력란에 `<tmp>/__hammoc_test_<scenario-id>_<timestamp>__` 입력 (말단 디렉토리명이 프로젝트 이름 역할)
3. "BMad Method 초기화" 체크박스 상태 확인 → 체크된 경우 `browser_evaluate("() => document.querySelector('input[type=checkbox]').click()")` 로 해제, **`browser_evaluate("() => document.querySelector('input[type=checkbox]').checked")`로 `false` 반환 검증 후 진행** (주의: `browser_click`으로 aria role 체크박스를 클릭하면 wrapper만 클릭되어 실제 input 값이 토글 안 될 수 있음)
4. **"생성" 버튼이 enabled가 될 때까지 대기** (위 공통 타이밍 주의 참조) — 경로 validation이 완료되어야 함
5. "생성" 클릭 — 성공 시 `/project/<slug>` 로 자동 이동

**기대 결과**:
- `/api/projects` 응답에 새 프로젝트 포함, `isBmadProject: false`
- 경로 디렉토리 실제 생성 (OS `ls` 또는 파일 탐색기 탭에서 확인)
- 생성 직후 디렉토리 내부에 `.bmad-core/` 디렉토리 **없음** (빈 디렉토리)

**엣지케이스**:
- E1. 경로 충돌 (이미 존재): 오류 표시, 생성 실패
- E2. 잘못된 경로(권한 없음): 명확한 오류 메시지

### B-02-02: BMad 옵션으로 생성
**절차**:
1. "새 프로젝트" 버튼 클릭
2. 경로 입력란에 `<tmp>/__hammoc_test_bmad_<scenario-id>_<timestamp>__` 입력 (말단 디렉토리명이 프로젝트 이름 역할)
3. "BMad Method 초기화" 체크박스 상태 확인 → 체크 해제된 경우 `browser_evaluate("() => document.querySelector('input[type=checkbox]').click()")` 로 체크, **`browser_evaluate("() => document.querySelector('input[type=checkbox]').checked")`로 `true` 반환 검증 후 진행** (기본값은 체크 상태이므로 보통 추가 조작 불필요)
4. **"생성" 버튼이 enabled가 될 때까지 대기** (공통 타이밍 주의 참조) — 체크박스 클릭으로 input onBlur가 발화되어 validation이 재실행될 수 있음
5. "생성" 클릭 — 성공 시 `/project/<slug>` 로 자동 이동
6. BMad 초기화(파일 복사)에 수 초 소요될 수 있음. `.bmad-core/` 디렉토리가 생길 때까지 최대 10초 대기 (OS `ls` 로 폴링)

**기대 결과**:
- `/api/projects` 응답에 새 프로젝트 포함, `isBmadProject: true`
- 경로 디렉토리 내부에 `.bmad-core/` 디렉토리 존재
- `.claude/` 디렉토리도 함께 생성됨 (BMad 초기화 부산물)

---

## B3. 프로젝트 숨김 · 삭제 `[EDGE]`

### B-03-01: 프로젝트 숨김 토글
> 숨김/해제는 완전히 되돌릴 수 있는 작업. 파괴적이지 않으므로 자동화 실행 가능.

**절차**:
1. `/projects` 페이지에서 테스트 대상 프로젝트 카드 확인
2. 카드 우측 점 메뉴(⋯) → **"숨기기"** 클릭
3. `browser_snapshot` → 해당 카드가 리스트에서 사라짐 확인. 상단 필터 버튼의 aria-label `숨긴 항목 보기 (N)` 카운터가 +1 되는지 같이 확인
4. 상단 우측 **`숨긴 항목 보기 (N)` 토글** (눈 아이콘 버튼) 클릭 → 숨긴 카드가 같은 리스트에 함께 표시되는지 확인
5. 재표시된 카드 우측 메뉴 → **"숨김 해제"** 클릭 → 정상 목록으로 복귀, `숨긴 항목 보기` 카운터 원복 확인
6. 새로고침 후 다시 스냅샷 → 복귀 상태 유지 확인

**기대 결과**: 설정 파일 즉시 반영, 새로고침 후에도 유지.

> **DOM 구조 주의**: 프로젝트 카드는 `<button>` 태그가 아니라 `<div role="button" aria-label="프로젝트: <name>, ...">` 형태다. 카드 내부 "프로젝트 메뉴"(⋯) 버튼은 `<button aria-label="프로젝트 메뉴">`. 자동화 시 `button` 태그만 쿼리하면 카드를 놓치므로 `[role="button"][aria-label^="프로젝트:"]` 조합으로 접근할 것.

### B-03-02: 프로젝트 등록 해제 (파일 보존)
> 테스트 전용 임시 프로젝트를 생성 후 해제. 원본 파일 유지 여부만 검증.

**절차**:
1. B-02-01 절차로 임시 프로젝트 생성 (경로: `<tmp>/__hammoc_test_unregister_<timestamp>__`)
2. 생성된 프로젝트 카드 우측 메뉴 → "프로젝트 삭제" 클릭
3. 확인 모달 표시 확인:
   - 문구: "세션 데이터가 모두 삭제됩니다."
   - 체크박스: "프로젝트 파일도 함께 삭제" (기본 **해제** 상태)
   - `browser_evaluate("() => document.querySelector('[role=\"dialog\"] input[type=checkbox]').checked")` → `false` 검증
4. "삭제" 버튼 클릭
5. `/api/projects` 재조회 → 해당 경로의 프로젝트가 리스트에서 제거되었는지 확인 (대시보드 프로젝트 카운트 감소도 함께 검증)
6. OS `ls <tmp>/__hammoc_test_unregister_<timestamp>__` → 디렉토리 **여전히 존재** 확인

**모달 구성** (현재 구현 기준):
- 문구: "세션 데이터가 모두 삭제됩니다."
- 체크박스: "프로젝트 파일도 함께 삭제" (기본 해제)
- 버튼: 취소 / 삭제

**기대 결과**:
- 프로젝트 리스트에서 카드 제거 (대시보드 카운트 감소)
- `~/.claude/projects/<slug>/` 등록 제거
- **원본 디렉토리는 유지** (체크박스 해제 시)
- 디렉토리 내부에는 Hammoc이 생성한 `.hammoc/` 메타데이터 서브디렉토리가 남을 수 있음 (결함 아님) — 시나리오는 "원본 디렉토리 보존"만 요구하며 내부 클린업은 요구하지 않는다
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

---

## B4. 프로젝트 설정 탭 `[CORE]`

**범위**: 프로젝트 페이지 내부 "설정" 탭 (`/project/<slug>/settings`). 모델 오버라이드 · Permission Mode 오버라이드 · 사이드바 숨김 토글 · 전역 기본값 초기화.

> **이관 이력 (2026-04-22)**: 이 기능은 이전까지 **전역 설정 페이지** 의 "프로젝트 설정" 섹션 (`/settings/project`) 에 있었고 드롭다운으로 편집 대상 프로젝트를 고르는 방식이었다. 프로젝트 페이지 탭으로 이관되면서 URL 의 `projectSlug` 가 편집 대상을 고정하고 드롭다운이 제거됐다. 전역 설정 페이지에는 더 이상 프로젝트 섹션이 없다 — 옛 시나리오가 `/settings/project` 를 열려고 하면 존재하지 않는 탭이다.

### B-04-01: 프로젝트 설정 탭 진입 & 오버라이드 변경

> **탭 바 스크롤 동작**: 탭 바는 가로 `overflow-x-auto` 로 동작하고 스크롤바는 시각적으로 숨겨져 있다. 좁은 뷰포트(모바일 / 사이드 패널 뷰)에서는 설정 탭이 화면 우측 밖에 있을 수 있으므로 **좌측으로 스와이프 / 가로 스크롤**하여 드러내야 한다. 활성 탭이 보이지 않는 위치로 바뀌면 `scrollIntoView` 로 자동 정렬된다 — URL 로 `/project/<slug>/settings` 를 직접 열면 설정 탭이 자동으로 보이도록 스크롤된다.
>
> **엣지 페이드 인디케이터**: 탭 바가 한쪽 방향으로 더 스크롤 가능하면 그 끝에 헤더 배경색에서 투명색으로 전환되는 그라데이션이 표시된다 — 스크롤 위치에 따라 좌/우 각각 독립적으로 on/off 된다 (왼쪽 끝이면 우측 페이드만, 우측 끝이면 좌측 페이드만, 중간이면 양쪽). 검증하려면 `browser_evaluate` 로 탭 바 컨테이너의 `scrollLeft`, `scrollWidth`, `clientWidth` 를 읽어 그라데이션 DOM 존재 여부와 일치하는지 확인.

**절차**:
1. 임의의 기존 프로젝트를 열어 `/project/<slug>` 진입
2. 탭 바 맨 오른쪽의 "프로젝트 설정" 탭 클릭 — URL 이 `/project/<slug>/settings` 로 변경되는지 확인 (탭 아이콘은 `FolderCog`). 좁은 화면에선 탭 바 가로 스크롤이 필요할 수 있음
3. `browser_evaluate` 로 `GET /api/projects/<slug>/settings` 가 한 번 호출됐는지 네트워크 로그 확인 (또는 화면에 "모델 오버라이드" / "Permission Mode 오버라이드" 섹션이 노출되면 fetch 성공으로 판정)
4. "모델 오버라이드" select 에서 현재 전역 모델과 다른 값 선택 (예: 전역이 sonnet 이면 opus)
   ```js
   const select = document.getElementById('project-model');
   const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
   setter.call(select, 'claude-opus-4-7');
   select.dispatchEvent(new Event('change', { bubbles: true }));
   ```
5. 1초 대기 후 토스트 "설정이 저장되었습니다." 노출 및 `(프로젝트 오버라이드)` 인디케이터가 해당 필드 옆에 표시되는지 확인
6. `GET /api/projects/<slug>/settings` 재호출 (페이지 새로고침 또는 직접 fetch) → `modelOverride: 'claude-opus-4-7'`, `_overrides` 에 `modelOverride` 포함 여부 확인

**기대 결과**:
- PATCH `/api/projects/<slug>/settings` 가 `{ modelOverride: 'claude-opus-4-7' }` 바디로 호출됨
- 서버 응답에서 `_overrides` 에 `modelOverride` 포함
- 새 세션을 이 프로젝트에서 시작하면 SDK 호출에 해당 모델이 사용됨 (E 도메인과 교차검증 가능)
- 종료 시 select 를 "전역 기본값 사용" 으로 되돌려 오버라이드 해제

**엣지케이스**:
- E1. Permission Mode 라디오 (globally / plan / default / acceptEdits) 도 동일 경로로 작동 — `projectPermissionMode` name 의 `input[type=radio]` 를 클릭하면 해당 값으로 PATCH
- E2. "사이드바에서 숨기기" 체크박스 토글은 프로젝트 리스트 카드 상태와 즉시 동기화 (B-03-01 의 카드 메뉴 "숨기기" 와 동일 결과 — 토글 후 `/projects` 로 복귀해 카운터 확인)

### B-04-02: 전역 기본값으로 초기화
**선행 조건**: B-04-01 의 4단계를 수행해 최소 한 개의 오버라이드가 존재하거나, 별도로 modelOverride / permissionModeOverride 중 하나를 세팅해 둔다.

**절차**:
1. 설정 탭 하단의 "전역 기본값으로 초기화" 버튼이 enabled 상태인지 확인 (오버라이드가 있을 때만 활성)
2. 버튼 클릭 → `window.confirm` 모달 발생. `browser_handle_dialog(accept=true)` 로 승인
3. 토스트 "전역 설정으로 초기화되었습니다" 확인
4. 화면의 모델 select 가 "전역 기본값 사용 (현재: ...)" 로 되돌아가고 `(프로젝트 오버라이드)` 인디케이터가 사라졌는지 확인
5. `GET /api/projects/<slug>/settings` 재호출 → `_overrides: []`, `modelOverride / permissionModeOverride` 필드가 `undefined`, `hidden: false`

**기대 결과**:
- PATCH `/api/projects/<slug>/settings` 가 `{ modelOverride: null, permissionModeOverride: null, hidden: false }` 로 호출됨
- 재조회 시 `_overrides` 가 빈 배열
- 버튼이 다시 disabled 상태로 전환되고 하단에 "현재 프로젝트 오버라이드가 없습니다." 안내 문구 표시

**엣지케이스**:
- E1. 확인 모달에서 `accept=false` (취소) 시 어떤 API 호출도 발생하지 않아야 함 — 단일 `PATCH` 요청 카운터로 검증

---

## B5. 하네스 파일 API · 외부 변경 이벤트 · YAML/JSONC 라운드트립 `[CORE]`

**범위**: Story 28.0.5 가 추가한 서버 선행 인프라(`/api/harness/*` · `harness:subscribe/unsubscribe` · `harness:external-change`). UI 를 거치지 않고 **REST + WebSocket 계약 자체**를 검증한다. 후속 스토리(28.1·28.2·28.3·28.4·28.5·28.6)가 이 계약을 신뢰하며 UI 를 구축할 수 있도록 하는 인프라 스모크.

### B-05-01: 프로젝트 스코프 하네스 API 정상 경로

**전제**: 테스트 프로젝트가 생성되어 있고, `.claude/` 디렉토리가 존재한다(없다면 첫 단계에서 `ensureDir` 로 생성).

**절차**:
1. `PUT /api/harness/write?scope=project&projectSlug=<slug>&path=skills/test.md` body `{ "content": "# test" }` → 200 `{ success: true, size, mtime }`
2. `GET /api/harness/list?scope=project&projectSlug=<slug>&path=skills` → `entries` 에 `test.md` 포함, `modifiedAt` 은 ISO 8601
3. `GET /api/harness/read?scope=project&projectSlug=<slug>&path=skills/test.md` → `content === "# test"`, `isBinary: false`, `isTruncated: false`, `mtime` 값 기록

**기대 결과**:
- 응답 스키마가 `HarnessListResponse` · `HarnessReadResponse` · `HarnessWriteResponse` 를 정확히 충족
- `resolvedRoot` 가 `<projectRoot>/.claude` 의 절대 경로

### B-05-02: ETag/mtime 충돌 감지 (AC5)

**절차**:
1. 기존 `skills/test.md` 의 mtime 을 기록해 두고, 파일시스템에서 임의로 내용을 바꿔 mtime 을 갱신 (예: `fs.writeFile(path, 'external edit')`)
2. 옛 mtime 을 `expectedMtime` 으로 붙여 `PUT /api/harness/write` 재호출

**기대 결과**:
- HTTP **409** 응답
- 바디 envelope: `{ "error": { "code": "HARNESS_STALE_WRITE", "message": ..., "details": { "currentMtime": "<ISO 8601>" } } }`
- `details.currentMtime` 값이 실제 on-disk mtime 과 일치 (클라이언트가 reload/덮어쓰기 UX 를 트리거할 수 있는 근거)

### B-05-03: path traversal 차단 (AC1)

**절차**:
- `GET /api/harness/list?scope=project&projectSlug=<slug>&path=../../etc`

**기대 결과**:
- HTTP **403** 응답
- 바디 envelope: `{ "error": { "code": "HARNESS_PATH_DENIED", "message": ... } }` — `details` 는 없어도 됨

### B-05-04: YAML 라운드트립 — 주석 유지 (AC4)

**절차**:
1. `PUT /api/harness/write` 로 다음 YAML 을 저장:
   ```yaml
   # keep me
   name: old
   ```
2. `POST /api/harness/patch-structured?...&path=<같은 경로>` body `{ "format": "yaml", "ops": [{ "path": ["name"], "value": "new" }] }` → 200
3. `GET /api/harness/read` 로 재조회

**기대 결과**:
- `content` 에 `# keep me` 주석이 그대로 남아있고, `name: new` 로 바뀌어 있음

### B-05-05: 외부 변경 WebSocket 이벤트 (AC3)

**절차**:
1. 소켓 연결 후 `emit('harness:subscribe', { scope: 'project', projectSlug: '<slug>' })`
2. `.claude/skills/watcher-demo.md` 를 서버 외부(터미널 / 별도 프로세스) 에서 생성
3. 이벤트 수신 대기 (chokidar 안정화 + 이벤트 루프 여유 감안해 최소 **500ms**, 최대 1s)

**기대 결과**:
- `harness:external-change` 이벤트 수신, 페이로드 `{ scope: 'project', projectSlug, path: 'skills/watcher-demo.md', type: 'created', mtime: '<ISO 8601>' }`
- 자체 저장(`PUT /api/harness/write`) 경로에서는 동일 경로에 대해 이벤트가 발생하지 않아야 함 (self-write suppression)

**엣지케이스**:
- E1. `scope=user` 로 호출해도 동일한 스키마 (AC2) — `~/.claude` 가 테스트 환경에 존재하지 않으면 `list` 가 빈 배열로 응답해야 함 (404 금지)
- E2. `patch-structured` 에 깨진 YAML 을 넣으면 422 `HARNESS_PARSE_ERROR` — 원본 파일은 보존되어 있어야 함

## B6. 하네스 플러그인 조회 · 활성 토글 `[CORE] [EDGE]`

### B-06-01: 플러그인 목록 조회 정상 경로 (AC1)

**절차**:
1. `~/.claude/plugins/installed_plugins.json` 에 실측 포맷 (`{ version: 2, plugins: { "context7@claude-plugins-official": [{ scope:"user", ... }] } }`) 으로 1개 이상의 엔트리 준비
2. 같은 번들 디렉토리에 `.claude-plugin/plugin.json` (manifest) · `skills/*/SKILL.md` · `commands/*.md` 등을 배치
3. `GET /api/harness/plugins` 호출

**기대 결과**:
- 200 응답 + `HarnessPluginListResponse` 스키마
- `cards[]` 의 각 카드가 번들 내부 실제 개수와 일치하는 `componentCounts` 를 가진다
- `enabledPluginsFormat` 값이 실제 `settings.json.enabledPlugins` 의 형태(`array` / `object`)와 일치
- `currentProjectPath` 는 쿼리로 `projectSlug` 를 넘겼을 때만 세팅되고, slug 해석 실패 시 `undefined`

### B-06-02: 포맷 양립 파싱 (AC1) `[EDGE]`

**절차**:
1. `settings.json` 에 `enabledPlugins: ["foo@market"]` (배열) 로 설정 → `GET /api/harness/plugins`
2. 같은 파일을 `enabledPlugins: { "foo@market": true }` (객체) 로 바꾸고 다시 조회
3. `enabledPlugins` 필드 자체를 제거한 상태로 한 번 더 조회

**기대 결과**:
- 각각 `enabledPluginsFormat` 이 `array` / `object` / `object`(기본값)
- 세 케이스 모두 200 응답 + cards 배열에 설치된 플러그인 카드가 그대로 노출

### B-06-03: 토글 성공 + 배너 (AC2)

**절차**:
1. 프로젝트 설정 탭 → "하네스 워크벤치" → "플러그인" 서브 섹션 진입
2. 아무 카드의 토글을 On 으로 클릭

**기대 결과**:
- 네트워크 패널에 `POST /api/harness/plugins/toggle` 요청 + 200 응답 (`{ success:true, mtime, appliedFormat }`)
- 응답 이후 상단에 배너 렌더링(`role=status`), 메시지 키: `harness.plugin.banner.freshSpawn`
- 배너의 "새 세션 시작" 버튼 클릭 시 `/project/<slug>/session/<uuid>` 경로로 네비게이션 발생
- 배너는 유저가 ✕ 로 dismiss 할 때까지 상주 (추가 토글이 있어도 중복 배너 표시 금지)

### B-06-04: scope=project 게이팅 (AC3)

**절차**:
1. `installed_plugins.json` 의 엔트리 중 하나를 `scope: "project"`, `projectPath: "D:/other"` 로 설정
2. 현재 프로젝트 경로가 `C:/project` 인 상태에서 "플러그인" 패널 진입

**기대 결과**:
- 해당 카드의 토글이 `disabled` 상태로 렌더링
- 카드 label 의 `title` 속성(툴팁) 이 `harness.plugin.projectScopeDisabled` 키의 번역 문자열과 일치
- 클릭해도 API 요청이 발생하지 않음 (네트워크 패널에 `POST /toggle` 없음)
- 반대로 `projectPath` 가 현재 프로젝트와 일치하면 토글 가능

### B-06-05: STALE_WRITE 낙관적 동시성 (AC2) `[EDGE]`

**절차**:
1. 패널을 열어 카드 리스트를 로드(초기 `settingsMtime` 확보)
2. 외부에서 `~/.claude/settings.json` 을 수정해 mtime 을 바꿈
3. 같은 탭에서 토글 클릭

**기대 결과**:
- `POST /api/harness/plugins/toggle` 가 409 + envelope `{ error: { code: "HARNESS_STALE_WRITE", message, details: { currentMtime } } }`
- 스토어가 자동으로 `GET /api/harness/plugins` 재호출 → 카드 상태가 디스크 최신 상태에 맞춰 복구
- 유저에게 "외부 변경 감지" 류의 통지가 한 번 표시 (에러 상태가 세팅됨)


## B-07: 하네스 스킬 섹션 (Story 28.2)

> **선행 조건**: Story 28.0.5 (`harnessService` · `harness:external-change`) 와 Story 28.1 (플러그인 catalog) 이 적용된 환경. 시나리오 5건 모두 `[CORE]` — 28.2 는 SDK 의존이 없다.

### B-07-01: 카드 리스트 렌더 + 출처 배지 정확성 (AC1) `[CORE]`

**절차**:
1. 프로젝트 설정 → "하네스 워크벤치" 탭 → 좌측 네비에서 "스킬" 선택
2. `<projectRoot>/.claude/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md`, 그리고 설치된 플러그인 번들의 `<installPath>/skills/<name>/SKILL.md` 가 모두 존재하는 동일 이름 스킬을 미리 준비
3. 카드 리스트가 로드된 직후의 카드 1장을 관찰

**기대 결과**:
- 카드 1장에 출처 배지가 3개(`프로젝트 / 전역 / 플러그인: <key>`) 표시되며, 활성 출처(`프로젝트`) 만 진하게 / 가려진 두 출처는 흐리게(opacity-50) 렌더
- 가려진 출처에 마우스 호버 시 "<프로젝트> 가 적용되어 <전역|플러그인> 는 가려짐" 류 툴팁이 표시
- 카드에는 번들 카운트 배지가 표시되지 않는다 (성능 최적화로 list 응답에서 제외 — 번들 파일 정보는 카드 클릭 시 열리는 SkillEditor 모달에서만 노출)

### B-07-02: frontmatter 폼 편집 → 디스크 round-trip 보존 (AC2) `[CORE]`

**절차**:
1. 임의의 user-scope 스킬을 선택해 카드 클릭 → SkillEditor 모달 진입
2. `description` 필드를 비웠다가 다시 채움 → 비었을 때 빨간 인라인 에러 + 저장 비활성, 채우면 에러 해제
3. `description` 의 끝에 임의 텍스트 추가 → 입력 종료 후 약 300ms 뒤 자동 저장 토스트 (또는 "Saving…" 인디케이터 사라짐)
4. 외부 파일 시스템에서 SKILL.md 를 직접 열어 frontmatter 영역의 주석 / 빈 줄 / 키 순서가 보존됐는지 확인

**기대 결과**:
- 폼 입력은 디스크에 `harnessService.patchStructured` (YAML round-trip) 로 반영되어 주석 · 인용 스타일이 깨지지 않음
- 본문(body) 영역은 그대로 유지
- `name` 또는 `description` 가 빈 상태에서는 PUT 요청이 발생하지 않음

### B-07-03: 본문 markdown 에디터 + 미리보기 토글 (AC3) `[CORE]`

**절차**:
1. SkillEditor 의 본문 영역에서 markdown 텍스트를 편집
2. "Preview" 토글 클릭 → 동일 모달 안에서 MarkdownRenderer 가 그 텍스트를 렌더
3. "Edit" 토글로 돌아온 뒤 추가 편집 → 약 300ms 후 자동 저장

**기대 결과**:
- 편집 중에는 CodeMirror 6 markdown 모드가 표시
- 미리보기에서는 코드블록 / 헤딩 / 리스트 등이 정상 렌더 (이미지 상대경로는 `projectSlug` + `basePath` props 로 해석)
- 저장 후 디스크의 SKILL.md 본문이 새 텍스트로 교체되고 frontmatter 블록(`---`...`---`) 은 그대로 유지

### B-07-04: 폴더 단위 카피 + 동일 이름 충돌 3-way 모달 (AC4) `[CORE]`

**절차**:
1. user-scope 카드 우상단 `⋮` 메뉴에서 "프로젝트로 가져오기 ←" 클릭 → 충돌 모달 자동 노출
2. `덮어쓰기` / `스킵` / `이름 변경` 3-way 라디오 중 `이름 변경` 선택 → 신규 이름 입력 텍스트박스 노출
3. 빈 이름 / 동일 이름 / `inva|lid` 등 OS 예약문자 포함 이름 입력 시 인라인 에러 + 제출 비활성
4. 유효한 새 이름 입력 → "계속" 클릭 → POST `/api/harness/skills/copy` 가 200 으로 끝나고 카드 리스트가 즉시 갱신

**기대 결과**:
- 카피 성공 시 토스트 또는 인라인 안내가 한 번 노출
- 카드 리스트가 새 카드를 즉시 포함 (스토어가 `load()` 재호출)
- `이름 변경` 모드에서 대상도 충돌하면 409 `HARNESS_SKILL_NAME_CONFLICT` 응답이 와서 `harness.skill.copy.conflict.renameInvalid` 류 안내가 다시 모달에 표시

### B-07-05: 플러그인 출처 읽기 전용 + 오버라이드로 복제 (AC2, AC4) `[CORE]`

**절차**:
1. 플러그인 출처가 활성인 카드(`scope:plugin` 만 존재) 를 SkillEditor 로 연다
2. frontmatter 폼 / 본문 / Raw 토글이 모두 비활성(disabled) 인지 확인
3. 카드 `⋮` 메뉴의 "오버라이드로 복제 (프로젝트)" 또는 "(전역)" 클릭 → 충돌 모달 → `이름 변경` 으로 새 이름 부여 후 제출
4. 카드 리스트가 새 출처(프로젝트 또는 전역) 를 포함하도록 갱신되며 우선순위(프로젝트 > 전역 > 플러그인) 에 따라 활성 출처가 자동 전환

**기대 결과**:
- 플러그인 출처에 대한 PUT 요청은 항상 403 `HARNESS_FORBIDDEN`
- 오버라이드 복제 후 동일 이름 카드의 활성 출처가 더 높은 우선순위 스코프로 자동 전환되어 표시

---

## B-08: 하네스 MCP 섹션 (Story 28.3)

### B-08-01: 카드 리스트 + 출처/타입 배지 정확성 (AC1) `[CORE]`

**절차**:
1. 프로젝트의 `<projectRoot>/.mcp.json` 에 stdio · sse · http · ws 4 종 type 의 서버 4개를 등록 (한 항목은 type 키 자체를 생략하고 `command`/`args` 만 두어 stdio default 검증)
2. 전역 `~/.claude/.mcp.json` 에 같은 이름의 서버 1개 추가하여 우선순위(프로젝트 > 전역) 검증용 케이스를 만듦
3. 설정 → 하네스 워크벤치 → "MCP" 좌측 nav 클릭

**기대 결과**:
- 4개 type 카드가 모두 노출되며 `stdio` / `sse` / `http` / `ws` 배지가 각각 정확히 표시됨
- type 생략 엔트리는 `stdio` 배지로 표시
- 같은 이름 카드는 1장으로 묶이고 `프로젝트(기본)` 배지만 진하게, `전역(기본)` 배지는 흐리게 + 호버 툴팁
- 응답 `userFileKind: 'mcp.json'` / `disableStrategy: 'backup'` 가 store 에 들어가 빈 상태/토글 라벨에 일관되게 사용됨

### B-08-02: stdio 신규 서버 생성 + 새 세션에서 도구 노출 `[CORE] [SDK]`

**절차**:
1. McpEditor 모달의 Type 드롭다운을 `stdio` 로 두고 `command`= `node`, `args`= `index.js` 입력
2. 300ms debounce 가 지나 PUT `/api/harness/mcps/:name` 가 200 으로 끝나는지 확인
3. 새 채팅 세션 시작 (Story 28.1 spike A 결과로 fresh-spawn 라우팅 확정) → 응답에서 등록한 mcp 도구가 노출되는지 SDK 응답으로 확인

**기대 결과**:
- 디스크의 `mcpServers.<name>` 객체가 새 값으로 round-trip 보존되어 저장 (주석 · 키 순서 유지)
- 새 세션에서 SDK 가 새로운 MCP 서버를 인식하고 도구가 노출됨

### B-08-03: 양방향 카피 + 시크릿 모달 + 동일 이름 충돌 3-way `[CORE]`

**절차**:
1. user-scope 카드 우상단 `⋮` 메뉴에서 "프로젝트로 가져오기 ←" 클릭
2. 소스 객체의 `headers.Authorization` 에 평문 `Bearer ghp_...` 가 있어 시크릿 휴리스틱이 매치되면 1차로 시크릿 확인 모달이 노출됨
3. 모달에서 체크박스 동의 → "시크릿 포함하여 복사" → 다음 단계로 동일 이름 충돌 모달이 자동 노출
4. `이름 변경` 라디오 → 새 이름 입력 → "계속" → POST `/api/harness/mcps/copy` 가 200 으로 종료되고 카드 리스트가 즉시 갱신

**기대 결과**:
- 시크릿 미동의 상태로 직접 POST 시 서버는 403 `HARNESS_FORBIDDEN` (`details.cause: 'secret-not-acknowledged'`) 으로 거부
- `${TOKEN}` 같은 환경변수 참조는 시크릿 휴리스틱에서 제외되므로 모달 미노출
- 카피 후 디스크의 환경변수 참조 토큰 (`Bearer ${GH_TOKEN}` 등) 이 평문으로 치환되지 않고 원문 보존

### B-08-04: 활성/비활성 토글 (Spike A 결과 — 백업 파일 이동) `[CORE]`

**절차**:
1. 활성 user-scope 카드의 토글 버튼 클릭 → PUT `/api/harness/mcps/:name` `{enabled: false}` 호출
2. 디스크에서 `~/.claude/.mcp.json` 의 해당 서버 객체가 사라지고 `~/.claude/mcp.disabled.json` 의 `mcpServers.<name>` 으로 이동했는지 확인
3. 카드는 그대로 표시되며 `disabled` 라벨 + `disabledByBackup` 마커가 노출
4. 다시 토글 → 백업에서 main 으로 되돌아오고 `enabled` 상태 복원

**기대 결과**:
- 토글 결과 배너 `harness.mcp.banner.freshSpawn` ("새 세션부터 적용됩니다") 와 "새 세션 시작" CTA 가 노출 (28.1 spike A 답습)
- 두 파일 patch 가 트랜잭션으로 묶여 부분 실패 시 첫 단계가 롤백됨 (단위 테스트 회귀 보호)

### B-08-05: type 전환 시 confirm 모달 + 필수 필드 실시간 검증 `[SDK]`

**절차**:
1. stdio 서버의 McpEditor 에서 Type 드롭다운을 `sse` 로 변경 시도
2. 기존 `command`/`args` 가 새 type 에서 무효화되므로 confirm 모달 ("이 type 으로 바꾸면 …가 제거됩니다") 노출
3. "계속" 클릭 → 폼이 sse 모드로 전환되고 `url` 필드가 비어 있어 인라인 에러 + 저장 비활성
4. `url` 입력 → debounce 후 PUT 200, 디스크의 객체가 `{type:"sse",url:...}` 로 교체됨

**기대 결과**:
- `command` / `args` / `url` / `headers` 의 type 별 인라인 에러가 100ms 안에 표시
- type 전환 confirm 을 취소하면 원래 type 으로 복구되며 디스크는 변경 없음
- Raw 모드에서 JSON 파싱 실패 시 폼 모드 토글이 비활성화되고 상단 배너가 안내

---

## B9. 하네스 Hook 섹션 (Story 28.4) `[SDK] [EDGE]`

설정 → 하네스 워크벤치 → "Hooks" 좌측 네비를 통해 9개 Claude Code 이벤트 (`PreToolUse` · `PostToolUse` · `Stop` · `SubagentStop` · `SessionStart` · `SessionEnd` · `UserPromptSubmit` · `PreCompact` · `Notification`) 의 훅을 한 화면에서 조회·편집·복사·활성토글 한다. 출처는 프로젝트 `<projectRoot>/.claude/settings.json`, 전역 `~/.claude/settings.json`, 그리고 모든 설치된 플러그인 번들의 `<installPath>/hooks/hooks.json` 세 곳을 모두 스캔하며 플러그인 카드는 읽기 전용이다.

### B-09-01: 9개 이벤트 카드 리스트 + 출처 배지 + matcher 미리보기 `[SDK]`

**절차**:
1. "하네스 Hooks" 패널 진입 → GET `/api/harness/hooks?projectSlug=<slug>` 호출
2. 응답의 `cardsByEvent` 9개 키가 모두 존재하는지 확인 (등록된 훅이 없으면 빈 배열)
3. 사전 시드된 프로젝트·전역·플러그인 훅 (각 1개씩, 같은 PreToolUse 이벤트) 이 카드 리스트에 노출되는지 확인
4. 각 카드에 출처 배지 (프로젝트 / 전역 / 플러그인:<key>) + 타입 배지 (command / prompt) + matcher 미리보기 (mono-text, 빈 matcher 는 "(모든 호출에 매치)" 라벨) 가 표시됨

**기대 결과**:
- 9개 이벤트 섹션이 항상 표시되고, 빈 이벤트는 "+ 추가" CTA 가 노출
- 같은 이벤트에 여러 출처의 훅이 있으면 `parallelExecutionBadge` 안내 배지가 모든 카드에 표시됨 (병렬 실행 안내)
- 플러그인 카드는 토글 자리에 "🔒 읽기 전용" 마커, 카피 메뉴에는 "오버라이드로 복제 (프로젝트)" / "오버라이드로 복제 (전역)" 두 항목만 노출

### B-09-02: command 타입 훅 신규 생성 → 새 세션에서 실행 확인 `[SDK]`

**절차**:
1. PreToolUse 섹션 헤더의 "+ 추가" 클릭 → HookEditor 모달이 create 모드로 열림
2. matcher = `Bash`, type = `command`, command = `echo '{"hookSpecificOutput":{"permissionDecision":"deny","systemMessage":"blocked"}}'` 입력 후 "훅 생성" 클릭
3. POST `/api/harness/hooks` 200 → `<projectRoot>/.claude/settings.json` 의 `hooks.PreToolUse` 배열에 새 matcher 그룹이 append 됨
4. `harness.hook.banner.freshSpawn` 배너 + "새 세션 시작" CTA 노출
5. CTA 클릭 → 새 세션이 열리고, 채팅에서 Bash 도구 호출 시 hook 이 실행되어 거부 결정이 반영되는지 확인

**기대 결과**:
- 28.1 spike A 의 fresh-spawn 모델: settings.json 변경은 다음 user 메시지부터 SDK 에 반영됨
- 디스크의 JSON 이 jsonc-parser 의 modify 로 patch 되어 주석·키 순서·트레일링 콤마가 보존됨

### B-09-03: 양방향 카피 + 타입별 경고 모달 + 동일 좌표 충돌 모달 `[SDK]`

**절차**:
1. 프로젝트 카드의 ⋮ → "전역으로 복사 →" 클릭
2. (1차) 타입 경고 모달 노출 — `command` 타입 문구 ("이 훅은 임의 셸 명령을 실행합니다…") + 본문 마스킹 없는 미리보기 + 확인 체크박스
3. 체크박스 + "복사" 클릭 → (2차) 동일 좌표 충돌 모달 (대상 스코프에 같은 matcher+본문이 이미 있을 때만)
4. `덮어쓰기` / `스킵` / `중복 추가` 3-way 라디오 중 `중복 추가` 선택 → POST `/api/harness/hooks/copy` 200 with `acknowledgedWarning:true, onConflict:'duplicate'`
5. 전역 settings.json 의 `hooks.<event>` 에 새 matcher 그룹이 append 됨

**기대 결과**:
- 타입 경고 모달은 모든 카피에서 필수 (acknowledgedWarning=false 시 서버가 `HARNESS_FORBIDDEN.cause:'type-warning-not-acknowledged'` 로 거부)
- prompt 타입은 "LLM 비용 발생" 문구 + 시크릿 휴리스틱 매치 시 시크릿 라벨 추가
- duplicate 시 토스트 "중복 추가됨 — 두 훅이 모두 병렬 실행됩니다" 안내

### B-09-04: 활성/비활성 토글 + 백업 파일 우회 트랜잭션 + STALE_WRITE 인버스 op `[EDGE]`

**절차**:
1. 활성 user-scope 카드의 토글 버튼 클릭 → PUT `/api/harness/hooks/:event/:gi/:hi` `{enabled: false, expectedMtime, expectedBackupMtime}` 호출
2. 디스크에서 `~/.claude/settings.json` 의 해당 hook 객체가 사라지고 `~/.claude/hooks.disabled.json` 의 `hooks.<event>` 에 새 matcher 그룹으로 이동
3. 카드의 `disabledByBackup` 마커가 노출되고 토글이 OFF 상태로 표시
4. 다시 토글 → 백업에서 main 으로 되돌아옴
5. 외부에서 settings.json 을 수정해 mtime 충돌 → 토글 시 STALE_WRITE 409 + `details.staleFile: 'main'` 응답, 백업 추가가 인버스 op 로 롤백됨

**기대 결과**:
- 두 파일 patch 가 트랜잭션으로 묶여 부분 실패 시 첫 단계가 롤백됨 (단위 테스트 회귀 보호)
- `details.staleFile` 이 어느 파일이 충돌했는지 명시 — 클라이언트가 적절한 staleBanner i18n 키로 분기
- 그룹의 hooks[] 가 비면 그룹 자체도 자동 제거되어 빈 그룹이 남지 않음

### B-09-05: matcher 정규식 무효 처리 + PreToolUse 결정 빌더 + 빠른 템플릿 `[SDK]`

**절차**:
1. 프로젝트 PreToolUse + command 카드의 HookEditor 진입
2. matcher 입력란에 `(unclosed` 입력 → 100ms 디바운스 후 인라인 에러 ("matcher 가 정규식으로 파싱되지 않습니다") 노출 + 저장 비활성
3. matcher 를 `Write|Edit` 로 정정 → 에러 사라지고 저장 가능
4. PreToolUse 결정 빌더 panel 펼치기 → `decision: deny` 라디오 + systemMessage 입력 + insert mode `replace` → "폼에서 셸 스니펫 생성" 클릭
5. 본문이 `echo '{"hookSpecificOutput":{"permissionDecision":"deny","systemMessage":"…"}}'` 로 교체되고 panel 자동 collapse
6. "허용" 빠른 템플릿 클릭 → 본문이 `echo '{"hookSpecificOutput":{"permissionDecision":"allow"}}'` + 기존 본문으로 prepend

**기대 결과**:
- matcher 검증은 `new RegExp()` 만 사용 (false-negative 허용 — CLI 실측 정합성은 후속 spike 또는 Epic 31 범위)
- 결정 빌더의 `updatedInput` JSON 도 100ms 안에 파싱 시도하며 실패 시 generate 버튼 비활성화
- PreToolUse 외 이벤트로 변경하면 결정 빌더 panel 이 자동으로 사라짐

---

## B10. 하네스 슬래시 커맨드 섹션 (Story 28.5) `[CORE]`

설정 → 하네스 워크벤치 → "Commands" 좌측 네비를 통해 프로젝트 `<projectRoot>/.claude/commands/**/*.md`, 전역 `~/.claude/commands/**/*.md`, 그리고 모든 설치된 플러그인 번들의 `<installPath>/commands/**/*.md` 를 한 트리에서 조회·편집·복사·생성·삭제한다. 슬래시 명은 디렉토리 구분자 `/` 를 `:` 로 자동 변환해 SDK 가 인식하는 형식 (`/A:B:foo`) 으로 노출하며, 워크벤치 변경 직후 `useSlashCommands` 캐시가 무효화되어 다음 채팅 슬래시 팔레트 오픈 시 새 커맨드가 즉시 보인다. 플러그인 카드는 읽기 전용이며 BMad 미러 (`.claude/commands/BMad/agents/*.md` 등) 는 휴리스틱으로 감지해 안내 마커를 표시하되 강제 차단은 하지 않는다.

### B-10-01: 트리 형태 커맨드 리스트 + 출처 배지 + paletteVisibleCount `[CORE]`

**절차**:
1. 프로젝트 `<projectRoot>/.claude/commands/` 에 `foo.md` (flat) + `mytools/sub/bar.md` (2-deep 중첩) 사전 시드
2. 전역 `~/.claude/commands/` 에 `global-cmd.md` 사전 시드
3. 설정 → 하네스 워크벤치 → "Commands" 좌측 nav 클릭 → GET `/api/harness/commands?projectSlug=<slug>` 호출
4. 응답의 `cards` 배열 + `paletteVisibleCount` 배지가 패널 상단에 노출되는지 확인 (셀렉터: `[data-testid="cmd-palette-count"]`)

**기대 결과**:
- 프로젝트 트리는 디렉토리 노드 + 잎 카드로 표현되며 `mytools/sub/bar.md` 는 `mytools` → `sub` → `bar.md` 3 단 펼침/접힘 구조로 렌더됨
- 각 잎 노드의 슬래시 명은 `/foo`, `/mytools:sub:bar`, `/global-cmd` 로 콜론 변환되어 mono-text 배지로 표시
- 출처 배지는 프로젝트(주황) / 전역(회색) / 플러그인(보라) 3 색으로 시각 구분 + scope 텍스트 라벨 병기 (색맹 대비)
- `paletteVisibleCount` 배지가 BMad 미러 dedup 후 실제 채팅 팔레트 노출 개수를 반영 (예: BMad 33개 미러가 있어도 카운트는 그대로 BMad 카드만 큐레이션해서 1번 카운트)

### B-10-02: 새 커맨드 생성 (flat) → 즉시 채팅 슬래시 팔레트 노출 `[CORE]`

**절차**:
1. CommandPanel 의 "+ 새 커맨드" CTA 클릭 → CreateCommandDialog 모달 열림
2. scope = `project`, fileName = `quickstart` 입력 → 슬래시 명 미리보기 `/quickstart` 가 모달 본문에 표시 (셀렉터: `[data-testid="cmd-create-preview"]`)
3. "만들기" 클릭 → POST `/api/harness/commands` 200 → `<projectRoot>/.claude/commands/quickstart.md` 가 빈 본문으로 생성됨
4. CommandPanel 으로 돌아오면 새 카드가 즉시 트리에 노출 (자동 reload)
5. 채팅 입력에서 `/` 입력 → 팔레트 자동완성에 `/quickstart` 가 즉시 노출되어야 함 (워크벤치 → 팔레트 캐시 무효화 통합)

**기대 결과**:
- 디스크에 새 .md 파일이 생기고 frontmatter 가 모두 비어 있어 frontmatter 블록 자체가 생략된 빈 markdown 파일로 저장됨
- `useSlashCommands` 모듈 캐시가 `invalidateSlashCommandsCache(slug)` 로 즉시 비워지고 `hammoc:slashCommandsChanged` 이벤트가 발화되어 채팅측 hook 이 다음 팔레트 오픈에 fresh fetch 를 수행
- 28.1 spike A 의 fresh-spawn 모델에 따라 SDK 도 다음 사용자 메시지부터 새 커맨드를 인식 (별도 서버 reload 트리거 없이)

### B-10-03: 새 커맨드 생성 (중첩 디렉토리) → /A:B:foo 슬래시 명 미리보기 `[CORE]`

**절차**:
1. "+ 새 커맨드" 모달에서 directoryPath = `mytools/sub`, fileName = `foo` 입력
2. 모달 안의 미리보기 영역 (`[data-testid="cmd-create-preview"]`) 가 실시간으로 `Will be invoked as /mytools:sub:foo` 를 표시
3. "만들기" 클릭 → POST `/api/harness/commands` 가 `relativePath: "mytools/sub/foo.md"` 로 호출됨
4. 디스크에 `<projectRoot>/.claude/commands/mytools/sub/foo.md` 가 생성되고 (디렉토리 자동 mkdir) 트리에 즉시 반영

**기대 결과**:
- 슬래시 명 미리보기는 디렉토리 입력 변경마다 100ms 안에 갱신
- OS 예약문자 (`<`, `>`, `:`, `"`, `|`, `?`, `*`, 컨트롤문자) 가 directoryPath 또는 fileName 에 들어가면 인라인 에러 + 제출 비활성
- 생성 실패 시 (예: 동명 파일 존재) 서버는 `HARNESS_COMMAND_NAME_CONFLICT` 409 로 거부하고 모달이 인라인 에러 노출

### B-10-04: 양방향 카피 + 시크릿 모달 + 동일 좌표 충돌 모달 (rename) `[CORE]`

**절차**:
1. 프로젝트 카드의 ⋮ 카피 메뉴에서 "전역으로 복사 →" 클릭
2. 본문에 `Bearer ghp_abcdef0123456789abcdef` 같은 시크릿이 있어 첫 시도가 403 (`HARNESS_FORBIDDEN`, `details.cause: 'secret-not-acknowledged'`) 으로 거부됨
3. CommandCopyConflictDialog 가 시크릿 안내와 함께 자동 노출 → 사용자가 ack 하고 "계속" 클릭
4. 대상 스코프에 같은 슬래시 명 파일이 이미 있으면 `덮어쓰기` / `스킵` / `이름 변경 후 추가` 3-way 라디오 노출
5. `이름 변경` 라디오 → 새 상대 경로 입력 (예: `forked-foo.md`) → "계속" → POST `/api/harness/commands/copy` 200 with `targetRelativePath, acknowledgedSecret:true`
6. 카피 직후 채팅 슬래시 팔레트가 새로운 `/forked-foo` 도 즉시 노출 (캐시 무효화 통합)

**기대 결과**:
- `${ENV_NAME}` · `${CLAUDE_PLUGIN_ROOT}` 같은 환경변수 참조는 시크릿 휴리스틱에서 제외되며 카피 시 원문 그대로 보존
- 플러그인 → 프로젝트 카피 시 본문에 `${CLAUDE_PLUGIN_ROOT}` 가 포함돼 있으면 응답 `details.warnings: ['plugin-root-reference']` 가 동봉되어 클라이언트가 경고 토스트를 띄움
- rename 입력 검증은 OS 예약문자 정규식과 `.md` 확장자 강제를 동일하게 적용

### B-10-05: frontmatter 폼 편집 + 본문 동적 토큰 하이라이트 검증 `[CORE]`

**절차**:
1. 카드 클릭 → CommandEditor 모달이 열리고 frontmatter 4개 필드 (description / argument-hint / allowed-tools / model) 와 본문 markdown 에디터가 분리 노출
2. description 입력란에 256자 초과 텍스트 입력 → `[data-testid="cmd-description-too-long"]` 경고 배지 노출 (저장은 가능)
3. argument-hint 입력란에 `[topic` (대괄호 닫지 않음) 입력 → 100ms 디바운스 후 `[data-testid="cmd-argument-hint-invalid"]` 인라인 에러 노출
4. 본문에 `$1` 과 `!`echo`` 토큰을 입력 → `[data-testid="cmd-body-tokens"]` 의 `data-uses-args="true"` / `data-uses-bash-exec="true"` 속성이 즉시 갱신
5. allowed-tools 가 비어 있으므로 친화적 검증 배지 (`[data-testid="cmd-consistency-warnings"]` 안의 `data-warning="bashWithoutAllowedTool"`) 노출 — 저장은 막지 않음
6. Raw 모드 토글 → 단일 textarea 에 frontmatter + 본문 전체가 노출됨; YAML 무효 입력 시 Form 토글이 비활성화되고 `cmd-mode-form` 버튼 disabled

**기대 결과 (시각 검증 정책 — flaky 회피)**:
- Playwright snapshot 단독 의존 금지 — 토큰 5종 (`$1` · `$ARGUMENTS` · `@path` · `` !`cmd` `` · `${CLAUDE_PLUGIN_ROOT}`) 의 사용 여부는 `data-uses-*` 속성으로 직접 단언
- WCAG AA contrast 검증은 별도 단위 테스트 (CSS 변수 contrast ratio ≥ 4.5) 가 책임
- frontmatter 편집은 300ms 디바운스로 PUT `/api/harness/commands/:relPath` 호출 → `applyYamlFrontmatterPatch` 헬퍼가 본문 markdown 영역을 byte-for-byte 보존하면서 `--- ... ---` 블록만 round-trip
- BMad 미러 카드 (예: `.claude/commands/BMad/agents/sm.md`) 는 모든 입력이 disabled + 상단 안내 배너 (`harness.command.editor.bmadMirrorReadOnly`) 노출

## B11. 하네스 서브에이전트 섹션 (Story 28.6)

> 프로젝트 / 전역 / 플러그인 세 출처의 `.claude/agents/*.md` 를 한 화면에서 카드 그리드로 보고, 4 필수 + 1 선택 frontmatter 폼과 markdown 시스템 프롬프트 본문 에디터로 편집할 수 있어야 함. 양방향 카피 + 시크릿 휴리스틱 + 환경변수 보존 + 플러그인 출처 읽기 전용 정책. agents 는 Task tool 로만 호출되며 채팅 슬래시 팔레트와는 무관 — fresh-spawn 모델로 다음 사용자 메시지부터 자동 반영.

### B-11-01: 카드 그리드 표시 + 출처 배지 + color 칩 + tools 3-상태 배지 `[CORE]`

**절차**:
1. 프로젝트 `<projectRoot>/.claude/agents/` 에 `code-reviewer.md` (frontmatter `name=code-reviewer`, `model=sonnet`, `color=green`, `tools` 키 부재) 사전 시드
2. 전역 `~/.claude/agents/` 에 `summarizer.md` (`color=cyan`, `tools: []`) 사전 시드
3. 플러그인 fixture: 6개 agent-제공 번들 (`agent-sdk-dev` / `code-simplifier` / `feature-dev` / `hookify` / `plugin-dev` / `pr-review-toolkit`) 의 `installed_plugins.json` 주입 → 직접 agents 16개 노출
4. 설정 → 하네스 워크벤치 → "Agents" 좌측 nav 클릭 → GET `/api/harness/agents?projectSlug=<slug>` 호출
5. 응답 `cards` 가 우선순위 (project > user > plugin) 로 정렬되어 카드 그리드로 노출됨

**기대 결과**:
- 각 카드에 출처 배지 (project=주황 / user=회색 / plugin=보라) + color 칩 (6색 팔레트 중 frontmatter 값) + model 배지 (inherit/sonnet/opus/haiku) + tools 3-상태 배지 동시 표시
- `tools` 키 부재 카드 → 회색 "전체 허용" 배지 / `tools: []` 카드 → 붉은색 `[data-testid="agent-tools-empty"]` "비활성" 배지 / `tools: ['Read', ...]` 카드 → 파란색 `[data-testid="agent-tools-populated"]` "N개 도구" 배지
- 6개 fixture 번들 환경에서는 정확히 16개 플러그인 카드 노출 (마켓플레이스 카탈로그는 walk 하지 않으며 `skill-creator` 번들은 agents 폴더 미보유라 포함되지 않음 — 회귀 가드)
- 스킬 번들 안 agents (`<installPath>/skills/<skill>/agents/*.md`) 는 카드 그리드에 미노출 (28.2 out-of-scope 정책)
- 모바일 (≤640px) 에서는 카드 그리드가 단일 컬럼으로 자동 축약

### B-11-02: 새 에이전트 생성 (5 필수 필드 + tools 'omitted') → 디스크에 tools 키 부재 + 안내 토스트 `[CORE]`

**절차**:
1. AgentPanel 의 `[data-testid="agent-create-cta"]` 클릭 → CreateAgentDialog 모달 열림
2. scope=`project`, name=`my-helper`, description=`Helps with X.`, model=`inherit`, color=`blue`, toolsState=`omitted` 입력
3. "Create" 클릭 → POST `/api/harness/agents` 200 → `<projectRoot>/.claude/agents/my-helper.md` 가 생성됨
4. AgentPanel 으로 돌아오면 새 카드가 즉시 그리드에 노출 (자동 reload — `harness:external-change` 와처가 `agents/my-helper.md` 를 매치)
5. 생성된 카드 클릭 → AgentEditor 모달이 열리고 description 저장 후 `[data-testid="agent-saved-toast"]` 가 "Saved. Available via Task tool from your next message." 안내 노출

**기대 결과**:
- 디스크의 새 .md 파일은 frontmatter 4 필수 필드 (name/description/model/color) 만 emit, `tools` 키는 부재 (omitted state — AC5.a 기준 SDK 가 모든 도구 사용 허용)
- name 정규식 `^[a-z][a-z0-9-]{1,48}[a-z0-9]$` 검증을 통과해야 제출 가능 — 시작/끝 하이픈, 대문자, 51자, 2자 이하 모두 인라인 에러로 차단
- 28.1 spike A 의 fresh-spawn 모델에 따라 SDK 는 다음 사용자 메시지부터 새 에이전트를 Task tool 호출 후보로 자동 등록 (별도 reload 트리거 없이)

### B-11-03: tools 3-상태 토글 round-trip — omitted ↔ empty ↔ populated `[CORE]`

**절차**:
1. AgentEditor 모달의 tools 라디오 그룹 (`[data-testid="agent-tools-radio"]`) 에서 "전체 허용 (생략)" → "비활성 (빈 배열)" 으로 전환
2. 디바운스 300ms 후 PUT `/api/harness/agents/:name` 가 `frontmatter.tools` 미설정 + `toolsState='empty'` 로 호출되어 디스크에 `tools: []` 직렬화됨
3. 라디오를 "사용자 정의" 로 전환 → "+ Add tool" 버튼 (`[data-testid="agent-add-tool"]`) 으로 `Read`, `Edit` 두 도구 추가 → 디스크에 `tools: ['Read', 'Edit']` (인라인 배열) 로 직렬화
4. 다시 "전체 허용 (생략)" 으로 복귀 → 디스크에서 `tools` 키 자체가 제거됨 (yaml round-trip 이 다른 키 / 주석 / 빈 줄을 보존)

**기대 결과**:
- 3 상태가 디스크 ↔ 폼 1:1 round-trip 보장 — `applyYamlFrontmatterPatch` 헬퍼 위에 본 스토리가 도입한 `serializeAgentFrontmatter(prevRaw, frontmatter, toolsState)` 가 toolsState 분기 처리
- 카드 그리드의 tools 배지가 라디오 변경 후 다음 reload 에 즉시 갱신 (회색 "전체 허용" → 붉은색 "비활성" → 파란색 "2개 도구")
- "비활성 (빈 배열)" 라디오 선택 시 `[data-testid="agent-tools-empty-warning"]` 경고 배지가 사용자에게 의도 확인 ("어떤 도구도 사용하지 않는 에이전트를 만듭니다 — 의도한 게 맞나요?")

### B-11-04: 양방향 카피 + 시크릿 모달 + 동일 name 충돌 모달 (rename + name 정규식 검증) `[CORE]`

**절차**:
1. 프로젝트 카드의 ⋮ 카피 메뉴 (`[data-testid="agent-copy-action-toUser"]`) 에서 "전역으로 복사 →" 클릭
2. description 또는 본문에 `Bearer ghp_abcdef0123456789abcdef` 같은 시크릿이 있어 첫 시도가 403 (`HARNESS_FORBIDDEN`, `details.cause: 'secret-not-acknowledged'`) 으로 거부됨
3. AgentCopyConflictDialog 가 시크릿 안내와 함께 자동 노출 → 사용자가 ack 하고 "계속" 클릭
4. 대상 스코프에 같은 name 파일이 이미 있으면 `덮어쓰기` / `스킵` / `이름 변경 후 추가` 3-way 라디오 노출
5. `이름 변경` 라디오 → 새 agent name 입력 (`[data-testid="agent-rename-input"]`, 예: `forked-reviewer`) → name 정규식을 인라인 검증 ("BAD" 같은 대문자 입력 시 즉시 에러) → "계속" → POST `/api/harness/agents/copy` 200 with `targetName, acknowledgedSecret:true`
6. 서버는 카피 시 새 파일의 `frontmatter.name` 도 자동 patch 해 file stem 과 일관성을 유지 (본 스토리 특유의 동작 — 28.5 슬래시 명에는 없는 단계)

**기대 결과**:
- `${ENV_NAME}` · `${CLAUDE_PLUGIN_ROOT}` 같은 환경변수 참조는 시크릿 휴리스틱에서 제외되며 카피 시 원문 그대로 보존
- 플러그인 → 프로젝트 카피 시 본문 또는 frontmatter 어디든 `${CLAUDE_PLUGIN_ROOT}` 가 포함돼 있으면 응답 `details.warnings: ['plugin-root-reference']` 동봉
- rename 입력 검증은 agent name 정규식 (3–50 소문자/숫자/하이픈, 시작·끝 하이픈 금지) + OS 예약문자 정규식을 동시에 적용
- 플러그인 → 프로젝트/전역 카피만 허용되며 프로젝트/전역 → 플러그인 카피는 UI 메뉴 자체에 등장하지 않음 (AC6.d 정책)

### B-11-05: `<example>` 템플릿 삽입 버튼 + 친화적 경고 배지 `[CORE]`

**절차**:
1. AgentEditor 모달에서 description 텍스트박스에 커서 위치 → "+ Add example" 버튼 (`[data-testid="agent-insert-example"]`) 클릭
2. 디바운스 후 description 본문에 `<example>...</example>` 스켈레톤이 자동 삽입되며 `[data-testid="agent-example-inserted-toast"]` 안내 토스트 노출
3. 본문에 `<example>` 매치 0건 상태에서는 친화적 경고 배지 `[data-testid="agent-no-example-warning"]` 가 본문 에디터 위에 노출 ("auto-selection quality may suffer — 템플릿을 삽입하세요")
4. `<example>` 블록을 본문에 직접 입력 (또는 템플릿 삽입) → 100ms 디바운스 후 경고 배지가 사라짐
5. CodeMirror 본문 에디터의 `<example>` 블록이 `agentExampleHighlight` ViewPlugin 으로 별도 색상 띠 + 4px left border 로 시각 구분되어 식별 가능

**기대 결과 (시각 검증 정책 — flaky 회피, 28.5 답습)**:
- Playwright snapshot 단독 의존 금지 — `<example>` 블록의 데코레이션 적용은 `data-decoration-class="cm-agent-example"` DOM 속성 + `getComputedStyle(...).backgroundColor` 직접 단언으로 검증
- WCAG AA contrast 검증은 별도 단위 테스트가 책임 (배경 컬러 + left border 4px 다채널)
- description 에 `<example>` 없을 때 친화적 경고 배지 (`harness.agent.editor.warnings.noExampleBlock`) 가 노출되지만 저장은 막지 않음 — AC4.c 친화적 가드

## B12. 하네스 CLAUDE.md 편집기 섹션 (Story 29.1)

> 프로젝트 루트 `<projectRoot>/CLAUDE.md` 와 전역 `~/.claude/CLAUDE.md` 두 파일을 좌우 병치 markdown 에디터로 동시에 보고, 각각 독립적으로 편집(debounce 자동 저장)하며, 외부 디스크 변경은 staleBanner 로 알림 + reload/overwrite 선택, 한쪽 파일의 `## H2` 섹션을 다른 쪽으로 append 또는 전체 덮어쓰기 카피, 미존재 파일은 명시적 "생성하기" CTA 로만 생성.

### B-12-01: 좌우 병치 두 에디터 + 독립 편집 + 모바일 탭 축약 `[CORE]`

**절차**:
1. 프로젝트 루트 `<projectRoot>/CLAUDE.md` 에 `# project memory\n\n## 언어 설정\nKorean.\n` 사전 시드
2. 전역 `~/.claude/CLAUDE.md` 에 `# global\n\n## 코드 스타일\nPrettier.\n` 사전 시드
3. 설정 → 하네스 워크벤치 → "CLAUDE.md" 좌측 nav 클릭 → 두 GET `/api/harness/claude-md?scope=user` / `?scope=project&projectSlug=<slug>` 호출
4. 데스크톱 (≥640px) 에서 좌측 컬럼은 `[data-testid="claude-md-user-column"]` (전역 + 회색 배지), 오른쪽은 `[data-testid="claude-md-project-column"]` (프로젝트 + 주황 배지) 좌우 병치 노출
5. 왼쪽 CodeMirror 에 `## 추가\nNew global section\n` 입력 → 300ms 디바운스 후 PUT `/api/harness/claude-md` (scope=user) 호출되고 `[data-testid="claude-md-user-saved-toast"]` "Saved." 노출
6. 오른쪽 컬럼은 변경 없음 — PUT 호출도 발생하지 않음 (독립 저장)
7. 뷰포트를 ≤640px 로 축소 → 좌우 병치가 사라지고 상단 탭 토글 (`[data-testid="claude-md-mobile-tab-user"]` / `claude-md-mobile-tab-project`) 노출. 한 번에 한 컬럼만 표시

**기대 결과**:
- 두 에디터 인스턴스가 완전히 독립적으로 동작 — 한 컬럼 입력이 다른 컬럼 store 에 누설되지 않음
- CodeMirror 가 패널 mount 시점이 아니라 첫 포커스 후에 lazy-load 되어 패널 초기 렌더 비용 0 (28.5/28.6 답습)
- 모바일 탭 전환 후에도 store 상태가 유지되어 직전에 입력한 미저장 draft 가 사라지지 않음
- 패널 상단에 spike 결과 기반 헬프 안내 (`[data-testid="claude-md-panel-help"]`) 노출 — "전역 + 프로젝트 두 파일 모두 세션에 포함되며 프로젝트가 우선합니다"

### B-12-02: 외부 변경 staleBanner — reload vs overwrite 두 경로 `[EDGE]`

**절차**:
1. 프로젝트 루트 `<projectRoot>/CLAUDE.md` 사전 존재 + 패널이 정상 상태 (편집 가능)
2. 외부 프로세스가 `<projectRoot>/CLAUDE.md` 를 직접 수정 (예: `echo "external" >> CLAUDE.md`) → fileWatcherService 가 `harness:external-change` 이벤트 emit (`scope='project'`, `path='../CLAUDE.md'`)
3. 클라이언트 store `handleExternalChange` 는 path `'../CLAUDE.md'` 를 프로젝트 컬럼으로 라우팅 (path 가 `'CLAUDE.md'` 였으면 `<projectRoot>/.claude/CLAUDE.md` sibling 로 오해되므로 ignore — 별도 회귀 케이스 B-12-02b 로 검증)
4. 사용자가 미저장 draft 를 갖고 있으면 `[data-testid="claude-md-project-stale-banner"]` 가 노출되어 reload 또는 overwrite 두 버튼 활성
5. **(reload 경로)** `[data-testid="claude-md-project-stale-reload"]` 클릭 → store 가 디스크 콘텐츠를 에디터 텍스트로 교체 + 배너 닫힘. 사용자 draft 는 사라짐
6. **(overwrite 경로)** `[data-testid="claude-md-project-stale-overwrite"]` 클릭 → store 가 expectedMtime 을 디스크 현재 mtime 으로 갱신 후 즉시 PUT 재시도 → 200 응답 + 배너 닫힘. draft 가 디스크에 반영됨

**기대 결과**:
- 두 버튼은 동시에 활성, 자동 선택 없음 — 유저 명시적 클릭 필수
- self-write echo 무시: 본 패널이 PUT 직후 와처가 같은 path 에 대한 modified 이벤트를 보고해도 staleBanner 가 뜨지 않음 (`fileWatcherService.noteLocalWrite` 가 본 path 에서도 자동 동작)
- **회귀 가드 (B-12-02b)**: `<projectRoot>/.claude/CLAUDE.md` (서브트리 안쪽) 가 우연히 만들어져 외부 변경되어도 프로젝트 컬럼 staleBanner 가 발동하지 않음 — path discriminator (`'CLAUDE.md'` vs `'../CLAUDE.md'`) 가 두 케이스를 구분

### B-12-03: 섹션 append 카피 — H2 체크박스 + 이미 있음 경고 + 디스크 round-trip `[CORE]`

**절차**:
1. 두 컬럼 모두 정상 상태 — 전역에 `## 코드 스타일\n...\n## 도구 선호\n...`, 프로젝트에 `## 코드 스타일\nKorean.\n`
2. 전역 컬럼 헤더의 카피 버튼 (`[data-testid="claude-md-copy-toProject"]`) 클릭 → ClaudeMdCopyDialog (`[data-testid="claude-md-copy-dialog"]`) 모달 열림
3. 모드 라디오는 default 가 "섹션 append" (`[data-testid="claude-md-copy-mode-append"]`)
4. 모달 본문에 전역의 H2 두 개 (`## 코드 스타일`, `## 도구 선호`) 가 체크박스 리스트로 노출. `## 코드 스타일` 행은 프로젝트에 동명 H2 가 이미 있으므로 `data-already-exists="true"` + "이미 있음" 배지 노출
5. `## 도구 선호` 만 체크 → "선택 섹션 카피" 버튼 (`[data-testid="claude-md-copy-submit"]`) 클릭
6. 클라이언트가 `appendMarkdownSections` 헬퍼로 머지 → PUT `/api/harness/claude-md` (scope=project, content=합쳐진 텍스트) → 200 응답 + 모달 닫힘 + 프로젝트 컬럼이 갱신된 디스크 mtime 으로 동기화

**기대 결과**:
- "이미 있음" 배지에도 불구하고 진행 가능 — Hammoc 은 자동 머지하지 않으며 카피 시 동일 헤딩이 두 번 등장하는 결과를 그대로 받아들임 (유저 의사 존중)
- 코드펜스(```...```) 안에 흉내 `## ` 가 있어도 H2 로 인식하지 않아 체크박스 리스트에 등장하지 않음 (회귀 가드)
- 단일 round-trip — 클라이언트가 split + append 를 수행하여 PUT 1회로 끝나며 별도 서버 splice API 가 도입되지 않음 (라이브러리/엔드포인트 0건 회귀 가드)

### B-12-04: 전체 덮어쓰기 카피 — destructive 확인 + 대상 미리보기 `[CORE]`

**절차**:
1. 두 컬럼 모두 정상 상태 — 전역은 짧은 텍스트, 프로젝트는 7줄 이상의 본문
2. 프로젝트 컬럼 헤더의 카피 버튼 (`[data-testid="claude-md-copy-toUser"]`) 클릭 → 카피 모달 열림
3. 모드 라디오를 "전체 덮어쓰기 (overwrite)" (`[data-testid="claude-md-copy-mode-overwrite"]`) 로 전환
4. 모달 본문에 destructive 경고 + 대상 (전역) 파일의 첫 5줄 미리보기 노출
5. 빨간색 "덮어쓰기 확인" 버튼 (`[data-testid="claude-md-copy-submit"]`, label = `harness.claudeMd.copy.confirmOverwrite`) 클릭
6. PUT `/api/harness/claude-md` (scope=user, content = 프로젝트 전체 본문) → 200 응답 + 모달 닫힘 + 전역 컬럼이 프로젝트 본문으로 갱신

**기대 결과**:
- 소스 파일에 H2 헤딩이 0개 인 케이스 (회귀): 모드 라디오는 자동으로 "전체 덮어쓰기" 로 전환되며 `[data-testid="claude-md-copy-no-h2-banner"]` 안내 + append 라디오 비활성
- 전체 덮어쓰기 버튼은 시각적으로 destructive (붉은색) — 사용자가 클릭 의사를 가시적으로 확인하도록 강제
- 미리보기는 첫 5줄 — 이는 정보 제공일 뿐 선택 가능한 부분 카피가 아님 (모달은 항상 전체 카피)

### B-12-05: 미존재 파일 "생성하기" CTA — 자동 생성 0건 + 확인 다이얼로그 `[CORE]`

**절차**:
1. **(전제)** 프로젝트 루트 `<projectRoot>/CLAUDE.md` 미존재 + 전역 `~/.claude/CLAUDE.md` 미존재 (또는 `~/.claude/` 자체가 미존재)
2. 패널 mount → 두 GET 모두 404 (HARNESS_FILE_NOT_FOUND) → 두 컬럼 모두 빈 상태 진입
3. **(자동 생성 0건 검증)** 패널 mount 시점에 어떤 POST 도 발생하지 않음 — 디스크에는 여전히 두 파일 미존재
4. 두 컬럼 모두 `[data-testid="claude-md-{user|project}-empty"]` 빈 상태 UI 노출 (안내 문구 + `[data-testid="claude-md-create-cta"]` "+ CLAUDE.md 만들기" 버튼)
5. 한쪽 (예: 전역) 의 만들기 버튼 클릭 → 작은 확인 다이얼로그 (`[data-testid="claude-md-create-confirm"]`) 노출 + 절대경로 표시
6. 다이얼로그의 "만들기" (`[data-testid="claude-md-create-confirm-submit"]`) 클릭 → POST `/api/harness/claude-md` (scope=user) 201 응답 → 컬럼이 정상 상태로 전환되며 빈 에디터 활성
7. **(전역 부모 디렉토리 자동 생성 검증)** `~/.claude/` 가 사전에 미존재여도 POST 가 자동 mkdir 후 빈 파일 생성 성공
8. 다른 컬럼 (프로젝트) 은 여전히 빈 상태 + CTA — 한 컬럼 생성이 다른 컬럼에 누설되지 않음

**기대 결과**:
- POST 단일 경로만 사용 — PUT-with-empty-content 우회 경로는 등장하지 않음 (서버 라우트 자체가 두 행위를 분리)
- 이미 파일이 있는 상태에서 같은 POST 가 재호출되면 409 (`HARNESS_FILE_EXISTS`) — 이중 생성 방지 (회귀 가드)
- 빈 상태에서도 카피 버튼은 활성 — 다른 컬럼이 채워져 있으면 카피로 초기 콘텐츠를 채워 넣는 흐름이 가능 (다만 카피 모달 안에서 PUT 가 빈 컬럼에 대해 expectedMtime 없이 진행되어 자동 생성과 동일 효과)
