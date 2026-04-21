# K. Git

**범위**: 상태 확인, Stage & Commit, 브랜치, Push/Pull. Diff 렌더 상세는 S4.
**선행 도메인**: A, B. 테스트 프로젝트가 git 저장소여야 함.

---

## K1. Git 상태 & Diff 확인 `[CORE]`

### K-01-01: 상태 리스트
**선행 조건**: 테스트 프로젝트가 git 저장소. K 도메인 시작 전 Bash로 아래 상태를 미리 만들어둔다.
```bash
PROJ=<프로젝트경로>
# staged: README.md 수정 후 git add
echo "## K-01 test" >> "$PROJ/README.md" && git -C "$PROJ" add README.md
# unstaged: sample.txt 수정 (git add 안 함)
echo "unstaged line" >> "$PROJ/sample.txt"
# untracked: 새 파일 생성
echo "hello" > "$PROJ/k-01-untracked.txt"
```

**절차**:
1. Git 탭 진입
2. `browser_snapshot` → Staged / Unstaged(변경사항) / Untracked(추적되지 않음) 3섹션 확인
3. Staged 섹션의 `README.md` 버튼 클릭
4. 슬라이드 패널 오픈 확인 → `browser_evaluate("() => !!document.querySelector('[aria-label*=\"Diff viewer\"]')")` → `true`
5. Diff 내용에 추가된 줄(`## K-01 test`) 포함 확인

**기대 결과**:
- 3섹션 모두 표시, 각 파일에 상태 배지(`M` / `?`) 표시
- 파일 클릭 시 오른쪽에 슬라이드 패널로 Diff 뷰어 로드
- Backdrop 클릭 또는 Escape 키로 패널 닫힘

**테스트 함정 (Pitfall)**:
- Diff 패널이 열린 상태에서 backdrop(`fixed inset-0 bg-black/30`)이 UI를 가려 다른 버튼 클릭이 차단됨 → 다음 단계 전 패널 닫을 것 (`browser_press_key('Escape')`)

---

### K-01-02: 바이너리 파일 diff
**선행 조건**: K-01-01이 실행되었거나, 테스트 프로젝트에 바이너리 파일이 staged 상태.

**절차**:
1. Bash로 바이너리 파일 생성 및 staged 상태로 만들기:
   ```bash
   printf '\x00\x01\x02\x03\xFF\xFE\x00' > <프로젝트경로>/binary-test.bin
   git -C <프로젝트경로> add binary-test.bin
   ```
2. Git 탭에서 Staged 섹션에 `binary-test.bin` 표시 확인 (배지: `A`)
3. `binary-test.bin` 버튼 클릭
4. 슬라이드 패널 확인:
   ```js
   browser_evaluate(`() => {
     const notice = document.querySelector('[data-testid="git-diff-binary-notice"]');
     return notice?.textContent?.trim() || null;
   }`)
   ```
   → `"바이너리 파일이 변경되었습니다"` 포함 확인

**기대 결과**: "바이너리 파일이 변경되었습니다" 메시지 표시, 렌더 오류 없음.

**엣지케이스**:
- E1. 대용량 변경(1000+ 파일): Bash로 파일 대량 생성 후 `git add .`, 섹션 로드 지연 없음 확인
- E2. git 저장소가 아닌 프로젝트: Git 탭에 "Initialize repo" 버튼(`git.initButton` i18n key) 표시 확인

---

## K2. Stage & Commit `[CORE]`

### K-02-01: 파일 스테이징
**선행 조건**: K-01-01 Bash 선행 준비 완료 상태 (unstaged `sample.txt`, untracked `k-01-untracked.txt` 존재).

**절차**:
1. Git 탭 → "변경사항" 섹션에서 `sample.txt` 옆 "스테이지" 버튼 클릭
2. API로 staged 배열 확인:
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/git/status', { credentials: 'include' })
     .then(r=>r.json()).then(d=>({ staged: d.staged.map(f=>f.path), unstaged: d.unstaged.map(f=>f.path) }))`)
   ```
   → `staged`에 `sample.txt` 포함, `unstaged`에서 제거 확인
3. "변경사항" 섹션 헤더의 "전체" 버튼 클릭 → 모든 unstaged 파일 일괄 staged
4. 다시 API 확인 → `unstaged: []`

**기대 결과**: 파일이 Staged 섹션으로 이동, 서버 `git add` 실행, 리스트 즉시 갱신.

