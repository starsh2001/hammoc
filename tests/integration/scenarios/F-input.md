# F. 채팅 입력 & 첨부

**범위**: 텍스트 입력, 이미지 첨부, 슬래시 명령, 스니펫, 즐겨찾기 칩.
**선행 도메인**: A, B, C.

---

## F1. 텍스트 입력 · Enter 동작 `[CORE]`

### F-01-01: Enter 전송 · Shift+Enter 줄바꿈 (Desktop)
**절차**:
1. ChatInput에 텍스트 입력
2. Shift+Enter 2회 → 줄바꿈 확인
3. Enter → 전송 확인

### F-01-02: 모바일 전송 버튼
**절차**:
1. `browser_resize(width=400, height=800)`으로 뷰포트 축소
2. ChatInput에 텍스트 입력
3. Enter 키 → **물리 키보드 Enter (`browser_press_key`)로는 검증 불가** — 소프트 키보드 Enter는 `InputEvent { inputType: 'insertLineBreak' }`를 발생시키므로 `browser_evaluate`로 해당 이벤트를 직접 디스패치해야 함:
   ```js
   browser_evaluate(`() => {
     const ta = document.querySelector('textarea');
     ta.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true }));
     ta.dispatchEvent(new InputEvent('input', { inputType: 'insertLineBreak', bubbles: true }));
     return document.querySelectorAll('[aria-label^="내 메시지"]').length;
   }`)
   ```
   → msgCount 변화 없음 + textarea에 `\n` 삽입 확인
4. 우측 전송 버튼 클릭 → 전송 확인
5. `browser_resize(width=1280, height=800)`으로 뷰포트 복원

**기대 결과**: 모바일에서 Enter 는 줄바꿈, 전송은 우측 버튼으로만 가능.

> **주의**: `browser_press_key('Enter')`는 물리 키보드 이벤트를 발생시켜 항상 전송됨. 실제 모바일 소프트 키보드 Enter는 `insertLineBreak` InputEvent 경로를 사용하므로 반드시 위 evaluate 방식으로 검증해야 함.

### F-01-03: 초대형 입력
**절차**: 10만 문자 텍스트 붙여넣기.
**기대 결과**: textarea 자동 크기 조정 (`max-height: 120px`까지 확장), 전송 가능.

> 토큰 추정 표시는 미구현 기능으로 검증 대상 제외.

---

## F2. 이미지 첨부 `[SDK] [EDGE] [DnD]`

### F-02-01: 파일 선택 첨부 (단일)
**절차**:
1. 클립 아이콘 클릭
2. `browser_file_upload` 로 PNG 파일 지정
3. 프롬프트 "Describe this image" 입력 후 전송

**기대 결과**:
- 썸네일 프리뷰 가시
- `chat:send` 에 `images` 배열 포함 (Base64)
- 이미지당 ~1600 토큰 추정이 UsageStatusBar에 반영
- 응답에 이미지 관련 설명 포함

