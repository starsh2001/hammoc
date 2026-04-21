# I. 보드 & 이슈

**범위**: 칸반/리스트, 이슈 CRUD, 상태 전이, 에픽·스토리 진행률.
**선행 도메인**: A, B.

---

## I1. 칸반 / 리스트 뷰 전환 `[CORE] [MOBILE]`

### I-01-01: 뷰 토글

**선행 조건**: 보드 탭 진입. 데스크탑 뷰포트(≥ 640px). 테스트 프로젝트에 이슈가 최소 1개 존재(없으면 I-02-01 절차로 먼저 생성).

**절차**:
1. 보드 탭 진입 (`project/<slug>/board`)
2. 보드 상단 좌측의 뷰 토글 영역에서 `button[aria-label="리스트 뷰"]` 클릭
3. `button[aria-label="리스트 뷰"]` 의 `aria-pressed="true"` 확인
4. 이슈 카드가 상태별 확장 그룹(`Open 1` / `To Do 0` / …)으로 행 렌더되는지 스냅샷으로 확인
5. 다른 프로젝트 탭(예: 개요)로 이동 후 다시 보드 탭 재진입
6. `button[aria-label="리스트 뷰"]` 가 여전히 `aria-pressed="true"` 인지 확인
7. `browser_evaluate` 로 `localStorage.getItem('bmad-board-viewMode')` === `"list"` 확인
8. `button[aria-label="칸반 뷰"]` 클릭해 원복

**기대 결과**:
- 칸반 뷰: 컬럼 기반 레이아웃. 컬럼(Open / To Do / Doing / Review / Close)이 가로로 나열되고 카드가 컬럼 내부에 쌓임.
- 리스트 뷰: 상태별 접을 수 있는 그룹 헤더 하위에 카드가 행 형태로 표시. `항목 없음` placeholder 는 그룹별 0 카운트일 때 노출.
- 선택 상태는 localStorage 키 `bmad-board-viewMode` 에 저장되며 재진입 시 복원.

### I-01-02: 모바일 뷰 `[MOBILE]`

> **구현 노트**: 모바일 뷰포트(`< 640px`)에서는 칸반 뷰가 `MobileKanbanBoard` 컴포넌트로 전환되어 한 번에 한 컬럼씩 보여준다. 네이티브 가로 스크롤(`overflowX: auto` + `scrollWidth > clientWidth`) 대신 `transform: translateX(...)` 기반 페이지네이션 + 하단 인디케이터 dot 버튼 + `TouchEvent` 기반 swipe 로 컬럼을 이동한다. 데스크탑에서 Playwright MCP 합성 `TouchEvent` 는 Chromium 상에서 네이티브 제스처로 인식되지 않으므로, 이 시나리오는 **인디케이터 dot 버튼 클릭** 경로로 컬럼 이동을 간접 검증한다.

**선행 조건**: 보드 탭(칸반 뷰 활성) 진입 후 `browser_resize(width=400, height=800)` 적용.

**절차**:
1. 400px 뷰포트에서 보드 탭 확인
2. `browser_snapshot` 으로 하단 `button[aria-label="Open 칼럼으로 이동"]` ~ `Close 칼럼으로 이동` 5개 dot 버튼 존재 확인
3. `button[aria-label="To Do 칼럼으로 이동"]` 클릭 → 해당 버튼이 `active` 상태로 전환되는지 확인
4. 추가로 `Doing`, `Review`, `Close` 각 dot 을 차례로 클릭해 `active` 전이가 일어나는지 확인
5. 테스트 종료 후 `browser_resize(width=1440, height=900)` 로 원복

**기대 결과**:
- 모바일 뷰포트에서 하단 5개 인디케이터 dot 버튼이 렌더된다 (aria-label 패턴: `<컬럼명> 칼럼으로 이동`).
- dot 클릭 시 해당 버튼에 `active` 상태가 붙고 `MobileKanbanBoard.goToColumn(index)` 가 호출되어 보이는 컬럼이 전환된다.
- 데스크탑 네이티브 가로 스크롤 컨테이너(`overflowX: auto && scrollWidth > clientWidth`)는 **존재하지 않는다** — 구현은 transform 기반이므로 이를 기대하지 말 것.

