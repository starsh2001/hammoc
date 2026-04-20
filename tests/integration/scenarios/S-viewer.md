# S. 뷰어 & 렌더러 (cross-cutting)

**범위**: 이미지 뷰어, 마크다운 렌더러, 코드 에디터, Diff 뷰어, 바이너리 처리.
**선행 도메인**: A, B. 호출 경로는 C(채팅), J(파일), K(Git)에서 유입.

---

## S1. 이미지 뷰어 `[CORE] [MOBILE]`

### S-01-01: 파일 탐색기에서 이미지 열기
**절차**: 파일 트리에서 PNG 클릭.
**기대 결과**:
- ImageViewer 컴포넌트 렌더
- 줌 / 팬 조작 가능 (마우스 휠, 드래그)
- 다중 이미지 폴더의 경우 좌우 네비게이션 버튼

### S-01-02: 채팅 첨부 이미지 클릭 → 뷰어 열림
**목적**: 메시지 버블에 포함된 이미지를 클릭했을 때 전체화면 이미지 뷰어가 열리는지 검증.

**선행 조건**: 채팅 세션에 이미지 첨부 메시지가 하나 이상 존재. 없으면 절차 1에서 생성.

**절차**:
1. 채팅 세션에 이미지 첨부 메시지 준비:
   - 기존 메시지가 있으면 스킵
   - 없으면 F-02-01 방식(캔버스 → PNG 업로드)으로 메시지에 이미지 포함해 전송:
     ```js
     browser_evaluate(`async () => {
       const c = document.createElement('canvas'); c.width = 20; c.height = 20;
       const ctx = c.getContext('2d'); ctx.fillStyle = '#ff8800'; ctx.fillRect(0, 0, 20, 20);
       const blob = await new Promise(r => c.toBlob(r, 'image/png'));
       const file = new File([blob], 'test-s01.png', { type: 'image/png' });
       const dt = new DataTransfer(); dt.items.add(file);
       const ta = document.querySelector('textarea');
       ta.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
       return file.size;
     }`)
     ```
     → "Describe this image briefly." 프롬프트로 전송
2. 응답 완료 대기 후, 메시지 버블 내 이미지 요소 클릭:
   ```js
   browser_evaluate(`() => {
     const img = document.querySelector('[data-testid="message-bubble"] img, .message-bubble img');
     if (!img) return 'no image found';
     img.click();
     return 'clicked';
   }`)
   ```
3. 전체화면 뷰어 열림 확인:
   ```js
   browser_evaluate(`() => !!document.querySelector('[data-testid="image-viewer"], [role="dialog"][aria-label*="이미지"]')`)
   ```

**기대 결과**: 뷰어 열림, `imageViewerStore` 상태 설정 (줌/닫기 버튼 가시).

### S-01-03: 모바일 터치 제스처
**절차**:
1. `browser_resize(width=400, height=800)` 모바일 뷰포트 전환
2. 이미지 뷰어 오픈
3. **핀치 줌** — 두 터치 포인트를 벌려 dispatch:
   ```js
   browser_evaluate(`() => {
     const viewer = document.querySelector('[data-testid="image-viewer"]') || document.querySelector('img[alt]');
     const r = viewer.getBoundingClientRect();
     const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
     const mkT = (id, x, y) => new Touch({ identifier: id, target: viewer, clientX: x, clientY: y });
     const start = [mkT(1, cx - 20, cy), mkT(2, cx + 20, cy)];
     const end = [mkT(1, cx - 80, cy), mkT(2, cx + 80, cy)];
     viewer.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: start, targetTouches: start }));
     viewer.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: end, targetTouches: end }));
     viewer.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: end }));
     return getComputedStyle(viewer).transform;
   }`)
   ```
4. 반환된 `transform`에 `scale(>1)` 포함 확인
5. **스와이프 네비게이션** — 가로 드래그:
   ```js
   browser_evaluate(`() => {
     const viewer = document.querySelector('[data-testid="image-viewer"]');
     const r = viewer.getBoundingClientRect();
     const mkT = (x) => new Touch({ identifier: 1, target: viewer, clientX: x, clientY: r.top + 50 });
     viewer.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mkT(r.right - 20)], targetTouches: [mkT(r.right - 20)] }));
     viewer.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [mkT(r.left + 20)], targetTouches: [mkT(r.left + 20)] }));
     viewer.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [mkT(r.left + 20)] }));
     return true;
   }`)
   ```
6. `browser_snapshot` → 다음 이미지로 전환 확인
7. `browser_resize(width=1280, height=800)` 복원

**기대 결과**: 핀치 시 `transform: scale()` 증가, 스와이프 시 다음 이미지.

---

## S2. 마크다운 렌더러 `[CORE]`

### S-02-01: 메시지 본문 GFM 렌더
**목적**: 어시스턴트 응답 내 GitHub Flavored Markdown(표, 코드블록 등)이 정상 렌더링되는지 검증.

**절차**:
1. 새 세션에서 다음 프롬프트 전송:
   ```
   Reply with ONLY this markdown (no extra text):
   | col1 | col2 |
   |------|------|
   | a    | b    |

   ```python
   print("hi")
   ```
   ```
