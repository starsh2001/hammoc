# K. Git

**범위**: 상태 확인, Stage & Commit, 브랜치, Push/Pull. Diff 렌더 상세는 S4.
**선행 도메인**: A, B. 테스트 프로젝트가 git 저장소여야 함.

---

## K1. Git 상태 & Diff 확인 `[CORE]`

### K-01-01: 상태 리스트
**절차**:
1. 파일 탐색기 탭에서 임의 파일 하나 열어 한 줄 추가 후 저장 (staged 예상), 새 파일 `k-01-untracked.txt` 생성 (untracked 예상)
   또는 새 세션에서 "Append a line 'test-K-01' to README.md and create a new file k-01-untracked.txt with content 'hello'." 프롬프트 전송 + 권한 Allow 로 파일 시스템 변경 유도
2. Git 탭 진입
**기대 결과**:
- Staged / Unstaged / Untracked 섹션별 파일 리스트
- 각 파일 클릭 시 Diff 뷰어(S4) 로드

### K-01-02: 바이너리 파일 diff
**기대 결과**: "Binary file differs" 메시지, 렌더 오류 없음.

**엣지케이스**:
- E1. 대용량 변경(1000+ 파일): 지연 없이 렌더링
- E2. git 저장소가 아닌 프로젝트: 안내 메시지 + "Initialize repo" 버튼

---

## K2. Stage & Commit `[CORE]`

### K-02-01: 파일 스테이징
**절차**: Unstaged 파일 체크박스 클릭 → Staged 로 이동.
**기대 결과**: 서버 `git add` 실행, 리스트 즉시 갱신.

### K-02-02: 커밋
**절차**: 메시지 입력 → "Commit".
**기대 결과**:
- `git commit` 실행
- 성공 시 커밋 히스토리에 반영, 스테이지 영역 비움
- 빈 메시지 시 버튼 비활성

**엣지케이스**:
- E1. pre-commit 훅 실패: 오류 메시지 그대로 노출

---

## K3. 브랜치 · Push / Pull `[EDGE]`

### K-03-01: 브랜치 전환
**절차**:
1. **선행 브랜치 준비** — K-03-02를 먼저 수행하여 `test-branch` 존재 보장
2. 브랜치 드롭다운 클릭 → `main` 선택 → 파일 트리 재로드 확인
3. 드롭다운 → `test-branch` 선택 → 헤더 배지가 `test-branch`로 변경 확인
4. `browser_evaluate("() => fetch('/api/projects/<slug>/git/status').then(r => r.json())")` → `branch: "test-branch"` 검증

**기대 결과**: 파일 트리 재로드, 현재 브랜치 표시 업데이트.

### K-03-02: 새 브랜치 생성
**절차**:
1. Git 탭 → "새 브랜치" 버튼 클릭
2. 이름 `test-branch` 입력 → "생성" 클릭
3. `browser_snapshot` → 현재 브랜치 배지가 `test-branch`로 전환 확인
4. **이름 유효성** — "새 브랜치" 재오픈 → 이름 `invalid name!` 입력 → 버튼 비활성 또는 오류 메시지 확인

**기대 결과**: 현재 브랜치에서 분기, 이름 유효성 검사 동작.

### K-03-03: Push / Pull
**절차**:
1. **테스트 bare 원격 준비** — 터미널 탭에서 아래 명령 실행 (`browser_type`으로 PTY 주입):
   ```bash
   mkdir -p /tmp/hammoc-remote.git && git init --bare /tmp/hammoc-remote.git
   git -C <프로젝트경로> remote remove origin 2>/dev/null; git -C <프로젝트경로> remote add origin /tmp/hammoc-remote.git
   ```
2. Git 탭 → Push 버튼 클릭 → 성공 토스트 확인
3. `browser_evaluate` fetch로 최신 커밋 해시 기록
4. 터미널에서 원격을 다른 clone으로 pull 후 새 커밋 생성 → 다시 push
5. Hammoc Git 탭 → Pull 버튼 → 새 커밋 히스토리 반영 확인
6. **인증 실패** — 원격 URL을 `https://invalid.invalid/repo.git`로 임시 변경 후 Push → 오류 메시지 노출 확인
7. **정리** — `git remote set-url origin <원래값>` 또는 `git remote remove origin`

**기대 결과**:
- Push: 원격 `refs/heads/main` 업데이트
- Pull: 로컬 히스토리 갱신
- 인증 실패: 명확한 오류 메시지
