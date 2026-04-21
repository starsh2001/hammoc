# F. 채팅 입력 & 첨부

**범위**: 텍스트 입력, 이미지 첨부, 슬래시 명령, 스니펫, 즐겨찾기 칩.
**선행 도메인**: A, B, C.

---

## F1. 텍스트 입력 · Enter 동작 `[CORE]`

### F-01-01: Enter 전송 · Shift+Enter 줄바꿈 (Desktop)

> **주의**: `browser_type`은 `.fill()` 의미로 기존 텍스트를 **덮어쓴다**. 중간에 Shift+Enter가 들어가는 멀티라인 입력은 `browser_press_key`로 문자/키를 **개별 전송**해야 한다. `fill + Shift+Enter + fill` 조합은 마지막 `fill` 호출이 앞의 모든 입력을 지운다.

**절차**:
1. ChatInput 포커스 (`browser_evaluate('() => document.querySelector(\'textarea[aria-label="메시지 입력"]\').focus()')`)
2. `browser_press_key('a')` → `browser_press_key('Shift+Enter')` → `browser_press_key('Shift+Enter')` → `browser_press_key('b')`
3. `browser_evaluate`로 textarea `value === 'a\n\nb'`, 개행 2개 확인
4. `browser_press_key('Enter')` → 전송 확인 (`[aria-label^="내 메시지"]` 카운트 +1, 입력 비워짐)

**기대 결과**: Shift+Enter는 줄바꿈, Enter는 전송. 전송된 메시지 본문이 `a\n\nb` 로 보존.

### F-01-02: 모바일 전송 버튼

> **주의**: 모바일 viewport(400px)로 축소하면 Quick Panel이 full-screen dialog로 전환되어 전송 버튼 pointer events를 가로챈다. `browser_resize` 직전 또는 직후에 패널을 닫는다 (`[aria-label="패널 닫기"]` 클릭 또는 `Alt+1` 토글).

**절차**:
1. 열려있는 Quick Panel이 있으면 먼저 닫기 (채팅 헤더의 "패널 열기/닫기" 버튼으로 토글)
2. `browser_resize(width=400, height=800)`으로 뷰포트 축소
3. ChatInput에 텍스트 입력 (evaluate로 native value setter + input 이벤트)
4. Enter 키 → **물리 키보드 Enter (`browser_press_key`)로는 검증 불가** — 소프트 키보드 Enter는 `InputEvent { inputType: 'insertLineBreak' }`를 발생시키므로 `browser_evaluate`로 해당 이벤트를 직접 디스패치해야 함:
   ```js
   browser_evaluate(`() => {
     const ta = document.querySelector('textarea');
     ta.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true }));
     ta.dispatchEvent(new InputEvent('input', { inputType: 'insertLineBreak', bubbles: true }));
     return document.querySelectorAll('[aria-label^="내 메시지"]').length;
   }`)
   ```
   → msgCount 변화 없음 확인. (합성 InputEvent는 DOM text에 실제 `\n`을 삽입하지 않지만, 본 assertion의 핵심은 **전송이 트리거되지 않음**)
5. 우측 전송 버튼 클릭 → 전송 확인 (DOM `button[aria-label="전송"]` 클릭을 `browser_evaluate`로 실행. MCP `browser_click`은 snapshot ref가 패널 dialog에 가려져 실패할 수 있음)
6. `browser_resize(width=1280, height=800)`으로 뷰포트 복원

**기대 결과**: 모바일에서 Enter 는 줄바꿈 경로로 소비되어 전송되지 않고, 전송은 우측 버튼으로만 가능.

> **주의**: `browser_press_key('Enter')`는 물리 키보드 이벤트를 발생시켜 항상 전송됨. 실제 모바일 소프트 키보드 Enter는 `insertLineBreak` InputEvent 경로를 사용하므로 반드시 위 evaluate 방식으로 검증해야 함.

### F-01-03: 초대형 입력
**절차**: 10만 문자 텍스트 붙여넣기.
**기대 결과**: textarea 자동 크기 조정 (`max-height: 120px`까지 확장), 전송 가능.

> 토큰 추정 표시는 미구현 기능으로 검증 대상 제외.

---

