# J. 파일 탐색기

**범위**: 트리/그리드 탐색, 편집 & 저장, CRUD, 파일명 검색.
**선행 도메인**: A, B. 뷰어 상세는 S 도메인 참조.

---

## J1. 트리 / 그리드 뷰 `[CORE]`

현재 구현은 **그리드**가 기본이고 `리스트 뷰` 버튼으로 트리 UI(`role="tree"`)로 전환한다. 두 모드의 네비게이션 모델이 다르므로 시나리오도 분리한다.

### J-01-01: 디렉토리 탐색
**선행 조건**: 테스트 프로젝트 루트에 하위 폴더가 1개 이상 있어야 한다 (예: `docs/`).

**절차 — 그리드 모드 (기본)**:
1. 파일 탐색기 탭 진입 → `aria-label="리스트 뷰"` 토글이 보이면 현재 그리드 모드.
2. 폴더(예: `docs`) 클릭 → 브레드크럼이 `Root > docs` 로 갱신되고, 본문에 하위 항목(`..`, 자식 파일들)이 표시되는지 `browser_snapshot` 으로 확인.
3. 브레드크럼의 `Root` 클릭 → 루트 복귀, 이전 스크롤/선택 복원 여부 확인.

**절차 — 트리 모드**:
1. `aria-label="리스트 뷰"` 버튼 클릭 → 본문이 `role="tree"` 로 전환되고 토글 버튼 라벨이 `"그리드 뷰"` 로 바뀌는지 확인.
2. 특정 폴더의 treeitem 우측 토글 (expand indicator) 을 두 번 클릭해 확장 → 자식 treeitem 이 렌더되고, 한번 더 클릭으로 축소. 확장 상태가 view mode 전환 후에도 fileStore 에 유지되는지 확인.

**기대 결과**:
- 그리드: 브레드크럼 기반 드릴다운, 하위 파일 즉시 표시, `Root` 클릭으로 복귀.
- 트리: `role="tree"` 구조에 treeitem expand/collapse, 상태 persistence.

### J-01-02: 그리드 뷰 렌더링 `[CORE]`
**절차**:
1. 그리드 모드 상태에서 `browser_snapshot` 으로 본문 아이템 구조 확인 — 각 항목이 아이콘(img) + 파일명(generic) + 더보기 메뉴 버튼 조합인지.
2. 파일명이 아이콘 **하단**에 오는지 스크린샷으로 검증 (Finder 스타일).

**기대 결과**:
- Finder 스타일 아이콘, 파일명 하단 표시.
- 파일 클릭은 편집기 오픈, 폴더 클릭은 드릴다운 (브레드크럼 갱신).

**엣지케이스**:
- E1. **대용량 1000+ 가상 스크롤** — 테스트 프로젝트에 임시 fixture 를 생성해 검증한다:
  1. `bash` 로 `for i in $(seq 1 1200); do touch "$FIXTURE_DIR/f-$i.txt"; done`
  2. 탐색기 새로고침 후 그리드 본문이 렌더 완료 시점까지 `browser_wait_for({ text: 'f-1200.txt' })` 로 대기 (최대 5초).
  3. `browser_evaluate` 로 실제 DOM 에 렌더된 카드 수가 1200 보다 **현저히 적은지** (가상 스크롤 ON 증거) 또는 전체가 렌더되어 60fps 스크롤이 가능한지 (가상 스크롤 OFF 면 허용 여부는 실측) 확인.
  4. 검증 끝나면 fixture 삭제 (`rm -rf $FIXTURE_DIR` 또는 탐색기 UI 로).

---

## J2. 파일 편집 & 저장 `[CORE]`

### J-02-01: 텍스트 파일 열기·수정·Ctrl+S
**절차**:
1. `.txt` 파일 클릭 → TextEditor(CodeMirror) 가 `aria-label="Editing <path>"` 로 오픈.
2. 에디터 textbox 를 클릭해 포커스 → `End` → 텍스트 입력으로 버퍼 변경.
3. 헤더의 파일명 옆에 **`M` 뱃지** (amber 색, class 기준 `text-amber-500`) 가 나타나고 "저장" 버튼이 enabled 로 전환되는지 확인. (시나리오 원문의 `*` 표기는 과거 문구이며 실제 구현은 `M` 한 글자 뱃지 — [TextEditor.tsx](packages/client/src/components/editor/TextEditor.tsx) 참조.)
4. `browser_press_key("Control+s")`.

