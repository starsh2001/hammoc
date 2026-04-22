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
2. 응답 완료 대기 후, 메시지 영역 내 이미지 요소 클릭 (렌더는 `[data-testid="message-area"]` 하위 `img` 로 내려옴):
   ```js
   browser_evaluate(`() => {
     const img = document.querySelector('[data-testid="message-area"] img');
     if (!img) return 'no image found';
     img.click();
     return 'clicked';
   }`)
   ```
3. 전체화면 뷰어 열림 확인 (실제 aria-label 은 `Image viewer`):
   ```js
   browser_evaluate(`() => !!document.querySelector('[role="dialog"][aria-label="Image viewer"]')`)
   ```

**기대 결과**: 뷰어 열림, `imageViewerStore` 상태 설정 (줌/닫기 버튼 가시).

### S-01-03: 모바일 터치 제스처
**참고**: 합성 `TouchEvent` 는 Hammoc 이 등록한 React `onTouch*` + 네이티브 `{ passive: false }` 리스너를 정상적으로 트리거하지만, **Chrome 내부의 visual-viewport pinch-zoom 은 트리거하지 않는다**. 즉 자동화로는 "우리 핸들러가 움직이는지" 까지만 확인 가능하고, "브라우저 네이티브 pinch-zoom 이 차단되는지" 는 실기 수동 회귀가 필요하다(E1 참조).

**절차**:
1. `browser_resize(width=400, height=800)` 모바일 뷰포트 전환
2. 이미지 뷰어 오픈 후 뷰어가 overflow 가능한 이미지가 되도록 `canvas.toDataURL` 로 1200×1200 test image 를 만들어 `img.src` 교체 + `button[title="원본 크기 (100%)"]` 클릭
3. **핀치 줌** — 이미지 영역(`[role="dialog"] .flex-1.overflow-hidden`)을 타깃으로 두 손가락 거리를 벌려 dispatch. 시작 거리 `d0`, 종료 거리 `d1` 라 할 때 zoom 은 `initialZoom × (d1/d0)` 에 근접해야 한다.
4. **핀치 중점 앵커 유지 검증** — 중점이 가리키던 image-local pixel 좌표가 확대 전후 동일하게 유지되는지. 중점 화면 좌표 `M` 에 대해 `P = (M − imageCenter) / scale + naturalSize/2` 로 계산한 값이 확대 전후 drift 10px 이하(픽셀 반올림 오차 허용)
5. **pan** — zoom 상태에서 1 손가락 드래그. `translate(x, y)` 값이 예상대로 변하되 clamp 경계 `±(naturalSize × zoom − containerSize) / 2` 를 넘지 않음
6. **스와이프 네비게이션** — fit 상태(zoom ≤ fit)에서 한 손가락 수평 드래그가 threshold(50px) 를 넘을 때 다음 이미지로 전환
7. `browser_resize(width=1280, height=800)` 복원

**기대 결과**:
- 핀치 시 zoom 이 거리 비율대로 증가
- 중점 앵커링으로 image pixel drift ≤ 10px
- zoomed-in 상태에서 pan 이 경계 내에서 동작 (clamp)
- fit 상태 1 손가락 수평 스와이프로 이미지 탐색

**엣지케이스**:
- **[MANUAL] E1**: 실기 모바일 크롬에서 두 손가락 핀치 시 페이지 전체 확대(visual-viewport zoom)가 차단되는지 확인. CSP 내 `touch-action: none` + 네이티브 `{ passive: false }` 리스너의 `preventDefault()` 조합으로 차단하지만, 합성 `TouchEvent` 로는 visual-viewport zoom 자체가 트리거되지 않아 자동 회귀 불가. 릴리즈 직전 실제 안드로이드 크롬 / iOS 사파리에서 다음 두 가지를 눈으로 확인:
  1. 이미지 뷰어 내부에서 두 손가락 핀치 → 이미지만 확대되고 페이지 자체는 고정
  2. 뷰어 바깥(Settings 페이지 등)에서 두 손가락 핀치 → 페이지 전체 확대가 **여전히** 동작(전역 접근성 줌이 끊기면 안 됨)