## F2. 이미지 첨부 `[SDK] [EDGE] [DnD]`

### F-02-01: 파일 선택 첨부 (단일)

> **권장 주입 방식**: MIME 검증을 함께 확인하려면 `browser_file_upload` 대신 `browser_evaluate`에서 `DataTransfer + new File(..., { type: 'image/png' })` 로 주입한다 (F-02-04 주의사항 참고). 단, F-02-01은 정상 경로 확인만 해도 되므로 유효한 실제 PNG를 `browser_file_upload`로 올려도 OK.

**절차**:
1. 이미지 첨부 버튼 (`button[aria-label="이미지 첨부"]`) 클릭 — `browser_evaluate(() => document.querySelector('button[aria-label="이미지 첨부"]').click())` 권장 (MCP snapshot ref가 refresh 후 무효화되는 경우 대비)
2. `browser_file_upload`로 유효한 PNG 지정 (경로는 allowed roots 소문자 드라이브, 예: `d:\repo\hammoc\tests\integration\fixtures\img1.png`). 또는 evaluate 경로:
   ```js
   async () => {
     const input = document.querySelector('input[type="file"]');
     const dt = new DataTransfer();
     const bytes = new Uint8Array([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, /* ... valid PNG ... */]);
     dt.items.add(new File([bytes], 'img.png', { type: 'image/png' }));
     input.files = dt.files;
     input.dispatchEvent(new Event('change', { bubbles: true }));
   }
   ```
3. 썸네일 등장 확인: `button[aria-label^="이미지 제거:"]` 개수 1
4. 프롬프트 입력 후 전송 (장문 응답 대기는 생략 가능 — 핵심은 이미지가 user 메시지에 포함되는지)

**기대 결과**:
- 썸네일 프리뷰 가시
- 유저 메시지 `listitem[aria-label^="내 메시지"]` 내부에 `img` 요소 1개 이상
- `chat:send` payload에 `images` 배열 포함 (Base64)
- UsageStatusBar 토큰 집계 반영 (수치는 SDK 버전별 변동 가능 — 정확 비교 대신 "증가 관찰"로 완화 가능)

### F-02-02: 드래그 드롭 첨부 `[DnD] [MANUAL]`
> **자동화 불가 사유**: 브라우저의 native HTML5 Drag-and-Drop은 보안상 사용자 제스처로만 파일 drop을 허용한다. Playwright MCP에서 `browser_evaluate`로 `DataTransfer` + `DragEvent`를 디스패치해도 React의 onDrop 핸들러가 파일을 수신하지 못함을 2026-04-20 실측으로 확인. `browser_drag` MCP 툴 역시 pointermove 기반이라 HTML5 파일 drop을 발동시키지 못한다. 따라서 본 시나리오는 자동화 경로로는 검증 불가 — **릴리즈 직전 수동 회귀에서 확인**한다.

**수동 절차**:
1. 채팅 세션 진입 상태에서 OS 파일 탐색기에서 PNG 파일 1개를 드래그하여 ChatInput 영역 위로 이동
2. 드래그 중 드롭존 하이라이트 표시 확인
3. 마우스 버튼 release → 썸네일 프리뷰 등장 확인
4. "Describe this image" 프롬프트 입력 후 전송
5. `chat:send` 이벤트에 `images` 배열이 포함되어 있는지 DevTools Network 탭 또는 서버 로그에서 확인

**기대 결과**: 썸네일 등장, 전송 시 images 배열 포함, 응답에 이미지 관련 설명 포함.

### F-02-03: 다중 이미지 (최대 5)
**절차**:
1. 이미지 첨부 버튼 클릭 → `browser_file_upload`로 PNG 5개 동시 지정 (혹은 DataTransfer 경로로 `File` 5개 주입)
2. 썸네일 5개 표시 확인: `document.querySelectorAll('button[aria-label^="이미지 제거:"]').length === 5`
3. 첨부 버튼 상태 확인: `document.querySelector('button[aria-label="이미지 첨부"]').disabled === true`

**기대 결과**: 5개가 붙은 뒤 6번째 첨부 버튼이 **disabled** 상태가 되어 선제 차단됨 (별도 거부 메시지 없음).

### F-02-04: 잘못된 형식 / 용량 초과