**테스트 함정 (Pitfall)**:
- UI에 "체크박스"가 아닌 각 파일 옆 "스테이지" 버튼과 섹션 헤더의 "전체" 버튼이 있음
- 섹션 헤더의 "전체"는 accessibility tree 상 nested button 처럼 보이지만 **실제 DOM 은 `<span role="button">`**. HTML 사양상 button 안에 button 을 넣을 수 없어서 span 으로 구현됨. 따라서 `sectionBtn.querySelector('button')` 로는 찾지 못하고 `sectionBtn.querySelector('span[role="button"]')` 로 찾아야 클릭 가능.
- 버튼 클릭 시 포인터 이벤트가 diff 패널 backdrop 에 가로채일 수 있음 → 패널이 닫혀 있는지 먼저 확인

---

### K-02-02: 커밋
**선행 조건**: Staged 파일이 최소 1개 이상 (K-02-01 수행 후).

**절차**:
1. **빈 메시지 비활성 확인**:
   ```js
   browser_evaluate(`() => {
     const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '커밋');
     return btn?.disabled;
   }`)
   ```
   → `true` 확인 (staged 있어도 메시지 없으면 비활성)

2. 커밋 메시지 textarea에 입력:
   ```js
   browser_evaluate(`() => {
     const ta = document.querySelector('textarea[placeholder*="커밋 메시지"]');
     const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
     setter.call(ta, 'test: K-02-02 commit');
     ta.dispatchEvent(new Event('input', { bubbles: true }));
   }`)
   ```

3. 커밋 버튼 활성화 확인 후 클릭:
   ```js
   browser_evaluate(`() => {
     const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '커밋');
     if (btn && !btn.disabled) { btn.click(); return 'clicked'; }
     return 'disabled';
   }`)
   ```

4. 커밋 완료 확인 (staged 영역 비워짐 + 히스토리 갱신):
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/git/log', { credentials: 'include' })
     .then(r=>r.json()).then(d=>d.commits[0].message)`)
   ```
   → `"test: K-02-02 commit"` 반환 확인

**기대 결과**:
- 빈 메시지: 커밋 버튼 비활성
- 커밋 성공: staged 영역 비워짐, 커밋 히스토리 첫 항목에 해당 메시지 표시

**엣지케이스**:
- E1. pre-commit 훅 실패: Git 탭 에러 배너(빨간 배너)에 훅 출력 메시지 표시 확인

---

## K3. 브랜치 · Push / Pull `[EDGE]`

### K-03-01: 브랜치 전환
**선행 조건**: K-03-02를 먼저 수행하여 `test-branch` 존재 보장.

**절차**:
1. API로 현재 기본 브랜치 이름 확인:
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/git/branches', { credentials: 'include' })
     .then(r=>r.json()).then(d=>d.current)`)
   ```
   → 반환값을 `<default-branch>`로 기록 (`master` 또는 `main`, 환경마다 다름)

2. 브랜치 드롭다운 클릭 → `<default-branch>` 항목 클릭:
   ```js
   browser_evaluate(`() => {
     const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
     let node;
     while (node = walker.nextNode()) {
       if (node.textContent.trim() === '<default-branch>') {
         node.parentElement.closest('li, [role="option"]')?.click();
         return 'clicked';
       }
     }
     return 'not found';
   }`)
   ```
   - 미커밋 변경사항 있으면 확인 다이얼로그 출현 → "전환" 클릭:
     ```js
     browser_evaluate(`() => {
       const btn = Array.from(document.querySelectorAll('[role="dialog"] button'))
         .find(b => b.textContent.trim() === '전환');
       btn?.click(); return !!btn;
     }`)
     ```
   - `browser_wait_for` → 브랜치 드롭다운에 `<default-branch>` 표시

3. 드롭다운 재오픈 → `test-branch` 항목 클릭 (동일 패턴)
4. API로 최종 확인:
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/git/status', { credentials: 'include' })
     .then(r=>r.json()).then(d=>d.branch)`)
   ```
   → `"test-branch"` 확인

**기대 결과**: 현재 브랜치 드롭다운 텍스트 갱신, API `branch` 필드 일치.

**테스트 함정 (Pitfall)**:
- 드롭다운 항목이 `[role="option"]`이 아닌 `<li>` 요소 → `browser_click(ref)` 사용 가능하나, 텍스트 walker로 `closest('li')` 클릭이 더 안정적
- 미커밋 변경사항이 있으면 반드시 확인 다이얼로그 처리 필요

---

### K-03-02: 새 브랜치 생성
**선행 조건**: K-03-01 전에 실행. Git 탭 진입 상태.

