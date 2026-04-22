# Q. BMad Method

**범위**: 초기화, 에이전트 전환, PRD→Queue, 스토리 워크플로우.
**선행 도메인**: A, B. **BMad 초기화된 프로젝트 필수**.

> 기본 테스트 프로젝트는 비-BMad 로 생성되므로, Q 시나리오 실행 시 별도 `__hammoc_test_bmad_<ts>__` 프로젝트를 BMad 옵션으로 생성한다.

---

## Q1. BMad 초기화 `[CORE]`

### Q-01-01: 새 프로젝트 생성 시 BMad 옵션
**절차**: B-02-02 시나리오와 동일.
**기대 결과**:
- `.bmad-core/` 디렉토리 + 템플릿 파일 (PRD, BACKLOG, 에픽/스토리 구조) 생성
- Project Settings → "BMad Project" 배지 표시
- Project Overview 페이지에 BMad 전용 카드 추가

### Q-01-02: 기존 프로젝트에 BMad 추가
**절차**:
1. 비-BMad 프로젝트 카드의 "⋯" 메뉴를 연다
2. "BMad 전환" 메뉴 항목(마법봉 아이콘)을 클릭한다
3. BMad 버전 선택 확인 모달이 열린다 — 기본으로 최신 버전 선택됨. 필요 시 드롭다운에서 다른 버전 선택
4. 모달의 "설치" 버튼 클릭 → `POST /api/projects/:slug/setup-bmad` 호출
5. 성공 토스트 `project.bmadSetupSuccess` 확인 후 카드에 BMad 배지가 나타나는지 확인
6. 파일 탐색기에서 `.bmad-core/` 디렉토리가 생성되고 기존 파일은 그대로인지 확인

**기대 결과**: 기존 파일 보존, `.bmad-core/` 만 추가, 프로젝트 상태 `isBmadProject=true`.

**설계 주의 (현재 구현)**:
- 메뉴 항목은 `isBmadProject === false`일 때만 표시됨 ([ProjectCard.tsx](../../packages/client/src/components/ProjectCard.tsx)). 이미 BMad인 프로젝트에서는 메뉴 자체가 노출되지 않아 사용자 혼동 방지.
- BMad 리소스는 번들 템플릿(`packages/server/resources/bmad-method/<version>/`)에서 로컬 복사 방식이므로 네트워크 다운로드 개념은 없다.

**엣지케이스**:
- E1. 이미 디스크에 `.bmad-core/`가 있지만 `isBmadProject=false`로 잘못 기록된 엣지: 서버가 `409 ALREADY_BMAD` 반환 → 클라이언트가 실패 토스트(`project.bmadSetupError`) 표시 (현재는 재요청/덮어쓰기 플로우 미구현 — future feature).
- E2. 존재하지 않는 버전을 명시한 API 직접 호출: 서버가 "BMad 버전 X을 찾을 수 없습니다" 에러 반환, UI 상태 변경 없음.

---

## Q2. 에이전트 전환 `[CORE]`

### Q-02-01: SM / PM / Architect / Dev / QA 전환
**절차**:
1. BMad 프로젝트의 채팅 세션에서 **채팅 입력바 하단**의 BMad 에이전트 버튼 (`aria-label="BMad 에이전트 목록"`) 클릭 → 드롭다운에 10개 에이전트 노출 (Analyst / PM / UX Expert / Architect / SM / PO / Dev / QA / Bmad Master / Bmad Orchestrator)
2. SM / PM / Architect / Dev / QA 순차 선택. **주의**: 에이전트 선택 시 Hammoc 이 자동으로 `/BMad:agents:<id>` 슬래시 명령을 주입한 **새 세션을 자동 생성**한다 (한 세션 안에서 에이전트를 교대로 바꾸는 플로우가 아님 — 매 선택마다 신규 세션으로 네비게이트됨). URL `/session/<uuid>` 가 매번 바뀌는지 확인.
3. 각 전환 직후 `document.querySelector('[data-testid*="agent"]').textContent` 로 배지를 읽어 이모지 + 축약명 (🏃 SM, 📋 PM, 🏗️ Architect, 💻 Dev, 🧪 QA) 이 선택값과 일치하는지 검증
4. QA 세션에서 입력바에 `/` 입력 → 슬래시 팔레트에서 QA 전용 명령 (`*review`, `*nfr-assess`, `*trace`, `*gate`, `*risk-profile`, `*test-design`) 이 노출되는지 확인