2. 응답 스트리밍 완료 대기 (`browser_wait_for` 로 테이블/코드블록 DOM 감지)
3. 메시지 버블에서 렌더 결과 확인:
   ```js
   browser_evaluate(`() => ({
     tables: document.querySelectorAll('[data-testid="message-bubble"] table, .message-bubble table').length,
     codeBlocks: document.querySelectorAll('[data-testid="message-bubble"] pre code, .message-bubble pre code').length,
     copyBtns: document.querySelectorAll('[data-testid="message-bubble"] button[aria-label*="복사"]').length,
   })`)
   ```

**기대 결과**:
- `tables >= 1` (GFM 테이블 렌더)
- `codeBlocks >= 1` (python 코드블록)
- `copyBtns >= 1` (코드블록당 복사 버튼)
- 코드블록 구문 강조 토큰 클래스 (`cm-keyword`, `hljs-*` 등) 존재

### S-02-02: `.md` 파일 프리뷰
**절차**: 파일 에디터에서 `.md` 열기 → 프리뷰 토글.
**기대 결과**: MarkdownPreview 렌더, 이미지 상대 경로 해석.

**엣지케이스**:
- E1. 잘못된 마크다운(닫히지 않은 코드블록): 파싱 복원
- E2. 외부 이미지 URL 로드 실패: 대체 아이콘
- E3. 위험 HTML 삽입: sanitize (XSS 방어)

---

## S3. 텍스트 · 코드 에디터 (CodeMirror) `[CORE]`

### S-03-01: 언어별 문법 하이라이트
**절차**: `.ts`, `.py`, `.json`, `.md` 각각 열어 토큰 색상 확인.
**기대 결과**: 언어 자동 감지, 하이라이트 적용.

### S-03-02: 저장 & 플래그
**절차**: 수정 → Ctrl+S → 플래그 해제.
**기대 결과**: J2 와 동일.

### S-03-03: 검색 & 교체 (CodeMirror 기본)
**절차**: Ctrl+F / Ctrl+H.
**기대 결과**: 검색 패널 오픈, 교체 동작.

---

## S4. Diff 뷰어 `[CORE]`

### S-04-01: Git 변경 파일 Diff 렌더
**절차**: K1 시나리오의 상태에서 파일 클릭.
**기대 결과**:
- DiffViewer 렌더 (CodeMirror Merge)
- Side-by-side / Inline 뷰 토글
- F7 / Shift+F7 로 변경 지점 네비게이션

### S-04-02: 대용량 Diff
**기대 결과**: 가상 스크롤, 렌더 지연 없음.

**엣지케이스**:
- E1. 이진 파일: "Binary" 안내, 렌더 회피
- E2. 매우 긴 줄(수만자): 줄바꿈 처리, 레이아웃 깨짐 없음

---

## S5. 바이너리 파일 처리 `[EDGE]`

### S-05-01: 바이너리 감지 → 다운로드 버튼
**절차**: `.zip`, `.exe`, 이미지가 아닌 미지원 형식 파일을 파일 탐색기에서 열기.
**기대 결과**:
- TextEditor 대신 "Download" 버튼 표시
- `/api/projects/{slug}/fs/raw` 엔드포인트로 다운로드
- 파일 크기 표시

**엣지케이스**:
- E1. 감지 오판(UTF-8 BOM 등): 수동으로 "Open as text" 옵션

### S-05-02: 대용량 바이너리 다운로드 스트리밍
**목적**: 큰 바이너리 파일이 메모리 오버헤드 없이 스트리밍 다운로드되는지 검증.

**선행 조건**: 테스트 프로젝트에 임의 5MB 바이너리 파일 준비. 없으면 절차 1에서 생성.

**절차**:
1. Bash 도구로 5MB 바이너리 파일 생성:
   ```bash
   # PowerShell 기준
   $bytes = New-Object byte[] 5242880
   (New-Object Random).NextBytes($bytes)
   [IO.File]::WriteAllBytes("<projectPath>\large-binary.bin", $bytes)
   ```
   또는 `dd if=/dev/urandom of=... bs=1M count=5` 계열.
2. 파일 탐색기에서 `large-binary.bin` 클릭 → S-05-01과 동일한 Download UI 표시 확인
3. `browser_evaluate`로 raw 다운로드 요청 + 응답 헤더 검증:
   ```js
   browser_evaluate(`async () => {
     const slug = location.pathname.split('/project/')[1].split('/')[0];
     const r = await fetch('/api/projects/' + slug + '/fs/raw?path=large-binary.bin&download=true', { credentials: 'include' });
     return {
       status: r.status,
       contentType: r.headers.get('Content-Type'),
       contentLength: r.headers.get('Content-Length'),
       contentDisposition: r.headers.get('Content-Disposition'),
     };
   }`)
   ```

**기대 결과**:
- `status: 200`
- `contentType: application/octet-stream`
- `contentLength: 5242880`
- `contentDisposition`에 `attachment; filename=...` 포함