**엣지케이스 주의**: 실제 디바이스에서의 swipe 제스처는 `handleTouchStart/Move/End` 가 담당하지만 Playwright 합성 TouchEvent 로는 재현이 불안정하다. 수동 디바이스 회귀에서 별도 검증 권장.

---

## I2. 이슈 CRUD `[CORE]`

### I-02-01: 이슈 생성

**선행 조건**: 보드 탭(칸반 뷰) 진입.

**절차**:
1. 보드 상단 우측의 `button` "이슈 추가" 클릭 → `role="dialog"` "이슈 추가" 다이얼로그 오픈
2. 제목 입력 전 상태에서 다이얼로그 내부 `button` "이슈 추가" 가 `disabled` 인지 확인 (유효성 검증)
3. `input[placeholder="이슈 제목을 입력하세요"]` 에 제목 입력 — value setter + `InputEvent` 주입 또는 `browser_type`
4. (선택) `textarea[placeholder="이슈에 대한 설명 (선택)"]` 에 설명 입력
5. (선택) `select[aria-label="심각도"]` 옵션(`선택 안 함`·`낮음`·`중간`·`높음`·`심각`) 선택
6. (선택) `select[aria-label="타입"]` 옵션(`선택 안 함`·`버그`·`개선`) 선택
7. 다이얼로그 내부 `button` "이슈 추가" 클릭
8. `browser_wait_for(text: "<제목>")` 로 카드 등장 대기
9. `fetch('/api/projects/<slug>/board')` → `items` 배열에서 신규 `id: "ISSUE-<N>"` 항목 확인
10. `ls <projectRoot>/docs/issues/ISSUE-<N>.md` 로 파일 생성 확인

**기대 결과**:
- 제목 공란 시 제출 버튼 `disabled`
- 제목 입력 후 제출 버튼 활성, 클릭 시 Open 컬럼에 카드 추가
- `<projectRoot>/docs/issues/ISSUE-<증가하는 정수>.md` 파일 생성
- 보드 API 응답의 `items` 배열에 `{ id: "ISSUE-N", type: "issue", status: "Open", title, severity?, type? }` 포함

### I-02-02: 이슈 편집 (제목·심각도·설명)

**선행 조건**: I-02-01 로 생성된 이슈 1개 존재.

**절차**:
1. 대상 이슈 카드 본문(카드 메뉴 버튼 `button[aria-label="카드 메뉴"]` 외의 영역) 클릭 → `role="dialog"` "이슈 편집" 다이얼로그 오픈
2. 다이얼로그 내 `input` (제목), `select[aria-label="심각도"]` 등 기존 값이 채워졌는지 확인
3. 제목 수정 — value setter + `InputEvent` 주입(React controlled input 에 안전)
4. 심각도 변경 (예: `심각`)
5. `button` "저장" 클릭
6. `browser_wait_for(text: "<수정된 제목>")` 로 카드 갱신 대기
7. `window.location.reload()` 후 수정된 제목이 유지되는지 확인
8. `fetch('/api/projects/<slug>/board')` → 동일 `id` 항목의 `title`, `severity` 가 수정 값과 일치하는지 확인

**기대 결과**:
- 저장 즉시 카드 제목/배지 갱신
- 새로고침 후에도 수정 유지
- API 응답에 변경 반영

### I-02-03: 이슈 삭제

**선행 조건**: 삭제할 이슈 카드 1개 존재.

**절차**:
1. 대상 카드의 `button[aria-label="카드 메뉴"]` 클릭 → `role="menu"` 가 열리며 `바로 작업하기` / `스토리로 승격` / `에픽으로 승격` / `편집` / `닫기` / `삭제` 메뉴 항목 확인
2. `menuitem` "삭제" 클릭 → 브라우저 네이티브 `confirm` 다이얼로그(`이슈 "<제목>"을(를) 삭제하시겠습니까?`) 등장
3. `browser_handle_dialog(accept: true)` 로 수락
4. `browser_wait_for(textGone: "<제목>")` 또는 단시간(≤ 2s) 대기 후 보드 스냅샷 재취득
5. `fetch('/api/projects/<slug>/board')` → `items` 에서 해당 `id` 가 제거됐는지 확인
6. `ls <projectRoot>/docs/issues/` 로 `ISSUE-<N>.md` 파일 삭제 확인

