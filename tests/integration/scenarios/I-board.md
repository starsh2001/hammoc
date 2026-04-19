# I. 보드 & 이슈

**범위**: 칸반/리스트, 이슈 CRUD, 상태 전이, 에픽·스토리 진행률.
**선행 도메인**: A, B.

---

## I1. 칸반 / 리스트 뷰 전환 `[CORE] [MOBILE]`

### I-01-01: 뷰 토글
**절차**: 보드 탭 진입 → 우측 상단 뷰 토글 버튼 클릭.
**기대 결과**:
- 칸반: 상태 컬럼 표시
- 리스트: 행 기반 표시
- 선택 상태 저장(재진입 시 복원)

### I-01-02: 모바일 뷰
**선행 조건**: 뷰포트 400px (`browser_resize(width=400, height=800)`).
**기대 결과**: 컬럼 가로 스크롤, 터치 드래그 가능.

---

## I2. 이슈 CRUD `[CORE]`

### I-02-01: 이슈 생성
**절차**:
1. "+" 버튼 → 제목/설명/심각도/타입 입력
2. "생성"

**기대 결과**:
- `docs/issues/ISSUE-<N>.md` 에 파일 생성
- Open 컬럼에 카드 등장
- 유효성: 제목 비어있으면 버튼 비활성

### I-02-02: 이슈 편집 (제목·심각도·설명)
**기대 결과**: 저장 즉시 카드 갱신, 새로고침 후 유지.

### I-02-03: 이슈 삭제
**기대 결과**: 파일 삭제, 보드에서 제거.

### I-02-04: non-BMad 프로젝트 이슈 보드 표시 `[CORE]`
> 회귀 방지. `issueService.getBoard`가 `bmadStatusService.scanProject`의 `NOT_BMAD_PROJECT` 에러를 catch하면서 일반 이슈까지 삭제됐던 버그 (fix 7043f83).

**선행 조건**: `.bmad-core/core-config.yaml`이 없는 non-BMad 프로젝트.

**절차**:
1. non-BMad 프로젝트 보드 탭 진입
2. I-02-01 절차로 이슈 1개 생성
3. `browser_snapshot` → Open 컬럼에 이슈 카드 확인
4. 페이지 새로고침 후 재확인
5. `fetch('/api/projects/<slug>/board')` → `items` 배열에 생성한 이슈 포함 검증

**기대 결과**:
- non-BMad 프로젝트에서도 이슈가 보드에 정상 표시
- `items` 배열이 비어있지 않음 (BMad 스캔 실패와 무관)

---

## I3. 상태 전이 드래그드롭 `[EDGE] [DnD]`

### I-03-01: 카드 이동으로 상태 변경
**절차**:
1. 테스트 이슈 1개 생성 (I-02-01 절차), Open 컬럼에 카드 존재 확인
2. `browser_evaluate`로 HTML5 DnD 이벤트를 Open 카드 → In Progress 컬럼으로 디스패치:
   ```js
   browser_evaluate(`() => {
     const card = document.querySelector('[data-testid="board-card"][data-status="open"]');
     const dropCol = document.querySelector('[data-testid="board-column"][data-status="in-progress"]');
     const dt = new DataTransfer();
     card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
     dropCol.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
     dropCol.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
     card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
     return true;
   }`)
   ```
3. `browser_snapshot` → 카드가 "In Progress" 컬럼에 위치 확인
4. `fetch('/api/projects/<slug>/board/issues')` → 해당 이슈의 `status === 'in-progress'` 검증

**기대 결과**:
- 상태 자동 변경 (status=in-progress)
- 서버 저장 및 다중 탭 동기화

### I-03-02: 워크플로우 규칙 검증
**기대 결과**:
- BMad 프로젝트: Draft → Approved → In Progress → Review → Done 경로 강제
- 비허용 경로(예: Open → Done 직행) 시도 시 경고 또는 거부

### I-03-03: 동시 편집 (다중 탭)
**절차**: 두 탭에서 같은 카드 편집.
**기대 결과**: 마지막 저장 우선 또는 충돌 경고.

---

## I4. 에픽 · 스토리 진행률 `[CORE]`

> **설계 원칙**: 보드 UI "+" 버튼은 이슈 전용.
> - **non-BMad 프로젝트**: 이슈만 생성 가능, 에픽/스토리 생성 UI 없음 (의도된 설계)
> - **BMad 프로젝트**: 에픽/스토리는 파일 기반 (`docs/stories/*.md`)으로 관리. `/sm` 에이전트 또는 파일 직접 추가로 생성하며 보드는 이를 읽어 표시

### I-04-01: 진행률 막대
> BMad 프로젝트 전용. 기존 BMad 프로젝트(예: `hammoc`)에서 실행할 것.

**선행 조건**: BMad 프로젝트에 에픽 1개 + 스토리 3개(Draft/InProgress/Done 각 1개)가 `docs/stories/`에 존재해야 함. 부족하면 실제 파일 생성으로 준비.

**스토리 파일 예시** (`docs/stories/99.1.story.md`):
```markdown
# Story 99.1: Story A
## Status
Draft
```
(99.2 = `In Progress`, 99.3 = `Done` 로 2개 더 생성)

**절차**:
1. BMad 프로젝트 보드 탭 진입
2. `browser_snapshot` → Epic 99 카드의 진행률 표시 확인
3. 필요 시 `fetch('/api/projects/<slug>/board')` → epic 항목의 진행 관련 필드 검증

**기대 결과**: Epic 99 카드의 진행률 ≈ 33% (3개 중 1개 완료).

**테스트 후 정리**: 생성한 `docs/stories/99.*.md` 파일 삭제.

### I-04-03: non-BMad 프로젝트 에픽/스토리 생성 UI 부재 (설계 검증) `[CORE]`
**절차**:
1. non-BMad 프로젝트 보드 탭 진입
2. "+" 버튼 클릭 → 이슈 생성 다이얼로그 확인
3. 타입 선택지 확인

**기대 결과**:
- 타입 선택지는 `bug`, `improvement`만 존재 (Epic/Story 없음 — 의도된 설계)
- 에픽/스토리 생성 UI 없음

### I-04-02: 고아 이슈 / 순환 참조
**엣지케이스**:
- E1. 에픽 없는 이슈: 별도 섹션에 표시
- E2. 상호 참조 감지 시 경고 로그