**기대 결과**:
- UI: `M` 뱃지 소거, "저장" 버튼이 다시 disabled.
- 네트워크: `PUT /api/projects/:slug/fs/write?path=...` 요청이 body `{ content, expectedMtime }` 로 발생 (2026-04-21 외부 변경 감지 구현 이후 `expectedMtime` 포함), 200 응답.
- 디스크: 셸에서 `cat <project>/<path>` 로 에디터 content 와 일치 확인. size 가 응답 `result.size` 와 같아야 함.

### J-02-02: 코드 파일 문법 하이라이트
**선행 조건**: 프로젝트에 `.ts` / `.py` / `.js` 중 하나의 코드 파일 준비.

**절차**:
1. 코드 파일 클릭 → 에디터 오픈.
2. `browser_evaluate` 로 하이라이트 검증:
   ```js
   () => {
     const spans = document.querySelectorAll('[aria-label^="Editing"] .cm-content span');
     const tokenClasses = new Set();
     spans.forEach(s => s.classList.forEach(c => { if (c.startsWith('ͼ')) tokenClasses.add(c); }));
     return { tokenClassCount: tokenClasses.size };
   }
   ```
   CodeMirror 6 는 토큰에 `ͼ<hash>` generated class 를 붙인다 — **`tokenClassCount >= 3`** 정도면 하이라이트 동작.

**기대 결과**:
- `tokenClassCount > 0` (키워드·식별자·문자열 최소 분리).
- `browser_console_messages({ level: 'error' })` 에 CodeMirror 관련 에러 없음.

### J-02-03: 바이너리 감지 (→ S5 참조)
**선행 조건**: 임의 바이너리 파일 (`.bin`, `.png` 등) 하나. PNG 는 이미지 뷰어가 잡을 수 있으므로 순수 바이너리(`openssl rand -out sample.bin 2048` 또는 `python -c "import os;open('sample.bin','wb').write(os.urandom(2048))"`) 권장.

**절차**:
1. 바이너리 파일 클릭 → TextEditor 오버레이 오픈, 본문에 에디터 대신 **메시지 + 다운로드 링크** 렌더.

**기대 결과**:
- 본문 문구: `notification:file.binaryNotEditable` (한국어 기준 "바이너리 파일은 편집할 수 없습니다.").
- `role="link"` "다운로드" 버튼이 `href=/api/projects/<slug>/fs/raw?path=<encoded>&download=true` 를 가리킴.
- 헤더의 "저장" 버튼 disabled 유지.

---

## J4. 파일 CRUD · 외부 변경 감지 `[EDGE]`

### J-04-01: 새 파일 / 폴더 생성
현재 UI 는 **빈 영역 우클릭**과 **기존 항목의 더보기 버튼 클릭** 두 경로가 다른 메뉴를 띄운다 (후자는 파일 전용 `다운로드` 항목이 추가됨). 두 경로 모두 확인한다.

**절차 — 빈 영역 우클릭**:
1. 파일 탐색기 본문 리스트의 비어있는 영역을 `button: 'right'` 로 클릭 → 컨텍스트 `role="menu"` 등장, 첫 항목이 `새 파일` [active].
2. `새 파일` 클릭 → 인라인 textbox `aria-label="새 항목 이름"` 가 활성 상태로 렌더, 기본값 빈 문자열.
3. `j-04-01-newfile.txt` 입력 + Enter → 트리 즉시 갱신, 새 항목이 정렬된 위치에 표시.
4. 동일한 경로로 `새 폴더` 선택 → `j-04-01-newfolder` 생성.

**절차 — 항목 더보기 메뉴**:
1. 기존 파일의 `더보기 메뉴` 버튼 클릭 (또는 파일 자체를 우클릭).
2. 메뉴에 `새 파일`, `새 폴더`, `복사`, `잘라내기`, `붙여넣기` (비어있을 땐 disabled), `다운로드` (파일일 때만), `이름 변경`, `삭제` 가 차례로 나오는지 snapshot 으로 확인.

**기대 결과**:
- 두 경로 모두 동일한 결과 — 디스크에 파일/폴더 생성 (`ls` 로 확인), UI 트리 갱신.
- 빈 영역 메뉴에는 `다운로드` 항목이 **없어야** 함 (파일 전용).