**기대 결과**:
- 삭제 확인 수락 시 카드가 보드에서 제거
- 서버 파일(`docs/issues/ISSUE-<N>.md`) 삭제
- API `items` 배열에서 제거
- 거절(`accept: false`) 시 아무 변화 없음(엣지)

### I-02-04: non-BMad 프로젝트 이슈 보드 표시 `[CORE]`

> 회귀 방지. `issueService.getBoard` 가 `bmadStatusService.scanProject` 의 `NOT_BMAD_PROJECT` 에러를 catch 하면서 일반 이슈까지 탈락시켰던 버그 (fix 7043f83).

**선행 조건**: `.bmad-core/core-config.yaml` 이 없는 non-BMad 프로젝트.

**절차**:
1. non-BMad 프로젝트 보드 탭 진입
2. I-02-01 절차로 이슈 1개 생성
3. `browser_snapshot` → Open 컬럼에 이슈 카드 확인
4. `window.location.reload()` 로 새로고침 후 재확인
5. `fetch('/api/projects/<slug>/board')` → `items` 배열에 생성한 이슈 포함 검증

**기대 결과**:
- non-BMad 프로젝트에서도 이슈가 보드에 정상 표시
- `items` 배열이 비어있지 않음 (BMad 스캔 실패와 무관)

---


## I4. 에픽 · 스토리 진행률 `[CORE]`

> **설계 원칙**: 보드 UI "이슈 추가" 버튼은 이슈 전용.
> - **non-BMad 프로젝트**: 이슈만 생성 가능, 에픽/스토리 생성 UI 없음 (의도된 설계)
> - **BMad 프로젝트**: 에픽은 PRD 샤드(`<prdShardedLocation>/epic-<n>*.md` 또는 PRD 내 `## Epic N` 헤더), 스토리는 `<devStoryLocation>/N.M.story.md` 파일로 관리. `/sm` 에이전트 또는 파일 직접 추가로 생성하며 보드는 `bmadStatusService.scanProject` 가 이를 읽어 표시한다.

### I-04-01: 에픽 진행률 표시

> BMad 프로젝트 전용. 기존 BMad 테스트 프로젝트(예: `__hammoc_test_bmad_*`)에서 실행할 것.

**선행 조건**: BMad 프로젝트에 에픽 1개 + 스토리 3개(Draft / In Progress / Done 각 1개)가 존재해야 함. 부족하면 실제 파일 생성으로 준비. PRD 샤딩 설정(`prdSharded: true`) 이면 에픽 파일 이름은 `core-config.yaml` 의 `epicFilePattern` (예: `epic-{n}*.md`) 을 따른다.

**테스트 픽스처 예시**:

`<projectRoot>/<prdShardedLocation>/epic-99-integration-test.md`:
```markdown
# Epic 99: Integration Test Epic

## Story 99.1: Story A

## Story 99.2: Story B

## Story 99.3: Story C
```

`<projectRoot>/<devStoryLocation>/99.1.story.md`:
```markdown
# Story 99.1: Story A

## Status

Draft
```

(99.2 = `In Progress`, 99.3 = `Done` 로 2개 더 생성)

**절차**:
1. BMad 프로젝트 보드 탭 진입
2. `browser_snapshot` → Epic 99 카드에 진행률 분수(예: `1/3`) 텍스트와 상태(`In Progress`) 가 표시되는지 확인
3. `fetch('/api/projects/<slug>/board')` → `items.find(i => i.id === 'epic-99')` 의 `storyProgress: { total: 3, done: 1 }` 값 확인
4. 스토리 3개가 각각 `To Do`(Draft), `Doing`(In Progress), `Close`(Done) 컬럼으로 라우팅되는지 스냅샷으로 확인

