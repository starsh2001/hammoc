# H. 큐 러너 (배치 자동화)

**범위**: 큐 문법, 실행/일시정지/재개, 중단, PRD→Queue, 실행 중 이벤트.
**선행 도메인**: A, B. 큐 실행 테스트는 C (채팅) 기능이 살아있어야 함.

---

## H1. 큐 문법 파싱 `[CORE]`

### H-01-01: 기본 문법 검증
**절차**: 큐 편집기에 다음 스크립트 입력 → "파싱" 또는 실행:
```
# Comment line
@new
Hello 1
@model claude-haiku-4-5
@delay 2000
Hello 2
@save session-A
@loop max=2
  Inside loop {iteration}
@end
```

**기대 결과**:
- 주석 무시
- `@new` → 새 세션 블록 시작
- `@model` → 모델 전환
- `@delay 2000` → 2초 대기
- `@save` → 세션 저장
- `@loop max=2 ... @end` → 블록 2회 반복, `{iteration}` 치환

### H-01-02: `@load` 세션 참조
**절차**: `@save foo` 이후 별도 큐에서 `@load foo` 사용.
**기대 결과**: 저장된 세션에서 이어서 실행.

**엣지케이스**:
- E1. 존재하지 않는 이름 참조 → 실행 시 명확한 오류
- E2. `@loop` 중첩 또는 비대칭 `@end` → 파싱 단계에서 오류

---

## H2. 큐 실행 / 일시정지 / 재개 `[ASYNC] [SDK]`

### H-02-01: 실행 & 진행률 배너
**절차**: 유효한 큐 입력 → "Run" 버튼 또는 Ctrl+Enter.
**기대 결과**:
- `queue:start` 이벤트
- QueueLockedBanner: 현재 항목 인덱스 + 진행률
- 각 항목 완료 시 `queue:itemComplete` + 세션 ID 링크

### H-02-02: 일시정지 & 편집 & 재개
**절차**:
1. 실행 중 "Pause" → 현재 항목 완료까지 대기
2. 편집기에서 미실행 항목 수정 / 추가
3. "Resume"

**기대 결과**:
- 상태: running → (isPauseRequested) → paused
- 편집 가능 상태 진입 (`queue:editStart`)
- Resume 시 수정된 리스트로 다음 항목부터 계속

---

## H3. 큐 중단 & 상태 리셋 `[EDGE]`

### H-03-01: 실행 중 Abort
**절차**: 실행 중 "Abort" → 확인 → 즉시 중지.
**기대 결과**:
- `queue:abort` → 현재 스트림도 함께 abort
- 배너 닫기 가능, 편집기 원상 복귀

**엣지케이스**:
- E1. 권한 프롬프트 대기 중 abort: 모달 닫히고 권한 요청 취소
- E2. `@delay` 대기 중 abort: 즉시 해제

---

## H4. PRD → Queue 자동 생성 `[CORE]`

### H-04-01: BMad PRD 파싱
**절차**:
1. **BMad 프로젝트 준비** — B-02-02로 BMad 프로젝트 생성
2. **PRD 파일 주입** — 파일 탐색기 탭에서 `docs/prd.md` 생성 후 아래 내용 저장 (또는 `browser_evaluate` fetch로 POST):
   ```markdown
   # PRD

   ## Epic 1: Login Flow
   ### Story 1.1: Email input validation
   ### Story 1.2: Password strength meter

   ## Epic 2: Dashboard
   ### Story 2.1: Stats cards
   ```
3. 큐 탭 → "PRD에서 생성" 클릭
4. `browser_snapshot` → Story 1.1 / 1.2 / 2.1 목록 표시 확인
5. 기본 템플릿 선택 → "생성" → 큐 편집기에 스크립트 채워짐 확인
6. `browser_evaluate` fetch로 `/api/projects/<slug>/fs/raw?path=.hammoc/queue-templates.json` → 저장 확인

**기대 결과**:
- Story 1.1 ~ 2.1 추출
- 템플릿 치환자 `{story_num}`, `{epic_num}`, `{story_title}` 적용
- 큐 편집기에 스크립트 채움, `queue-templates.json` 저장

**엣지케이스**:
- E1. PRD 형식 불일치(빈 에픽): 경고와 함께 빈 스토리 제외
- E2. 특수문자/대소문자 혼용

---

## H5. 실행 중 권한 · 예산 이벤트 `[SDK] [EDGE]`

### H-05-01: 큐 실행 중 권한 요청 발생
**절차**: 파일 편집 권한을 필요로 하는 큐 항목 실행.
**기대 결과**:
- 권한 모달 등장
- 모달 응답 전까지 다음 항목 대기
- Allow → 계속, Deny → 해당 항목 실패 기록 후 다음 진행 (설정에 따름)

### H-05-02: 큐 실행 중 Budget 초과
**절차**:
1. Settings → Advanced → Max Budget 원래 값 기록 → `0.01` 입력 → 저장
2. 큐 탭으로 이동 → 긴 응답 유도 항목 3개로 구성된 큐 생성 (각 항목: "Write a detailed 1000-word essay on topic N.")
3. 실행 시작 → 진행 상태 모니터링
4. 초과 감지 시 큐 전체 중단 + "Budget exceeded" 사유 표시 확인
5. **정리** — Max Budget 을 원래 값으로 복원

**기대 결과**: 초과 감지 즉시 큐 전체 중단 + 명확한 사유 표시.

### H-05-03: 네트워크 끊김 & 복구
**절차**:
1. 3개 항목이 담긴 큐 실행 시작 → 1번째 항목 응답 수신 대기
2. 1번째 완료 직후 R-websocket의 표준 끊김 절차 실행:
   ```js
   browser_evaluate(`() => {
     Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
     window.dispatchEvent(new Event('offline'));
   }`)
   ```
3. 3초 대기 후 `online` 이벤트 디스패치로 복구
4. 큐 진행 상태 모니터링 → 2번째 항목부터 이어서 실행되는지 확인
5. 완료 후 세션 히스토리 검사 → 1번째 항목이 중복 전송되지 않았는지 확인 (`messageId` 유니크)

**기대 결과**: 재연결 후 미완료 항목부터 재개, 중복 전송 없음.