**기대 결과**:
- 각 선택마다 새 세션 생성 + 활성 에이전트 배지 (이모지 + 축약명) 갱신
- 에이전트 자기소개 응답 (예: QA 전환 시 "🧪 Quinn — Test Architect & Quality Advisor...") — 시스템 프롬프트 교체 간접 증거
- 슬래시 팔레트에 에이전트 전용 `*` 명령 노출

> **UI 위치 주의**: 에이전트 드롭다운은 ChatHeader가 아닌 **채팅 입력바 하단**에 있다. BMad 프로젝트 세션에서만 표시됨.

> **비용 주의**: 5개 에이전트 전환 시 각각 SDK 응답이 발생한다. 자기소개 응답은 보통 수 초 내 완료되지만 Opus 에서는 분 단위까지 늘어날 수 있으므로, 배지 확인 직후 `browser_press_key("Escape")` 로 중단하는 것을 권장.

### Q-02-02: 활성 에이전트 세션별 저장
**절차**:
1. Q-02-01 직후 QA 세션 URL 의 마지막 세그먼트(세션 ID)를 `location.href.split('/').pop()` 로 기록한다
2. 헤더의 **"새 세션 시작" 버튼** (`aria-label="새 세션 시작"`) 클릭 → URL 이 `/session/<newUuid>` 로 바뀌는지 확인
3. 새 세션에서 `document.querySelector('[data-testid*="agent"]').textContent.trim()` 로 배지 읽기 → 정확히 문자열 `"Claude"` (이모지 없이) 여야 함
4. `browser_navigate(<QA 세션 URL>)` 로 1번 세션 재진입 → 2초 대기 후 동일 셀렉터로 배지 재확인

**기대 결과**:
- 기존 QA 세션 재진입 시 배지가 `"🧪 QA"` 로 복원된다 — 세션별 에이전트 상태가 서버에 저장되어 있음
- (현재 구현) 신규 세션 생성 시에는 기본 `"Claude"` 에이전트로 초기화된다 — 이는 의도된 동작이며 "세션 간 에이전트 자동 전파"는 스펙 아님. 신규 세션에도 마지막 선택을 전파하려면 별도 UX 변경 필요(Future Feature).

---

## Q3. PRD → Queue `[CORE]`