**엣지케이스**:
- E1. 동일 이름 재생성 → 409 `FILE_ALREADY_EXISTS` 에러 토스트.
- E2. 경로 구분자 `/` 입력 (예: `sub/file.txt`) → 서버가 `PARENT_NOT_FOUND` 로 거절 (현재 구현은 단일 항목만 허용).

### J-04-02: 이름 변경 / 삭제
**절차 — 이름 변경**:
1. 대상 파일의 `더보기 메뉴` (또는 우클릭) → `이름 변경` 클릭.
2. 활성화된 input 에 기존 이름이 채워져 있는지 `browser_evaluate` 로 `document.activeElement.value` 확인.
3. 새 이름으로 대체 후 Enter → `PATCH /api/.../fs/rename` 200, 디스크에 새 이름 존재.

**절차 — 삭제**:
1. 대상 항목의 메뉴 → `삭제`.
2. 확인 모달이 뜨는지 확인. 기대 구조:
   - 제목: `"삭제 확인"`
   - 본문 1: `"'<이름>' 파일이(가) 삭제됩니다."` (폴더일 때도 동일 템플릿)
   - 본문 2: `"이 작업은 되돌릴 수 없습니다."`
   - 버튼: `취소` (**기본 포커스, 안전**) + `삭제` (빨간색)
3. `삭제` 버튼 클릭 → `DELETE /api/.../fs/delete` 200.

**기대 결과**:
- 이름 변경 후 원본 이름은 디스크/UI 모두에서 사라짐.
- 삭제 모달은 기본 포커스가 `취소` 이므로 Enter 한 번에 삭제되지 않는다 (safety).
- 삭제 수행 후 디스크에서 실제로 사라짐 (`ls` 결과).

**엣지케이스**:
- E1. 보호 경로(`.git` 등) 삭제 시 `PROTECTED_PATH` 에러로 거절.
- E2. 다른 사용자/프로세스가 이름 변경 대상 경로를 선점 → `RENAME_TARGET_EXISTS` 에러.

### J-04-03: 외부 프로세스 변경 감지
**선행 조건**: 프로젝트 루트에 `watch-sample.txt` (내용 `hello\n`) 파일 준비.

**절차**:
1. 파일 탐색기에서 `watch-sample.txt` 클릭 → CodeMirror 에디터 오픈. Zustand `useFileStore` 에 `mtime` 이 ISO 문자열로 세팅되는지 `browser_evaluate` 로 확인.
2. 에디터를 열어둔 상태에서 bash 등 외부 프로세스로 동일 파일 덮어쓰기:
   ```bash
   printf 'external change\n' > watch-sample.txt
   ```
3. 2초 이내에 에디터 상단 노란 배너가 등장하는지 `browser_wait_for({ text: '외부에서 변경' })` 으로 대기 (또는 `role="alert"`).
4. 배너의 "리로드" 버튼 클릭.

**기대 결과**:
- UI: 에디터 상단에 노란 `role="alert"` 배너. 메시지 키 `editor.externalChanged` (또는 dirty 상태면 `editor.externalChangedDirty`). 버튼 "리로드" / "무시".
- 이벤트: WebSocket `file:external-change` 이벤트 수신 — payload `{ projectSlug, path: 'watch-sample.txt', type: 'modified', mtime: <새 ISO> }`.
- 리로드 후: 에디터 content 가 `external change` 로 갱신, `M` dirty 마커 소거, 배너 소거, `editor.reloadedFromDisk` 토스트.
- 상태: `useFileStore.externalStatus === 'synced'`, `mtime` 이 디스크 mtime 과 일치.