**환경 정리 (필수 — false FAIL 방지)**: 이전 런이 남긴 `test-branch`가 존재하면 `git checkout -b`가 409(Branch already exists)로 실패해 자동 전환 검증이 불가능해진다. 시나리오 시작 전 Bash로 기존 브랜치를 제거한다:
```bash
PROJ=<프로젝트경로>
git -C "$PROJ" checkout master 2>/dev/null
git -C "$PROJ" branch -D test-branch 2>/dev/null || true   # 없으면 무시
```

**절차**:
1. Git 탭 → 브랜치 드롭다운 클릭 → "새 브랜치 이름..." 인라인 input 출현 확인
2. `test-branch` 이름 입력 후 Enter (`dispatchEvent` 패턴 필수):
   ```js
   browser_evaluate(`() => {
     const input = document.querySelector('input[placeholder*="브랜치"]');
     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
     setter.call(input, 'test-branch');
     input.dispatchEvent(new Event('input', { bubbles: true }));
     input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
   }`)
   ```
3. API로 브랜치 생성 + 자동 전환 확인:
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/git/branches', { credentials: 'include' })
     .then(r=>r.json()).then(d=>({ local: d.local, current: d.current }))`)
   ```
   → `local`에 `"test-branch"` 포함, `current === "test-branch"` 확인
   (현재 브랜치 자동 전환됨 — 내부적으로 `git checkout -b test-branch`)

4. **이름 유효성** — 드롭다운 재오픈, MutationObserver 설치 후 유효하지 않은 이름 입력:
   ```js
   browser_evaluate(`() => new Promise(resolve => {
     const observer = new MutationObserver(() => {
       const el = document.querySelector('[class*="bg-red-50"]');
       if (el) { window.__branchError = el.textContent.trim(); observer.disconnect(); }
     });
     observer.observe(document.body, { childList: true, subtree: true, attributes: true });
     const input = document.querySelector('input[placeholder*="브랜치"]');
     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
     setter.call(input, 'invalid name!');
     input.dispatchEvent(new Event('input', { bubbles: true }));
     input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
     setTimeout(() => resolve({ errorText: window.__branchError || null }), 3000);
   })`)
   ```
   → `errorText`에 "잘못된 브랜치 이름" 포함 확인
5. API로 `invalid name!` 브랜치가 생성되지 않았음을 재확인

**기대 결과**:
- 브랜치 생성 즉시 해당 브랜치로 자동 전환 (생성 = `git checkout -b`)
- 잘못된 이름: 서버 400 반환 + Git 탭 최상단에 5초간 빨간 에러 배너 표시

**테스트 함정 (Pitfall)**:
- `browser_press_key('Enter')`는 드롭다운 `<input>`에 신뢰성 있게 도달하지 않음 → `dispatchEvent(KeyboardEvent)` 사용
- 에러 배너는 5초 후 자동 소멸 → MutationObserver로 출현 즉시 포착할 것
- 브랜치 전환 시 미커밋 변경사항 있으면 확인 다이얼로그 출현 가능

---

### K-03-03: Push / Pull
**선행 조건**: K-03-01/02 수행 후. 테스트 프로젝트에 최소 1개 커밋 존재.

**환경 정리 (필수 — false FAIL 방지)**: 이전 런의 remote/clone 작업물이 남아있으면 로컬과 원격 히스토리가 diverged되어 push가 non-fast-forward로 거부된다(500 반환). bare repo도 초기 상태로 재생성한다:
```bash
PROJ=<프로젝트경로>
git -C "$PROJ" remote remove origin 2>/dev/null || true
rm -rf /tmp/hammoc-remote.git /tmp/hammoc-remote-clone
```

**절차**:
1. **테스트 bare 원격 준비** — Bash로 실행:
   ```bash
   PROJ=<프로젝트경로>
   mkdir -p /tmp/hammoc-remote.git && git init --bare /tmp/hammoc-remote.git
   git -C "$PROJ" remote add origin /tmp/hammoc-remote.git
   # origin 없으면 push 시 "repository not found" 에러 → 반드시 선행
   ```

2. Git 탭 → Push 버튼(↑) 클릭:
   ```js
   browser_evaluate(`() => {
     const btn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Push');
     btn?.click(); return btn?.textContent?.trim();
   }`)
   ```
   - **성공 토스트 없음** — 성공은 ahead 카운터가 `0`으로 감소하는 것으로 확인
   - 성공 확인:
     ```js
     browser_evaluate(`() => fetch('/api/projects/<slug>/git/status', { credentials: 'include' })
       .then(r=>r.json()).then(d=>d.ahead)`)
     ```
     → `0` 확인