### F-02-02: 드래그 드롭 첨부 `[DnD]`
**절차**: `browser_evaluate`로 `DataTransfer`에 파일을 주입한 `drop` 이벤트를 ChatInput 영역에 디스패치:
```js
browser_evaluate(`async () => {
  const resp = await fetch('/favicon.png');
  const blob = await resp.blob();
  const file = new File([blob], 'test.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const target = document.querySelector('[data-testid="chat-input-dropzone"]') ||
                 document.querySelector('textarea[placeholder*="메시지"]').closest('div');
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  return true;
}`)
```
`browser_snapshot`으로 썸네일 프리뷰 등장 확인.

**기대 결과**: 썸네일 등장, 전송 시 images 배열 포함.

### F-02-03: 다중 이미지 (최대 5)
**절차**: 5개 첨부 후 6번째 시도.
**기대 결과**: 6번째 첨부 버튼이 **disabled** 상태가 되어 선제 차단됨 (거부 메시지를 띄우는 방식이 아님).

### F-02-04: 잘못된 형식 / 용량 초과
**엣지케이스**:
- E1. .bmp (미지원) 첨부 → 거부
- E2. 10MB 초과 파일 → 거부 + 안내
- E3. 업로드 중 네트워크 끊김 → 오류 배너, 재시도 가능

---

## F3. 슬래시 명령어 `[CORE]`

### F-03-01: `/` 입력 시 팔레트 표시
**절차**: ChatInput 맨 앞에서 `/` 입력.
**기대 결과**:
- 명령어 팔레트 오픈 (방향키로 이동 가능)
- 표시 명령 예: `/summarize`, `/compact`, `/rewind`, `/fork`, `/save`
- 선택 시 텍스트 치환

### F-03-02: `/compact` 수동 실행
**선행 조건**: 메시지가 1개 이상 있는 세션. 없으면 해당 세션에 메시지 전송 후 진행.
**절차**:
1. 기존 세션의 채팅 페이지 진입 (세션 리스트에서 아무 세션 선택)
2. ChatInput에 `/` 입력 → 팔레트 오픈 확인
3. `/compact` 항목 선택 (방향키 + Enter 또는 클릭)
4. `browser_snapshot` → compact 진행 표시 또는 완료 메시지 확인
5. `browser_console_messages`로 오류 없음 확인

**기대 결과**: C4 의 자동 compact 경로와 동일하게 `system:compact` 이벤트 트리거, UI에 compact 결과 표시.

### F-03-03: `*` 스타 명령 팔레트
**절차**:
1. BMad 테스트 프로젝트(`__hammoc_test_bmad_<ts>__`) 진입. 없으면 B-02-02 절차로 BMad 옵션 체크하여 생성
2. 새 세션 시작 → ChatHeader 에이전트 드롭다운에서 "PM" 또는 "SM" 선택 → `browser_snapshot` 으로 활성 배지 확인
3. "Hello" 프롬프트 전송 → 응답 완료 대기 (BMad 에이전트 활성 상태 확정)
4. ChatInput 포커스 → `*` 입력

**기대 결과**: 활성 에이전트의 `*` 명령어 목록 팔레트 표시, 즐겨찾기 추가/제거 가능.

---

## F4. 프롬프트 스니펫 `[CORE]`

### F-04-01: `%` 로 스니펫 팔레트 호출
**절차**:
1. ChatInput에 `%` 입력
2. 팔레트 오픈 확인 → Bundled 그룹의 스니펫 목록 표시 확인
3. 스니펫 하나 선택 → 본문으로 치환 확인

**기대 결과**:
- 스니펫 본문으로 치환
- 다중 스니펫 체인 (`%a %b`) 입력 시 체인으로 큐잉

### F-04-02: 프로젝트 스니펫이 전역보다 우선
**목적**: 동일 이름의 스니펫이 `{project}/.hammoc/snippets/` 와 `~/.hammoc/snippets/` 양쪽에 있을 때 프로젝트 로컬이 우선 적용되는지 검증.

**중요 (구현 현황)**: Hammoc 스니펫은 **파일 기반**으로만 관리된다. 설정 페이지에 Snippets CRUD UI는 존재하지 않으며 계획도 없음 — 서버는 `snippets:list` WebSocket 이벤트로 읽기 전용 로드만 수행한다 ([snippetResolver.ts](../../packages/server/src/utils/snippetResolver.ts), [useSnippets.ts](../../packages/client/src/hooks/useSnippets.ts)). 따라서 이 시나리오는 파일 시스템에 직접 스니펫 파일을 생성해 검증한다.

**선행 조건**: 테스트 프로젝트 경로 확보 (e.g. `C:\Users\...\Temp\hammoc-test-noBmad-<ts>`).

**절차**:
1. **전역 스니펫 파일 생성** — `~/.hammoc/snippets/test-priority.md`:
   ```bash
   # Bash 도구로 생성
   mkdir -p ~/.hammoc/snippets
   echo "GLOBAL CONTENT" > ~/.hammoc/snippets/test-priority.md
   ```
2. **프로젝트 스니펫 파일 생성** — `<projectPath>/.hammoc/snippets/test-priority.md`:
   ```bash
   mkdir -p <projectPath>/.hammoc/snippets
   echo "PROJECT CONTENT" > <projectPath>/.hammoc/snippets/test-priority.md
   ```
3. 테스트 프로젝트 세션 진입 → ChatInput에 `%` 입력해 팔레트 오픈. `test-priority` 항목에 **"Project" 태그/그룹**이 표시되는지 확인 (전역 vs 프로젝트 구분 UI).
4. `test-priority` 선택 → 본문이 `PROJECT CONTENT`로 치환되는지 확인.
5. 스니펫이 다시 로드되었는지 확인용으로 `%` 팔레트에서 `test-priority` 항목 하나만 노출되는지 (중복 노출이 아닌지) 관찰.

**기대 결과**:
- 팔레트에 `test-priority` **1개** 항목만 표시 (프로젝트 스니펫이 전역을 오버라이드)
- 선택 시 본문이 `PROJECT CONTENT`

**테스트 후 정리**:
```bash
rm -f ~/.hammoc/snippets/test-priority.md
rm -f <projectPath>/.hammoc/snippets/test-priority.md
```

**엣지케이스**:
- E1. 순환 참조 스니펫 (`%a` 본문에 `%b`, `%b` 본문에 `%a`): 감지 후 경고, 무한 확장 방지 — 동일 방식으로 파일 2개 생성해 테스트.

---

## F5. 즐겨찾기 칩 바 `[MOBILE] [DnD]`

### F-05-01: 명령어를 즐겨찾기에 추가
**절차**: 명령 팔레트에서 항목의 별 아이콘 클릭 → 칩 바에 등장.
**기대 결과**: 최대 20개 칩 저장, 초과 시 안내.

### F-05-02: 즐겨찾기 팝업에서 드래그로 재정렬 `[DnD]`

> **UI 구조 주의**: 재정렬은 **칩 바(FavoritesChipBar)**가 아니라 별 버튼을 클릭해 여는 **즐겨찾기 팝업(FavoritesPopup)** 안에서 이루어진다. 팝업 각 항목의 좌측에 GripVertical 드래그 핸들이 표시된다. 칩 바 자체에는 드래그 기능이 없다.

**절차**:
1. 최소 3개의 즐겨찾기 칩 확보 (F-05-01 절차 활용)
2. 칩 바 좌측 별(★) 버튼 클릭 → 즐겨찾기 팝업 오픈 (`browser_click("[data-testid='chip-bar-star-button']")`)
3. `browser_snapshot` → `data-testid="favorite-item-0"` 항목들과 GripVertical 핸들 확인
4. 첫 번째 항목 이름 기록 (재정렬 검증용)
5. `browser_evaluate`로 DragEvent 디스패치 (팝업 내 아이템 셀렉터 사용). `dragenter`가 필수 — React 합성 DnD 핸들러가 hover target을 `onDragEnter`로 기록하는 경우가 많다 (G-01-02 성공 패턴 동일):
   ```js
   browser_evaluate(`() => {
     const items = [...document.querySelectorAll('[data-testid^="favorite-item-"]')];
     if (items.length < 2) return 'not enough items: ' + items.length;
     const src = items[0], dst = items[items.length - 1];
     const dt = new DataTransfer();
     dt.setData('text/plain', '0');
     src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
     src.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer: dt }));
     return [...document.querySelectorAll('[data-testid^="favorite-item-"]')]
       .map(el => el.querySelector('span.flex-1')?.textContent?.trim() ?? el.textContent.trim().slice(0, 20));
   }`)
   ```