> **PRD 구조 주의 (중요)**:
> BMad 기본 `.bmad-core/core-config.yaml`은 **sharded PRD**로 설정됨 ([core-config.yaml 번들 템플릿](../../packages/server/resources/bmad-method/4.44.3/.bmad-core/core-config.yaml)):
> ```yaml
> prd:
>   prdSharded: true
>   prdShardedLocation: docs/prd
>   epicFilePattern: epic-{n}*.md
> ```
> 즉 기본 세팅에서는 단일 `docs/prd.md`를 생성해도 스토리 추출 API([queueTemplateController.ts extractStories](../../packages/server/src/controllers/queueTemplateController.ts#L141))가 읽지 않습니다. 반드시 **`docs/prd/epic-<N>-<slug>.md`** 형태의 sharded 파일로 배치해야 합니다.
> `prdSharded: false`로 변경하면 단일 `docs/prd.md`(= `prdFile` 경로) fallback이 동작합니다.

### Q-03-01: PRD 파싱 & 스토리 추출 (sharded 구조 — 기본)
**선행 조건**: BMad 프로젝트 (B-02-02). `.bmad-core/core-config.yaml`이 기본 `prdSharded: true`.

**절차**:
1. 파일 탐색기 또는 OS `Write` 로 `docs/prd/epic-1-auth.md` 생성:
   ```markdown
   # Epic 1: Auth

   ## Story 1.1: Login form

   ## Story 1.2: Session persistence
   ```
2. 같은 방식으로 `docs/prd/epic-2-dashboard.md` 생성:
   ```markdown
   # Epic 2: Dashboard

   ## Story 2.1: Stats summary
   ```
3. API 사전 검증: `fetch('/api/projects/<slug>/queue/stories').then(r=>r.json())` 응답의 `stories` 배열에 `{storyNum: '1.1'}`, `1.2`, `2.1` 3개가 있는지 확인 (없으면 sharded 경로가 깨진 것 — `core-config.yaml` `prdShardedLocation` 확인)
4. 큐 러너 탭 (`<base>/queue`) 으로 이동 → 툴바의 **"템플릿으로 생성"** 버튼 클릭 → 1차 모달 (`role="dialog"` 제목 "템플릿으로 큐 생성") 열림
5. 1차 모달의 **"불러오기" 탭** (기본) 하단 "전역(1)" 섹션에서 `"BMad Imple"` 템플릿의 `<label>` 내부 `input[type="radio"]` 를 클릭해 선택
6. 우하단 **"적용" 버튼** 클릭 → 1차 모달은 그대로 두고 **2차 "스토리" 모달이 겹쳐 열림** (미리보기 영역에 `{story_num}` 이 `1.1` 로 치환된 내용이 보여야 함). 기본적으로 모든 에픽/스토리가 체크된 상태(3/3)
7. 2차 모달의 **"에디터에 로드" 버튼** 클릭 → 두 모달 모두 닫히고 큐 편집기 textarea 가 채워짐
8. `document.querySelector('textarea[aria-label*="큐 스크립트"]').value` 로 에디터 내용 확인 — 길이 > 0, `1.1`/`1.2`/`2.1` 모두 포함, `{story_num}` 문자열 미포함
9. 상태 줄에 `"모든 스크립트 문법이 정상입니다."` 표시 확인 (`[role="status"]` 내)

**기대 결과**:
- `/queue/stories` API 가 3개 스토리 반환
- 2차 스토리 모달의 미리보기에 `{story_num}` → `1.1` 치환 확인
- 큐 편집기에 주입된 최종 스크립트 길이 > 1000자, 모든 스토리 번호 포함, 플레이스홀더 잔존 없음
- 상태 줄 "모든 스크립트 문법이 정상입니다."

> **버튼명 주의**: 시나리오 작성 시점 기준 1차 모달의 실행 버튼은 `"적용"`, 2차 모달은 `"에디터에 로드"` 이다. "생성" 버튼은 존재하지 않는다 (이전 시나리오 용어).

**엣지케이스**:
- E1. `prdSharded: false` + 단일 `docs/prd.md`: monolithic 파싱 fallback 경로로 동작하는지 확인. `core-config.yaml` 수정 후 테스트.
- E2. sharded 디렉토리에 `epic-{n}` 패턴 미매칭 파일 존재: Step 2 scan이 `.md` 파일 모두 읽어 Epic 헤더를 찾으므로 단일 epic 파일로 인식됨. (`queueTemplateController.ts:200-219` Step 2 로직)

### Q-03-02: 템플릿 관리 (CRUD)
**선행 조건**: BMad 프로젝트 `<slug>` 가 존재한다.

**절차 (REST API 경로 권장 — UI 경로는 다이얼로그 겹침으로 불안정)**:
1. `POST /api/projects/<slug>/queue/templates` body `{ name: 'Q-03-02 Test', template: '@new\n/BMad:agents:dev\n*develop-story {story_num}' }` → 응답 `201` + `{ id, name, template }` 반환. `id` 를 기록한다
2. `GET /api/projects/<slug>/queue/templates` → 배열에 방금 생성한 항목 포함 확인 (count ≥ 1)
3. `PUT /api/projects/<slug>/queue/templates/<id>` body `{ name: 'Q-03-02 Test UPDATED', template: '@new\n/BMad:agents:qa\n*review {story_num}' }` → 응답 `200` + 갱신된 객체 반환. `name` 이 새 값인지 검증
4. `DELETE /api/projects/<slug>/queue/templates/<id>` → 응답 `204 No Content`
5. 재조회 → 배열에서 해당 항목 사라짐 (count 원복)
6. OS 파일시스템에서 `<projectPath>/.hammoc/queue-templates.json` 읽어 본문이 빈 배열 `[]` 인지 확인

**기대 결과**:
- 201/200/204 응답 시퀀스
- `.hammoc/queue-templates.json` 이 CRUD 에 따라 실시간 업데이트
- 삭제 후 빈 배열로 원복

> **UI 경로 주의 (`fetch('/api/debug/kill-ws')` 기반 클라이언트 우회)**: 클라이언트 코드 [client.ts](../../packages/client/src/services/api/client.ts) 의 `request<T>` 가 모든 2xx 응답에 `response.json()` 을 호출하므로 `204 No Content` 응답이 `SyntaxError: Unexpected end of JSON` 로 throw 된다. 결과적으로 UI 의 "템플릿 삭제" 버튼이 실제로는 서버 삭제가 성공해도 프론트엔드에서 실패 토스트가 뜬다. 이 버그가 수정되기 전까지는 REST API 경로로 Q-03-02 를 검증하는 게 안전하다. 수정 후엔 UI 경로 테스트 추가.

---

## Q4. 스토리 워크플로우 `[EDGE]`

> **공통 전제 (BMad 스토리 카드가 보드에 나타나기 위한 조건)**:
> 1. BMad 초기화된 프로젝트 (`.bmad-core/` 존재)
> 2. 스토리 파일 위치: `docs/stories/` (또는 `.bmad-core/core-config.yaml`의 `devStoryLocation`)
> 3. 파일명 패턴: `^\d+\.\d+\..+\.md$` (예: `1.1.login.md`) — 일반 스토리. `BS-<num>-<slug>.md`는 standalone brownfield 전용 (부모 epic 없음).
> 4. 파일에 `## Status` 섹션 필수. 5가지 형식 지원 ([bmadStatusService.ts:470-473](../../packages/server/src/services/bmadStatusService.ts#L470-L473)):
>    - `## Status\n\nValue` (heading + 빈 줄 + 값)
>    - `## Status\nValue` (heading + 값)
>    - `## Status: Value` (inline)
>    - `Status: Value` (키-값)
>    - `**Status:** Value` (bold 키-값)
> 5. 파일 생성/수정 후 보드 새로고침 필요 — 현재 구현은 파일 변경 push 이벤트가 보드에 자동 반영되지 않음. 보드 탭 내에서 **헤더 우상단 `aria-label="새로고침"` 버튼 클릭** (F5 는 페이지 전체 리로드라 로그인이나 세션 상태까지 영향을 줄 수 있어 피한다) 이후 2초 대기 후 카드 상태를 재조회한다.
> 6. Status 값과 badge 매핑은 [constants.ts BADGE_DEFINITIONS](../../packages/client/src/components/board/constants.ts#L23)에 정의됨 (예: `Approved` → `approved`, `In Progress` → `in-progress`).

### Q-04-01: 개발 시작 → in-progress
**선행 조건**: BMad 프로젝트. `docs/stories/` 디렉토리 존재.

**절차**:
1. 파일 탐색기 또는 API로 `docs/stories/1.1.login.md` 생성:
   ```markdown
   # Story 1.1: Login

   ## Status

   Approved

   ## Story

   As a user, I want to log in.
   ```
2. 보드 탭으로 이동(또는 재진입) → "Story 1.1: Login" 카드가 `Approved`(초록) badge와 함께 표시되는지 확인
3. 카드의 "⋯" 메뉴 클릭 → "개발 시작" 항목 확인 후 클릭 ([CardContextMenu.tsx:62-66](../../packages/client/src/components/board/CardContextMenu.tsx#L62-L66))
4. [ProjectBoardPage.handleWorkflowAction](../../packages/client/src/pages/ProjectBoardPage.tsx#L200-L249) 가 먼저 `PATCH` 로 스토리 파일 status 를 `In Progress`로 업데이트하고, 새 세션 페이지로 네비게이션: URL `/project/:slug/session/<newId>?task=%25develop-story%201.1`
5. 세션 페이지 mount 시 task 쿼리 파라미터로 서버 스니펫 [develop-story](../../packages/server/src/snippets/develop-story) 를 호출 → `/BMad:agents:dev` 활성 + `*develop-story 1.1` 메시지가 자동 전송됨. **검증 방법**: `location.search` 는 mount 직후 즉시 빈 문자열로 클리어되므로 URL 기반 검증 불가. 대신 (a) 배지 `document.querySelector('[data-testid*="agent"]').textContent` 가 `"💻 Dev"` (b) 첫 user 메시지 텍스트에 `*develop-story 1.1` 포함 이 둘을 확인한다.
6. 배지 + 태스크 메시지 확인 후 **`browser_press_key("Escape")`** 로 SDK 실행을 즉시 중단 (Opus 런타임 비용 방지). abort 후 메시지 영역에 `"사용자가 응답을 취소했습니다"` 토스트가 보이면 정상.
7. 보드 탭으로 돌아가 `aria-label="새로고침"` 버튼 클릭 → 2초 대기 → 카드 badge 가 `In Progress`(파란색) 로 전환 + 카드가 Doing 컬럼으로 이동 확인
8. `docs/stories/1.1.login.md` 내용 확인 → `## Status` 값이 `Approved` → `In Progress` 로 덮어쓰기됨 ([issueService.ts updateStoryStatus](../../packages/server/src/services/issueService.ts#L504))

**기대 결과**:
- 파일 Status "In Progress"로 변경 (서버 PATCH 결과)
- 새 세션 생성 + `%develop-story 1.1` 태스크 자동 실행 (서버 스니펫 확장 후 Dev 에이전트가 `*develop-story 1.1` 즉시 시작)
- 보드 카드 badge "In Progress" + Doing 컬럼 이동

**설계 주의**:
- 현재 구현은 **스토리 파일에 세션 ID/링크를 별도로 저장하지 않음**. 세션은 생성되지만 "이 스토리의 Dev 세션" 메타데이터는 파일에 없음. BMad Dev 에이전트가 세션 실행 중 `Dev Agent Record` 섹션을 수동 기록할 수 있으나 Hammoc 자동 기능 아님.

### Q-04-02: QA 요청 → review
**선행 조건**: 스토리 파일이 `Ready for Review` 또는 `Ready for Done` status인 상태.

**절차**:
1. OS `Write` 또는 파일 탐색기로 `docs/stories/1.1.login.md` 의 `## Status` 값을 `Ready for Review` 로 수동 수정 (Dev 세션 완료 결과를 재현하는 가장 빠른 경로). 절차 5 의 `aria-label="새로고침"` 버튼으로 보드 반영
2. 보드 새로고침 → 카드 badge `Ready for Review`(노란색/주황 계열) + Review 컬럼 이동 확인
3. 카드의 `button[aria-haspopup]` 클릭 → 열리는 `[role="menu"]` 안에서 `[role="menuitem"]` 의 텍스트가 `"QA 리뷰 요청"` 하나만 노출되는지 확인 ([CardContextMenu.tsx:95-97](../../packages/client/src/components/board/CardContextMenu.tsx#L95-L97) — `workflow.reviewStory` 라벨, `ready-for-review` / `ready-for-done` / `qa-fixed` 상태에서 노출)
4. "QA 리뷰 요청" 메뉴 클릭 → URL 이 `/project/:slug/session/<newId>` 로 이동 (query `task=%25qa-review%201.1` 은 mount 직후 클리어됨)
5. 3초 대기 → (a) 배지 `"🧪 QA"` (b) 첫 user 메시지 텍스트에 `/BMad:agents:qa` 또는 `*review 1.1` 포함 을 검증. 서버 스니펫 [qa-review](../../packages/server/src/snippets/qa-review) 가 `/BMad:agents:qa` 활성 + `*review 1.1` 메시지로 확장해 QA 에이전트가 즉시 리뷰 실행 중
6. 배지 + 태스크 메시지 확인 후 **`browser_press_key("Escape")`** 로 SDK 실행 중단 (Opus 비용 방지)

**기대 결과**: QA 배지 활성 + `*review 1.1` 태스크 자동 주입. 세션 내에서 `docs/qa/gates/1.1-login.yml` (또는 유사) 생성되면 해당 status 가 카드 gate badge 에 반영됨 (다음 보드 새로고침 시). **실제 리뷰 실행 및 gate 파일 생성은 Q-04-03 에서 수동 주입으로 검증**하므로 여기서 abort 는 안전.

### Q-04-03: QA 결과 PASS / CONCERNS / FAIL
**선행 조건**: Q-04-02 진행 후 `docs/qa/gates/<story>.yml` gate 파일 존재.

> **Gate 파일 필수 키**: 실제 구현은 YAML 루트의 `gate:` 필드를 읽는다 (`status:` 아님). 예:
> ```yaml
> schema: 1
> story: '1.1'
> story_title: Login form
> gate: PASS          # PASS / CONCERNS / FAIL / WAIVED
> reviewer: Quinn (Test Architect)
> ```

**절차 (PASS 경로)**:
1. OS `Write` 로 `docs/qa/gates/1.1-login.yml` 생성:
   ```yaml
   schema: 1
   story: '1.1'
   story_title: Login
   gate: PASS
   reviewer: Quinn (Test Architect)
   ```
2. 보드 탭에서 `aria-label="새로고침"` 클릭 → 2초 대기 → 카드 badge 가 `QA Passed`(초록) 로 전환되는지 확인
3. 카드의 `button[aria-haspopup]` 클릭 → 메뉴에 3개 항목 노출되는지 확인: `"커밋 후 스토리 완료"` / `"스토리 완료"` / `"QA 재요청"` ([CardContextMenu.tsx:79-92](../../packages/client/src/components/board/CardContextMenu.tsx#L79-L92))
4. (옵션, SDK 비용 감수) "스토리 완료" 클릭 → 새 세션 (URL: `/project/:slug/session/<newId>`) 이동 → 배지 `"💻 Dev"` + 첫 user 메시지에 mark-done 관련 텍스트 주입 확인 후 Escape abort. 서버 스니펫 [mark-done](../../packages/server/src/snippets/mark-done) 이 `/BMad:agents:dev` + `Update story 1.1 status to Done. The QA gate has passed.` 자연어 메시지로 확장한다. "커밋 후 스토리 완료" 도 동일 경로 (`%commit-and-done 1.1`).

**절차 (CONCERNS / FAIL 경로)**:
1. Q-04-03 PASS 검증 직후, 같은 gate 파일을 `gate: CONCERNS` (또는 `FAIL`) 로 덮어쓴다 (Write 로 재기록)
2. 보드 새로고침 → 카드 badge 가 `QA Concerns` (또는 `QA Failed`) 로 전환되는지 확인
3. 카드 메뉴 재오픈 → menuitem 1개 `"QA 반영"` 만 노출되는지 확인 (PASS 경로의 3개 메뉴가 사라졌는지가 핵심 분기 증거)
4. (옵션) "QA 반영" 클릭 → 새 세션 배지 `"💻 Dev"` + 첫 user 메시지에 `*review-qa 1.1` 또는 `apply-qa-fixes` 관련 텍스트 주입 확인 후 abort. 서버 스니펫 [apply-qa-fixes](../../packages/server/src/snippets/apply-qa-fixes) 가 Dev 에이전트 + `*review-qa 1.1` + "After completing QA fixes, update the gate YAML file's gate field to 'FIXED'." 문구로 확장

**기대 결과**:
- PASS → Done 이동 가능 (Dev 에이전트가 파일 status `Done`으로 업데이트, `%mark-done` 태스크로 처리됨)
- CONCERNS/FAIL → 수정 플로우 진입. 관련 이슈 자동 생성은 **현재 구현 확인 필요** — `%apply-qa-fixes`는 Dev Agent가 실행하는 태스크이며 Hammoc이 자동으로 `docs/issues/`에 카드를 만드는지 여부는 검증 필요.

**엣지케이스**:
- E1. QA gate 없이 Done 시도: `qa-passed`/`qa-waived` 상태에서만 "스토리 완료" 메뉴가 노출됨 (자연스럽게 막힘). status를 수동으로 `Done`으로 설정하는 우회는 가능하나 UI 메뉴 경로로는 제어됨.
- E2. 동일 스토리에 Dev + QA 세션 동시 진행: 각각 다른 세션 ID로 생성되므로 파일 일관성은 BMad 에이전트의 lock/Dev Agent Record 규약에 의존. Hammoc 자체 직렬화 없음.