3. 최신 커밋 해시 기록:
   ```js
   browser_evaluate(`() => fetch('/api/projects/<slug>/git/log', { credentials: 'include' })
     .then(r=>r.json()).then(d=>d.commits[0].hash.slice(0,7))`)
   ```

4. **원격에 새 커밋 추가** — Bash로 clone → commit → push. Hammoc 이 푸시한 브랜치는 `<PUSHED_BRANCH>` (보통 `test-branch` 또는 `master`) 이므로, clone 후 **해당 브랜치로 checkout** 한 뒤 커밋한다:
   ```bash
   rm -rf /tmp/hammoc-remote-clone
   git clone /tmp/hammoc-remote.git /tmp/hammoc-remote-clone
   git -C /tmp/hammoc-remote-clone config user.email "test@test.com"
   git -C /tmp/hammoc-remote-clone config user.name "Test"
   # Hammoc 이 푸시한 브랜치로 이동 (로컬에 없으면 -b 로 생성 후 원격 추적 설정)
   git -C /tmp/hammoc-remote-clone checkout <PUSHED_BRANCH> 2>/dev/null \
     || git -C /tmp/hammoc-remote-clone checkout -b <PUSHED_BRANCH>
   echo "pull test" >> /tmp/hammoc-remote-clone/README.md
   git -C /tmp/hammoc-remote-clone commit -am "remote commit for pull test"
   git -C /tmp/hammoc-remote-clone push origin <PUSHED_BRANCH>
   ```
   > bare repo 에는 HEAD 심볼릭 레퍼런스가 없어 `git clone` 시 `warning: remote HEAD refers to nonexistent ref` 경고가 나올 수 있는데 무시해도 된다. 위 checkout 분기가 이 상황을 흡수한다.

5. Git 탭 → Pull 버튼(↓) 클릭:
   ```js
   browser_evaluate(`() => {
     const btn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Pull');
     btn?.click(); return btn?.textContent?.trim();
   }`)
   ```
   - 성공 확인: 커밋 히스토리 API에서 "remote commit for pull test" 확인:
     ```js
     browser_evaluate(`() => fetch('/api/projects/<slug>/git/log', { credentials: 'include' })
       .then(r=>r.json()).then(d=>d.commits[0].message)`)
     ```
     → `"remote commit for pull test"` 확인

6. **오류 메시지 확인** — Push할 새 커밋 추가 후 원격 URL을 유효하지 않은 주소로 변경:
   ```bash
   echo "error test" >> <프로젝트경로>/README.md
   git -C <프로젝트경로> commit -am "test: push error"
   git -C <프로젝트경로> remote set-url origin https://invalid.invalid/repo.git
   ```
   ```js
   browser_evaluate(`() => new Promise(resolve => {
     const observer = new MutationObserver(() => {
       const el = document.querySelector('[class*="bg-red-50"]');
       if (el) { window.__pushError = el.textContent.trim(); observer.disconnect(); }
     });
     observer.observe(document.body, { childList: true, subtree: true, attributes: true });
     const pushBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Push');
     pushBtn?.click();
     setTimeout(() => resolve({ errorText: window.__pushError || null }), 5000);
   })`)
   ```
   → `errorText` 비어있지 않음 확인 (5초 내 에러 배너 출현)

7. **정리**:
   ```bash
   git -C <프로젝트경로> remote remove origin
   ```

**기대 결과**:
- Push: 원격 `refs/heads/<현재브랜치>` 업데이트, ahead 카운터 `0`
- Pull: 로컬 히스토리에 원격 커밋 반영, behind 카운터 `0`
- 오류 시: Git 탭 최상단에 5초간 빨간 에러 배너 표시

**테스트 함정 (Pitfall)**:
- Push/Pull 성공 토스트 없음 — ahead/behind 카운터 변화 또는 API 로그로 확인
- Pull 전에 UI가 behind 카운터를 즉시 갱신하지 않을 수 있음 → API로 직접 확인
- 에러 배너 5초 auto-dismiss → MutationObserver로 포착
- origin 미설정 시 Push가 "repository not found"로 실패 → origin 설정 필수
- K-03-03 절차 6의 오류 테스트는 ahead count가 1 이상인 상태에서 진행해야 실제 네트워크 시도가 이뤄짐