> **자동화 주의**: Playwright MCP `browser_file_upload`(내부 `fileChooser.setFiles`)는 OS 파일의 `File.type`을 빈 문자열로 전달하는 경우가 있어 `files.filter(f => f.type.startsWith('image/'))` ([ChatInput.tsx:465](../../packages/client/src/components/ChatInput.tsx#L465))에서 파일이 조용히 걸러져 validation 단계까지 도달하지 못한다. 결과적으로 첨부되지도 않고 안내도 뜨지 않는 "false silent" 상태가 관측됨. 따라서 본 시나리오는 `browser_evaluate`에서 `File` 객체를 직접 만들어 `input.files = dt.files` + `change` 이벤트로 주입한다.

**절차**:
1. 세션 진입 후 다음 `browser_evaluate` 실행 (BMP 검증):
   ```js
   async () => {
     const input = document.querySelector('input[type="file"]');
     const dt = new DataTransfer();
     const bmpFile = new File([new Uint8Array([0x42, 0x4D, 0x3A, 0, 0, 0])], 'bad.bmp', { type: 'image/bmp' });
     dt.items.add(bmpFile);
     input.files = dt.files;
     input.dispatchEvent(new Event('change', { bubbles: true }));
     await new Promise(r => setTimeout(r, 200));
     const err = document.querySelector('[data-testid="validation-error"]');
     return { errText: err?.textContent };
   }
   ```
   → `errText === '지원되지 않는 이미지 형식입니다'` 확인

2. 3초 후 (auto-dismiss) 다음 evaluate 실행 (11MB PNG 검증):
   ```js
   async () => {
     const input = document.querySelector('input[type="file"]');
     const dt = new DataTransfer();
     const file = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' });
     dt.items.add(file);
     input.files = dt.files;
     input.dispatchEvent(new Event('change', { bubbles: true }));
     await new Promise(r => setTimeout(r, 300));
     const err = document.querySelector('[data-testid="validation-error"]');
     return { errText: err?.textContent };
   }
   ```
   → `errText` 에 `'10MB'` 또는 `'초과'` 포함 확인

**기대 결과**:
- BMP → "지원되지 않는 이미지 형식입니다" 표시
- 11MB PNG → "10MB를 초과하는 파일은 첨부할 수 없습니다" 표시
- 두 경우 모두 첨부 목록(`button[aria-label^="이미지 제거"]`)이 증가하지 않음
- 알림은 `role="alert"` + `data-testid="validation-error"` 로 3초간 표시 후 자동 해제

**엣지케이스**:
- E3. 업로드 중 네트워크 끊김 → 오류 배너, 재시도 가능 (현재 런처 훅 부재로 스킵 가능)

---

## F3. 슬래시 명령어 `[CORE]`

### F-03-01: `/` 입력 시 팔레트 표시
**절차**:
1. ChatInput 포커스 후 `browser_press_key('/')`
2. `document.querySelector('[role="listbox"]')` 존재 확인
3. `[role="option"]` 각각의 텍스트 수집해 내장 명령과 활성 스킬이 포함되는지 확인

**기대 결과**:
- 명령어 팔레트(`[role="listbox"]`) 오픈
- "Commands" 그룹에 `/compact` 표시
- "Skills" 그룹에 활성 스킬 표시 (예: `/frontend-design`)
- 프로젝트/유저 커스텀 명령(`~/.claude/commands/`, `<project>/.claude/commands/`)은 **즐겨찾기 칩 바**에만 disabled 상태로 노출되고 현재 빌드에서는 팔레트 `option`에는 포함되지 않을 수 있음 → 팔레트에 반드시 나와야 한다는 assertion은 강제하지 말 것
- 선택(방향키 + Enter) 시 `/compact ` 형태로 텍스트 치환

> **주의**: `/summarize`, `/rewind`, `/fork`, `/save`는 슬래시 명령으로 노출되지 않는다. Summarize/Rewind/Fork는 각각 메시지 버블 액션 버튼(C-08-01, C-09-01, C-05-02)으로, `/save`/`/load`는 큐 스크립트(`@save`/`@load`, H 도메인) 전용 디렉티브로 구현돼 있다.

### F-03-02: `/compact` 수동 실행
**선행 조건**: 2턴 이상 대화가 있는 세션 (너무 짧으면 compact 효과가 없을 수 있음).

**절차**:
1. 기존 세션의 채팅 페이지 진입 (세션 리스트에서 아무 세션 선택)
2. ChatInput에 `/` 입력 → 팔레트 오픈 확인
3. `/compact` 항목 선택 (방향키 + Enter 또는 클릭)
4. Enter 전송
5. **충분한 대기** — `/compact`는 서버 측에서 Claude CLI가 요약을 생성해야 하므로 수십 초 소요 (실측 10~30초, 프롬프트 체인이 짧으면 빠름). `browser_wait_for`의 MCP-level timeout이 30초로 제한되는 환경도 있으므로, 안정적으로는 `browser_evaluate`에서 `[role="log"]` textContent에 `"대화가 요약되었습니다"` / `"Conversation compacted"` 중 하나가 나타날 때까지 폴링:
   ```js
   () => {
     const log = document.querySelector('[role="log"]');
     const t = log?.textContent || '';
     return t.includes('대화가 요약') || t.includes('Conversation compacted');
   }
   ```
   최대 3분 한계 내에서 `browser_wait_for({ time: 30 })` 2~3회 반복 또는 직접 setInterval 폴링.
6. 완료 후 `browser_evaluate`로 `compact_boundary` subtype 메시지 존재 확인:
   ```js
   browser_evaluate(`() => {
     const msgs = [...document.querySelectorAll('[role="log"] *')];
     return msgs.some(el => el.textContent?.includes('Conversation compacted') || el.textContent?.includes('대화가 압축'));
   }`)
   ```
7. `browser_console_messages`로 오류 없음 확인

**기대 결과**:
- 서버 측 Claude CLI가 `/compact` 처리 ([websocket.ts:2742](../../packages/server/src/handlers/websocket.ts#L2742))
- `compact_boundary` subtype system 메시지 생성 → UI에 divider + "Conversation compacted" 배지 표시 ([ChatPage.tsx:117](../../packages/client/src/pages/ChatPage.tsx#L117))
- 이후 새 메시지는 축소된 컨텍스트 위에서 동작

> **대기 시간 주의**: LLM 요약 호출이 필요하므로 짧은 대기(5초)로는 완료 포착 불가. 최소 60초, 일반적으로 30~120초 소요.

### F-03-03: `*` 스타 명령 팔레트
**절차**:
1. BMad 테스트 프로젝트(`__hammoc_test_bmad_<ts>__`) 진입. 없으면 B-02-02 절차로 BMad 옵션 체크하여 생성
2. 새 세션 시작 → **채팅 입력바 하단**의 BMad 에이전트 버튼 (`aria-label="BMad 에이전트 목록"`) 클릭 → "PM" 또는 "SM" 선택 → `browser_snapshot` 으로 활성 배지 확인
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

### F-05-01: 명령어를 즐겨찾기에 추가/제거

> **테스트 환경 주의**: 기본적으로 `/compact`, `/frontend-design` 등 주요 명령이 이미 즐겨찾기된 상태일 수 있다. "추가 흐름"을 보장 검증하려면 **먼저 제거 → 재추가** 순으로 왕복 테스트한다.

**절차**:
1. `/` 입력해 팔레트 열기
2. 즐겨찾기된 항목 (`aria-label="즐겨찾기 제거"`) 하나를 찾아 별 버튼 클릭 → 칩 바 `[data-testid="chip-scroll-area"]` 내 해당 칩 사라짐, 옵션의 별 버튼 label이 `"즐겨찾기 추가"`로 전환
3. 같은 항목의 별 다시 클릭 → 칩 복귀, label이 `"즐겨찾기 제거"`로 복귀
4. 칩 20개 이상 상태를 재현하려면 수동으로 추가 — 초과 시 알림 문자열 관찰 (자동 회귀에선 선택)

**기대 결과**: 즐겨찾기 토글이 즉시 칩 바에 반영되고 영속. 최대 20개, 초과 시 안내.

### F-05-02: 즐겨찾기 팝업에서 드래그로 재정렬 `[DnD] [MANUAL]`

> **UI 구조 주의**: 재정렬은 **칩 바(FavoritesChipBar)**가 아니라 별 버튼을 클릭해 여는 **즐겨찾기 팝업(FavoritesPopup)** 안에서 이루어진다. 팝업 각 항목의 좌측에 GripVertical 드래그 핸들이 표시된다. 칩 바 자체에는 드래그 기능이 없다.

> **자동화 불가 사유**: `dragstart`/`dragenter`/`dragover`/`drop`/`dragend`를 올바른 순서로 디스패치해도 Playwright MCP 환경에서 React의 DnD 핸들러가 재정렬을 반영하지 못함을 2026-04-20 실측으로 확인. `browser_drag` MCP 툴은 pointermove 기반이라 HTML5 DnD에 적용되지 않음. 자동화로는 검증 불가 — **릴리즈 직전 수동 회귀에서 확인**.

**수동 절차**:
1. 최소 3개의 즐겨찾기 칩 확보 (F-05-01 절차 활용)
2. 칩 바 좌측 별(★) 버튼 클릭 → 즐겨찾기 팝업 오픈
3. 첫 번째 항목의 GripVertical 핸들을 마우스로 드래그해 마지막 항목 아래로 이동 → release
4. 첫 번째 항목이 마지막 위치로 이동했는지 팝업에서 시각 확인
5. 팝업 닫기 → 칩 바에도 순서 변경 반영됐는지 확인
6. 브라우저 새로고침 → 팝업 재오픈 → 순서 유지 확인

**기대 결과**: 팝업 내 항목 순서 변경 → 칩 바에도 반영 → 새로고침 후 유지.

### F-05-03: 모바일 화면에서 칩 바 스크롤
> **UI 구조 주의**: 바깥 `[data-testid="favorites-chip-bar"]`는 flex wrapper(즐겨찾기 편집 별 버튼 + 스크롤 영역)이며 스크롤 컨테이너가 **아니다**. 실제 가로 스크롤 컨테이너는 내부 `[data-testid="chip-scroll-area"]` (FavoritesChipBar.tsx에서 `overflow-x-auto` 적용). 스크롤 검증 시 반드시 `chip-scroll-area`를 대상으로 한다.

> **합성 TouchEvent 한계**: Playwright MCP 데스크톱 Chromium에서는 `TouchEvent` 디스패치만으로 네이티브 수평 스크롤이 트리거되지 않는다 (브라우저 보안 제약). 따라서 **구현이 스크롤 가능한지**를 `overflowX === 'auto' && scrollWidth > clientWidth`로 간접 검증하고, 프로그램적 `scrollLeft` 할당이 반영되는지로 스크롤 메커니즘을 확인한다. 실제 터치 제스처 스크롤은 릴리즈 전 수동 회귀에서 확인.

**절차**:
1. `browser_resize(width=400, height=800)` — 모바일 뷰포트
2. 칩 여러 개 확보된 상태에서 `browser_evaluate`로 스크롤 컨테이너 속성 확인:
   ```js
   browser_evaluate(`() => {
     const bar = document.querySelector('[data-testid="chip-scroll-area"]');
     const cs = window.getComputedStyle(bar);
     return { overflowX: cs.overflowX, scrollW: bar.scrollWidth, clientW: bar.clientWidth, scrollable: bar.scrollWidth > bar.clientWidth };
   }`)
   ```
   → `overflowX === 'auto'`, `scrollable === true` 확인
3. 프로그램적 스크롤 설정 가능 확인:
   ```js
   browser_evaluate(`() => {
     const bar = document.querySelector('[data-testid="chip-scroll-area"]');
     bar.scrollLeft = 200;
     const afterSet = bar.scrollLeft;
     bar.scrollBy({ left: 100 });
     return { afterSet, afterScrollBy: bar.scrollLeft };
   }`)
   ```
   → `scrollLeft` 값이 적용되는지 확인 (0 → 200 → 300)
4. `browser_resize(width=1280, height=800)` 복원

**기대 결과**: 스크롤 컨테이너가 `overflow-x: auto`이고 `scrollWidth > clientWidth`이며 `scrollLeft` 프로그램적 설정이 반영된다. 실제 터치 제스처 스크롤은 수동 회귀에서 확인.
