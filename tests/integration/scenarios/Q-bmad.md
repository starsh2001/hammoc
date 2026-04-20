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
4. 모달의 "확인" 버튼 클릭 → `POST /api/projects/:slug/setup-bmad` 호출
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
**절차**: ChatHeader 에이전트 드롭다운에서 각각 선택 → 간단한 프롬프트 전송.
**기대 결과**:
- 활성 에이전트 배지 변경
- 시스템 프롬프트가 에이전트 역할에 맞게 교체 (응답 성격 차이로 간접 검증)
- 슬래시 팔레트에 에이전트 전용 명령 노출

### Q-02-02: 활성 에이전트 글로벌 저장
**기대 결과**: 세션 전환 후에도 마지막 선택 유지.

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
1. 파일 탐색기 또는 API로 `docs/prd/epic-1-auth.md` 생성:
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
3. 큐 러너 탭으로 이동 → "템플릿으로 생성"(또는 "Generate from PRD") 클릭
4. `GET /api/projects/:slug/queue/stories` 호출되어 미리보기에 Story 1.1, 1.2, 2.1이 노출되는지 확인
5. 기본 템플릿 선택 → "생성" 클릭 → 큐 편집기에 스크립트가 주입되고 `{story_num}` 플레이스홀더가 치환되었는지 확인

**기대 결과**:
- Epic/Story 리스트 미리보기 (Story 1.1, 1.2, 2.1)
- 템플릿 플레이스홀더 치환
- 큐 편집기에 결과 주입 + "모든 스크립트 문법이 정상입니다" 표시

**엣지케이스**:
- E1. `prdSharded: false` + 단일 `docs/prd.md`: monolithic 파싱 fallback 경로로 동작하는지 확인. `core-config.yaml` 수정 후 테스트.
- E2. sharded 디렉토리에 `epic-{n}` 패턴 미매칭 파일 존재: Step 2 scan이 `.md` 파일 모두 읽어 Epic 헤더를 찾으므로 단일 epic 파일로 인식됨. (`queueTemplateController.ts:200-219` Step 2 로직)

### Q-03-02: 템플릿 관리
**기대 결과**: 커스텀 템플릿 저장/수정/삭제, `.hammoc/queue-templates.json` 반영.

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
> 5. 파일 생성/수정 후 보드 새로고침(F5 또는 보드 탭 재진입) 필요 — 현재 구현은 파일 변경 push 이벤트가 보드에 자동 반영되지 않음.
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
3. 카드의 "⋯" 메뉴 클릭 → "Start Development" 항목 확인 후 클릭 ([CardContextMenu.tsx:62-66](../../packages/client/src/components/board/CardContextMenu.tsx#L62-L66))
4. 자동으로 새 세션 페이지로 네비게이션됨: URL은 `/project/:slug/session/<newId>?task=%25develop-story%201.1`
5. 보드 탭으로 돌아가 새로고침 → 카드 badge가 `In Progress`(파란색)로 전환 확인
6. `docs/stories/1.1.login.md` 내용 확인 → `## Status` 값이 `Approved` → `In Progress`로 덮어쓰기됨 ([issueService.ts updateStoryStatus](../../packages/server/src/services/issueService.ts#L504))

**기대 결과**:
- 파일 Status "In Progress"로 변경
- 새 세션 생성 + 입력바에 `%develop-story 1.1` 태스크 자동 주입
- 보드 카드 badge "In Progress"

**설계 주의**:
- 현재 구현은 **스토리 파일에 세션 ID/링크를 별도로 저장하지 않음**. 세션은 생성되지만 "이 스토리의 Dev 세션" 메타데이터는 파일에 없음. BMad Dev 에이전트가 세션 실행 중 `Dev Agent Record` 섹션을 수동 기록할 수 있으나 Hammoc 자동 기능 아님.

### Q-04-02: QA 요청 → review
**선행 조건**: 스토리 파일이 `Ready for Review` 또는 `Ready for Done` status인 상태.

**절차**:
1. 파일 탐색기에서 `docs/stories/1.1.login.md`의 `## Status`를 `Ready for Review`로 수동 수정 (또는 Dev 세션이 완료 시 Dev 에이전트가 수정)
2. 보드 새로고침 → 카드 badge `Ready for Review`(노란색/주황 계열) 확인
3. 메뉴 → "Review Story" 클릭 ([CardContextMenu.tsx:95-97](../../packages/client/src/components/board/CardContextMenu.tsx#L95-L97))
4. 새 세션 생성 + `%qa-review 1.1` 태스크 자동 주입

**기대 결과**: QA Agent가 리뷰 수행. 세션 내에서 `docs/qa/gates/1.1-login.yml`(또는 유사) 생성되면 해당 status가 카드 gate badge에 반영됨 (다음 보드 새로고침 시).

### Q-04-03: QA 결과 PASS / CONCERNS / FAIL
**선행 조건**: Q-04-02 진행 후 `docs/qa/gates/<story>.yml` gate 파일 존재.

**절차 (PASS 경로)**:
1. gate 파일 수동 주입 (또는 QA 세션 결과):
   ```yaml
   status: PASS
   ```
2. 보드 새로고침 → 카드 badge `QA Passed`(초록)
3. 메뉴에 "Commit & Complete Story" 또는 "Complete Story" 노출 ([CardContextMenu.tsx:79-86](../../packages/client/src/components/board/CardContextMenu.tsx#L79-L86))
4. 클릭 → `%mark-done 1.1` 태스크 주입

**절차 (CONCERNS / FAIL 경로)**:
- gate `status: CONCERNS` 또는 `FAIL` → 카드 badge `QA Concerns` / `QA Failed`
- 메뉴 → "Apply QA Fix" → `%apply-qa-fixes 1.1` 태스크 주입

**기대 결과**:
- PASS → Done 이동 가능 (파일 status `Done`으로 업데이트, `mark-done` 태스크로 처리됨)
- CONCERNS/FAIL → 수정 플로우 진입. 관련 이슈 자동 생성은 **현재 구현 확인 필요** — `%apply-qa-fixes`는 Dev Agent가 실행하는 태스크이며 Hammoc이 자동으로 `docs/issues/`에 카드를 만드는지 여부는 검증 필요.

**엣지케이스**:
- E1. QA gate 없이 Done 시도: `qa-passed`/`qa-waived` 상태에서만 "Complete Story" 메뉴가 노출됨 (자연스럽게 막힘). status를 수동으로 `Done`으로 설정하는 우회는 가능하나 UI 메뉴 경로로는 제어됨.
- E2. 동일 스토리에 Dev + QA 세션 동시 진행: 각각 다른 세션 ID로 생성되므로 파일 일관성은 BMad 에이전트의 lock/Dev Agent Record 규약에 의존. Hammoc 자체 직렬화 없음.