**엣지케이스**:
- E1. **저장 충돌 (stale-write)**: 에디터에서 편집 중 (dirty=true) 외부에서 파일 수정 → Ctrl+S 로 저장 시도. 서버가 409 `STALE_WRITE` 반환 (응답 body `error.details.currentMtime` 포함). 에디터 상단 빨간 배너 `editor.saveConflict` + "리로드" / "덮어쓰기" 버튼 등장. "덮어쓰기" 클릭 → 저장 성공, 외부 변경사항이 로컬 버퍼로 대체됨 (`externalStatus === 'synced'`, `mtime` 서버 응답 값과 동일). 토스트는 **표시되지 않음** (배너가 결과를 이미 드러내므로 중복 억제).
- E2. **외부 삭제**: `rm watch-sample.txt` → `file:external-change` (type='deleted', mtime 없음) 수신 → 빨간 배너 `editor.externalDeleted` + "무시" 버튼만. "무시" 클릭 후 Ctrl+S → 파일이 다시 생성되는지 디스크 확인 (dismissExternalChange 가 mtime 도 null 로 클리어하므로 stale-write 가드 통과).
- E3. **Self-write suppression**: 에디터 안에서 Ctrl+S 로 저장 시, chokidar 가 같은 `change` 이벤트를 재발행해도 서버의 `fileWatcherService.noteLocalWrite` 가 1.5 초 윈도우 동안 해당 경로를 억제 → 자기 자신 저장은 배너를 띄우지 않는다. `printf` 직전에 save 한 경우에는 노이즈 이벤트가 없는지 로그로 확인.
- E4. **Directory-root 이벤트 무시**: 프로젝트 루트의 mtime 만 바뀌는 조작 (예: 새 파일 추가로 디렉터리 mtime 갱신) 시 `rel === '.'` 가드가 이벤트를 drop — 에디터 배너 안 뜸.
- E5. **바이너리 전환**: 텍스트 파일을 외부에서 바이너리로 덮어씀 → 리로드 시 `isBinary=true` 로 에디터 닫히고 "Download" 버튼 노출 (J-02-03 동작과 일관).

**증거**: `browser_take_screenshot(filename="J-04-03-banner.png")` 배너 표시 시점, E1 결과에 대해 `J-04-03-E1-conflict.png` 추가.

---

## J5. 파일명 검색 `[CORE]`

### J-05-01: searchFiles API 호출
**절차**:
1. 상단 검색창에 키워드 입력 (예: `rewind`).
2. 디바운스 후 `GET /api/projects/<slug>/fs/search?query=rewind` 호출, 응답 body `{ query, results: FileSearchResult[] }`.

**기대 결과**:
- UI: 매치된 파일 리스트가 본문에 대체 렌더.
- 서버 구현은 `SKIP_DIRS` ( `node_modules`, `.git`, `.next`, `.cache`, `__pycache__`, `dist`, `.turbo` — [fileSystemService.ts](packages/server/src/services/fileSystemService.ts) `SKIP_DIRS` 상수) 를 재귀에서 제외. 쿼리 문자열 자체가 숨김 폴더 이름을 포함해도 **그 디렉터리 내부**는 뒤지지 않는다. (이전 시나리오 문구 "gitignore 대상" 은 오해 — Hammoc 은 `.gitignore` 파싱을 하지 않는다.)
- 숨김 검색 필요 시 `includeHidden=true` 쿼리 파라미터를 붙이면 `SKIP_DIRS` 를 관통한다. 현재 UI 토글은 없고 API 레벨에서만 가능.
- 성능: 테스트 프로젝트 규모에서 `performance.now()` 기준 **2000ms 이내** 응답.

**엣지케이스**:
- E1. **특수문자 / 한글 쿼리**: `fetch('/api/.../fs/search?query=' + encodeURIComponent('한글'))` 로 직접 호출 → 200, `results: []` (매치 없으면), 파싱 에러 없음.
- E2. **심볼릭 링크 순환**: 프로젝트 내에 자기 자신을 가리키는 심볼릭 링크(POSIX `ln -s . loop` 또는 Windows junction `New-Item -ItemType Junction ... -Target ...`)를 만들고 쿼리에 매치되는 파일명을 입력. `fileSystemService.searchFiles` 가 [realpath-keyed visited set](../../packages/server/src/services/fileSystemService.ts)으로 순환을 끊으므로, 각 실파일이 **정확히 1번**만 결과에 나타나야 한다. `loop/loop/...` 같은 재진입 경로가 포함되면 FAIL. 2026-04-21 측정: 순환 가드 추가 전 960ms / 96건(중복 93건) → 추가 후 15ms / 3건 / 중복 0.
- E3. **`includeHidden` API 모드**: 위 쿼리 + `&includeHidden=true` 로 `.git` 내부 파일명 검색 → 결과 포함 여부 확인.
