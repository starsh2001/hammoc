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
**절차**: 비-BMad 프로젝트에서 "BMad 초기화" 메뉴 실행.
**기대 결과**: 기존 파일 보존, `.bmad-core/` 만 추가.

**엣지케이스**:
- E1. 버전 다운로드 실패(네트워크): 롤백 + 명확한 오류
- E2. 이미 `.bmad-core/` 존재: 덮어쓰기 확인 모달

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

### Q-03-01: PRD 파싱 & 스토리 추출
**선행 조건**: `.bmad-core/PRD.md` 에 Epic/Story 구조 존재.
**절차**: 큐 탭 → "Generate from PRD" → 템플릿 선택 → 생성.
**기대 결과**:
- Epic/Story 리스트 미리보기
- 템플릿 플레이스홀더 치환 확인
- 큐 편집기에 결과 주입

### Q-03-02: 템플릿 관리
**기대 결과**: 커스텀 템플릿 저장/수정/삭제, `.hammoc/queue-templates.json` 반영.

---

## Q4. 스토리 워크플로우 `[EDGE]`

### Q-04-01: 개발 시작 → in-progress
**절차**: 보드에서 스토리 카드 메뉴 → "Start Development".
**기대 결과**:
- 상태 in-progress
- 연결된 개발 세션 링크 저장

### Q-04-02: QA 요청 → review
**기대 결과**: QA 세션 생성, gate 상태 "pending" 표시.

### Q-04-03: QA 결과 PASS / CONCERNS / FAIL
**기대 결과**:
- PASS → Done 이동 가능
- CONCERNS/FAIL → "수정 적용" 흐름 진입, 관련 이슈 자동 생성

**엣지케이스**:
- E1. QA 없이 Done 직행 시도: 경고 또는 거부
- E2. 개발/QA 동시 진행 충돌