6. 반환된 순서에서 원래 첫 번째 항목이 마지막으로 이동했는지 확인.
7. 팝업 닫기 후 `browser_evaluate("() => location.reload()")` → 팝업 재오픈 → 순서 유지 확인.

> **이전 실패 원인**: `dragenter` 이벤트 누락. React 합성 핸들러는 native `DragEvent`를 처리하므로 native dispatch 자체는 동작하지만, `FavoritesPopup.tsx`의 `onDragEnter`에서 hover target 상태를 잡기 때문에 `dragenter` 없이 `dragover`만 보내면 drop 시 target 정보가 없어 재정렬이 안 일어난다. G-01-02 체인 DnD에서 동일 교훈으로 `dragenter`를 추가해 해결한 사례 참고.

**기대 결과**: 팝업 내 항목 순서 변경 → 칩 바에도 반영 → 새로고침 후 유지.

### F-05-03: 모바일 화면에서 칩 바 스크롤
**절차**:
1. `browser_resize(width=400, height=800)` — 모바일 뷰포트
2. 칩 10개 이상 확보 후 `browser_snapshot` → 칩 바 가로 스크롤 가능 확인
3. `browser_evaluate`로 Touch 이벤트 디스패치:
   ```js
   browser_evaluate(`() => {
     const bar = document.querySelector('[data-testid="favorites-chip-bar"]');
     const rect = bar.getBoundingClientRect();
     const touch = new Touch({ identifier: 1, target: bar, clientX: rect.right - 10, clientY: rect.top + 10 });
     bar.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch], targetTouches: [touch] }));
     const endTouch = new Touch({ identifier: 1, target: bar, clientX: rect.left + 10, clientY: rect.top + 10 });
     bar.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [endTouch], targetTouches: [endTouch] }));
     bar.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [endTouch] }));
     return bar.scrollLeft;
   }`)
   ```
4. `scrollLeft`가 0보다 큰지 확인 → 터치 스크롤 반영
5. `browser_resize(width=1280, height=800)` 복원

**기대 결과**: 좌우 스크롤 가능, 터치 이벤트 반영.