**기대 결과**:
- Epic 99 카드 UI: "1/3" 분수 텍스트 + `In Progress` 상태 배지
- API `items`: epic-99 에 `storyProgress: { total: 3, done: 1 }` (≈ 33%)
- 스토리 카드는 상태에 맞춰 컬럼 배치

**테스트 후 정리**: 생성한 `docs/stories/99.*.md` 및 `<prdShardedLocation>/epic-99-*.md` 파일 삭제.

### I-04-02: 에픽에 속하지 않는 이슈/스토리 배치 (설계 검증)

> **설계 검증 시나리오**. 이전 버전의 "고아 이슈 별도 섹션" UX 는 구현되지 않았다. 현재 구현은 `epicNumber` 가 없는 이슈와 `N.M` 패턴이 아닌 스토리(예: 파일 이름 `story-foo.md`) 모두를 일반 상태 컬럼에 배치한다. 순환 참조 감지·경고 로그 역시 현재 구현 범위가 아니다. 본 시나리오는 "고아 항목이 별도 섹션 없이 일반 컬럼에 정상 표시된다"는 의도된 동작을 고정한다.

**선행 조건**: 에픽 없는 이슈가 포함될 BMad 또는 non-BMad 프로젝트. 테스트 내부에서 생성한다.

**절차**:
1. 테스트 프로젝트 보드 탭 진입
2. I-02-01 절차로 이슈 1개 생성(예: 제목 `I-04-02 Orphan Issue`)
3. `fetch('/api/projects/<slug>/board')` → 생성한 이슈 항목에 `type: "issue"`, `status: "Open"`, `epicNumber` 필드 없음 확인
4. 보드 스냅샷에서 해당 이슈 카드가 Open 컬럼에 일반 카드로 렌더되는지 확인 (별도 "orphan"/"고아" 그룹·배지·경고 영역이 존재하지 않음)

**기대 결과**:
- `epicNumber` 를 갖지 않는 이슈는 `Open` 상태 컬럼에 일반 카드로 표시
- 별도 "고아 항목" 섹션·배지·경고는 노출되지 않음 (의도된 설계)

**추가 참고**:
- `.N` 패턴이 아닌 BMad 스토리 파일(예: `docs/stories/standalone-foo.story.md`) 은 서버가 `epicKey: 'BS'` 로 그룹(`Standalone Stories`)에 묶어 반환하지만, 현재 보드 UI 에서도 일반 상태 컬럼에 배치된다. 별도 UI 분리는 없음.
- 순환 참조(이슈 A ↔ 이슈 B 상호 링크) 감지·경고 기능은 현재 구현되지 않음. 향후 기능 추가 시 본 시나리오에 엣지케이스로 편입.

### I-04-03: non-BMad 프로젝트 에픽/스토리 생성 UI 부재 (설계 검증) `[CORE]`

**선행 조건**: `.bmad-core/core-config.yaml` 이 없는 non-BMad 프로젝트 보드 탭 진입.

**절차**:
1. 보드 상단 우측 `button` "이슈 추가" 클릭 → "이슈 추가" 다이얼로그 오픈
2. 다이얼로그 내 `select[aria-label="타입"]` 옵션 목록을 `browser_evaluate` 로 수집
3. 수집한 옵션 리스트가 `["선택 안 함", "버그", "개선"]` 와 정확히 일치하는지 확인 (Epic / Story / 에픽 / 스토리 등 항목 없음)
4. 다이얼로그 외부에 `button` "에픽 추가" / `button` "스토리 추가" 등이 존재하지 않는지 스냅샷으로 확인
5. `Escape` 키 또는 `button` "취소" / `button[aria-label="닫기"]` 로 다이얼로그 닫기

**기대 결과**:
- 타입 선택지는 `선택 안 함`, `버그`, `개선` 세 항목만 존재 (Epic/Story 없음 — 의도된 설계)
- 에픽/스토리 생성용 별도 버튼·메뉴는 non-BMad 프로젝트 보드에 노출되지 않음
