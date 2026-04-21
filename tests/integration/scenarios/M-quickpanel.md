# M. Quick Panel

**범위**: 패널 토글 · 단축키, 탭 전환 (세션 / 파일 / Git / 터미널).
**선행 도메인**: A, B.

---

## M1. 패널 토글 · 단축키 `[CORE]`

### M-01-01: Alt+1~4 단축키
**절차**:
1. 채팅 페이지 진입 후 `browser_evaluate("() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); document.body.focus(); }")` 로 포커스를 body 로 이동
2. Alt+1 전송 → `[data-testid="quick-panel-content-sessions"]` 가 visible(class 에 `invisible` 없음) 인지 확인
3. **body focus 재설정 후** Alt+2 전송 → `quick-panel-content-files` visible 확인
4. **body focus 재설정 후** Alt+3 전송 → `quick-panel-content-git` visible 확인
5. **body focus 재설정 후** Alt+4 전송 → `quick-panel-content-terminal` visible 확인
6. **body focus 재설정 후** Alt+4 재전송 → `[data-testid="quick-panel"]` 이 DOM 에서 사라짐 (null) 확인

**기대 결과**: 각각 세션 / 파일 / Git / 터미널 패널 토글. 재누름 시 닫힘. (`QuickPanel.tsx:257` — `isVisible` false 시 `return null`)

**함정 (false FAIL 예방)**:
- 패널이 열리면 내부 검색 input (세션 탭 `SessionQuickAccessPanel`, 파일 탭 `QuickFileExplorer`) 이 **자동 포커스**됨. 이 상태에서 다음 Alt+N 을 누르면 [usePanelShortcuts.ts:26-30](../../packages/client/src/hooks/usePanelShortcuts.ts#L26-L30) 의 `isInputFocused` 가드에 걸려 조용히 무시됨 — Alt+2 이후가 모두 무반응인 것처럼 보여 false FAIL 을 유발한다. 매 Alt+N 사이 body focus 재설정을 절차에 명시해야 한다.

**엣지케이스**:
- E1. textarea 포커스 중 Alt+1: 단축키 무시 (MANUAL 명시)
- E2. 모바일 뷰포트: 풀스크린 오버레이로 표시

### M-01-02: 헤더 토글 버튼
**절차**:
1. ChatHeader 의 `[data-testid="panel-toggle-button"]` 버튼 클릭 → 패널 오픈 확인
2. 같은 버튼 재클릭 → 패널 닫힘 확인

**기대 결과**: 패널이 `lastActivePanel` 을 탭으로 오픈/토글됨 ([panelStore.ts:84-89](../../packages/client/src/stores/panelStore.ts#L84-L89) `togglePanel`). 직전 세션에서 사용자가 연 마지막 탭이 기억되어 동일 탭이 열림.

---

## M2. 패널 탭 전환 `[CORE]`

> 선행: M1 의 요령으로 해당 탭을 연 상태. 각 시나리오는 해당 탭 내부 콘텐츠·상호작용만 검증한다.

### M-02-01: 세션 탭
**절차**:
1. Alt+1 로 세션 탭 오픈
2. `[data-testid="quick-panel-content-sessions"]` 내 세션 버튼 리스트 확인 (현재 프로젝트의 세션들)
3. 현재 세션이 아닌 다른 세션을 클릭 → URL 이 `/project/<slug>/session/<다른 id>` 로 전환되는지 확인

**기대 결과**: 세션 리스트 미니 뷰 렌더. 클릭 시 메인 채팅 영역이 선택한 세션으로 전환.

### M-02-02: 파일 탭
**절차**:
1. Alt+2 로 파일 탭 오픈
2. `[data-testid="quick-panel-content-files"]` 내 `[role="treeitem"]` 요소로 프로젝트 트리 확인
3. 임의의 파일(예: `README.md`) 을 **클릭** → 메인 영역에 편집기/뷰어 오버레이(`.fixed.inset-0.z-[60]` 컨테이너) 가 열리는지 확인. 이미지 파일이면 ImageViewer, 그 외는 TextEditor 가 열림 ([QuickFileExplorer.tsx:71-80](../../packages/client/src/components/files/QuickFileExplorer.tsx#L71-L80) `handleFileSelect`).

**기대 결과**: 프로젝트 트리 미니 뷰 렌더. **단일 클릭** 으로 메인 편집기 오버레이 오픈 (더블클릭 아님 — `FileTree` 의 `onFileSelect` 는 `onClick` 으로 바인딩). 마크다운은 `markdownDefaultMode === 'preview'` 설정 시 미리보기 모드로 열림.

### M-02-03: Git 탭
**절차**:
1. Alt+3 으로 Git 탭 오픈
2. `[data-testid="quick-panel-content-git"]` 내 현재 브랜치 + 변경 파일 수 요약 확인 (예: "main 73 변경")
3. "전체 스테이지 & 커밋" 버튼 + 커밋 메시지 input 존재 확인
4. 최근 커밋 리스트 (헤시 + 시간 + 메시지) 표시 확인

**기대 결과**: 브랜치/변경 요약 + 빠른 커밋 UI + 최근 커밋 히스토리 렌더. (테스트 프로젝트가 git 저장소여야 함 — 그렇지 않으면 빈 상태 UI.)

### M-02-04: 터미널 탭
**절차**:
1. Alt+4 로 터미널 탭 오픈
2. 활성 터미널이 없으면 "새 터미널" 버튼 클릭 → `xterm` 렌더 대기 (`.xterm-rows` 가 나타날 때까지 최대 5초)
3. `.xterm-helper-textarea` 에 포커스 → `echo M02` 입력 + Enter
4. `.xterm-rows` 의 마지막 줄 근처에 `M02` 출력 + 다음 프롬프트가 나타나는지 확인

**기대 결과**: 활성 터미널 렌더, 입력·출력 동작 (L1 과 동등). 기존 터미널이 있으면 재사용.