- **[MANUAL] E2**: 실기에서 세로 스와이프 시 기본 동작(브라우저 스크롤) 이 일어나지 않는지. 현재 뷰어 내부는 `touch-action: none` 이라 기대대로 차단되지만 auto-dismiss UX 는 미구현이므로, 스와이프가 "아무 것도 안 일어남" 이 정상 동작.

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
3. 메시지 영역에서 렌더 결과 확인 (어시스턴트 메시지는 `[data-testid="message-area"]` 하위에 렌더됨 — `message-bubble` testid 는 현재 DOM에 존재하지 않음):
   ```js
   browser_evaluate(`() => {
     const area = document.querySelector('[data-testid="message-area"]');
     return {
       tables: area.querySelectorAll('table').length,
       codeBlocks: area.querySelectorAll('pre code').length,
       copyBtns: area.querySelectorAll('button[aria-label*="복사"]').length,
       styledCodeSpans: area.querySelectorAll('pre code span[style], pre code span[class]').length,
     };
   }`)
   ```

**기대 결과**:
- `tables >= 1` (GFM 테이블 렌더)
- `codeBlocks >= 1` (python 코드블록)
- `copyBtns >= 1` (코드블록당 복사 버튼)
- `styledCodeSpans >= 1` — 코드블록 span 에 Shiki inline `style="color:..."` (또는 언어별 테마 토큰) 적용. 기존 `cm-keyword` / `hljs-*` 클래스 기반 기대는 현재 렌더링 경로(Shiki)와 맞지 않아 제거됨.

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
**선행 조건**: 프로젝트가 git repo 상태이며 최소 1개 파일에 unstaged 수정이 존재한다. 없으면 절차 1에서 sample.ts 에 2줄 append 하여 생성.

**절차**:
1. `git init` + 파일 커밋 + 수정(미스테이징) 상태 준비. Git 탭 진입.
2. 변경 파일을 클릭 → 슬라이드 패널이 열리고 DiffViewer 가 unified(inline) 기본으로 렌더
3. `.cm-mergeView` 존재 및 `.cm-editor` 1개 확인 (inline 모드)
4. 패널 헤더의 **Side-by-side 토글 버튼**(`aria-label` 에 `나란히` 또는 `side-by-side` 포함) 클릭
5. `.cm-editor` 개수가 2개가 되는지 + 클릭한 버튼의 `aria-pressed === "true"`
6. 브라우저 `localStorage.getItem('git-diff-layout')` 가 `"side-by-side"` 로 저장됐는지
7. **Inline 토글 버튼** 클릭 → `.cm-editor` 다시 1개, localStorage 값 `"inline"` 로 업데이트
8. 키보드로 `F7` / `Shift+F7` 순차 입력 → 뷰어 내부 스크롤 위치가 변경 청크로 이동하는지 (dispatch 후 `.cm-editor` 의 `scrollTop` 값이 변하는지 간접 확인)

**기대 결과**:
- DiffViewer 렌더 (CodeMirror Merge) + 실제 before/after 내용 표시 (모든 라인이 insertion 으로 찍히면 서버 getDiff 가 raw diff 텍스트를 돌려준 과거 버그 재발)
- 변경 요약 카운터(`+N / -M`) 가 실제 변경량과 일치
- Side-by-side / Inline 토글 UI 노출 + 클릭 시 실제 layout 전환 + localStorage 영속화
- F7 / Shift+F7 로 변경 청크 네비게이션

### S-04-02: 대용량 Diff
**배경**: `LARGE_FILE_THRESHOLD = 200000` (DiffViewer.tsx) 이상에서만 "전체 로드" 모달 gate 가 노출된다. 임계치는 frame-lag 벤치(10k~1M) 근거로 설정되어 있으며 임의 변경 시 본 시나리오도 같이 업데이트해야 한다.

**절차**:
1. 10k / 50k / 200k 라인 파일을 절차 안에서 직접 생성 (`fs.writeFileSync` 로 `const x_i = i;` 반복). 10k · 50k 는 unstaged, 200k 는 commit 후 1줄 추가로 "큰 파일의 작은 변경" 케이스 구성.
2. 각 파일을 Git 탭에서 클릭. 10k · 50k 는 gate 없이 바로 렌더, 200k+ 는 "대용량" 안내 + "전체 로드" 버튼 노출.
3. 200k 의 "전체 로드" 클릭 → 5s 이내 `.cm-editor` 가시 + `.cm-line` 최소 1개 렌더.
4. `requestAnimationFrame` 루프로 5s 간 frame lag 샘플링 → 최대 lag < 300ms (저사양 기기 고려 마진). 300ms 초과 시 임계치 재검토 필요 — FAIL.

**기대 결과**:
- 10k / 50k: gate 미노출, 즉시 렌더
- 200k+: gate 노출 후 opt-in 로드 가능, 로드 후 최대 frame lag 300ms 이하
- 가상 스크롤로 스크롤 비용 flat

**엣지케이스**:
- E1. 이진 파일: "Binary" 안내, 렌더 회피 (`diffIsBinary` 분기)
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
