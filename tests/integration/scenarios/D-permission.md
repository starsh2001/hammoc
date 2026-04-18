# D. 권한 & 인터랙션 ★ SDK 핵심

**범위**: 권한 프롬프트, 권한 모드, AskUserQuestion, 타임아웃.
**선행 도메인**: A, B, C.

---

## D1. 권한 프롬프트 응답 `[SDK] [CORE]`

### D-01-01: 파일 편집 권한 Allow
**절차**:
1. ChatInput 포커스 → Shift+Tab 반복으로 권한 모드를 **"Ask before edits"** 로 변경 (배지 확인)
2. "Create a file named test.txt with content: hello" 프롬프트 전송
3. 권한 요청이 뜰 때까지 `browser_wait_for(text="도구 실행 허용")`
4. "도구 실행 허용" 버튼 클릭

**UI 구조 주의**: 권한 요청은 `role="dialog"` 모달이 아닌 **ToolCard 인라인 버튼** 방식으로 표시됨. ToolCard 내부에 `button "도구 실행 허용"` / `button "도구 실행 거절"` 이 노출되며, `PendingToolsIndicator` 바에도 동일 버튼이 함께 표시된다.

**기대 결과**:
- `permission:request` 이벤트 수신
- ToolCard 내용: 툴 이름(Write), 대상 경로, 허용/거절 버튼
- "도구 실행 허용" 클릭 후 `permission:respond` 전송, 파일 실제 생성
- ToolCard 상태 Running → Completed

### D-01-02: Deny 응답
**절차**: D-01-01 과 동일하되 "도구 실행 거절" 클릭.
**기대 결과**: "도구 실패: Write" + "[Request interrupted]" 메시지가 히스토리에 기록되며 도구 실행 중단.

**엣지케이스**:
- E1. 모달 표시 중 다른 탭에서 응답: 한쪽 탭만 적용, 다른 탭 모달은 자동 닫힘 (다중 브라우저 동기화)

---

## D2. 권한 모드 전환 `[SDK]`

### D-02-01: Shift+Tab 사이클
**절차**:
1. ChatInput 포커스 상태에서 Shift+Tab 반복
2. 4개 모드 순환: Plan → Ask before edits → Edit automatically → Bypass

**기대 결과**:
- UI 배지 표시 변경
- `permission:mode-change` 이벤트 브로드캐스트
- 다중 탭 동기화 (동일 세션 다른 탭도 배지 변경)

### D-02-02: 큐 실행 중 모드 변경
**절차**: 큐 러너 실행 중 권한 모드 변경.
**기대 결과**: 현재 항목은 기존 모드 완료, 다음 항목부터 신규 모드 적용.

---

## D3. AskUserQuestion 응답 `[SDK] [EDGE]`

### D-03-01: 선택지형 질문 응답
**유도**: 에이전트가 사용자에게 선택지를 묻는 프롬프트 ("Which approach do you prefer: A, B, or C?")를 유도 (실제 SDK `AskUserQuestion` 사용 시).
**기대 결과**:
- `InteractiveResponseCard` 가시
- 선택지 클릭 → `permission:respond` 전송 → 대화 재개

### D-03-02: 자유 입력형 질문
**기대 결과**: 텍스트 입력 박스 + 제출 버튼.

---

## D4. 권한 타임아웃 `[EDGE]`

### D-04-01: 5분 응답 없음 → 자동 거부
**절차**:
1. **타임아웃 단축** — `browser_evaluate`로 클라이언트 타임아웃 상수 덮어쓰기:
   ```js
   () => { window.__HAMMOC_PERMISSION_TIMEOUT_MS__ = 3000; return true }
   ```
   (프론트엔드가 해당 전역을 참조하도록 되어 있지 않다면 dev 빌드에서 주입 경로 추가 필요 — `usePermissionTimeout` 훅에서 `window.__HAMMOC_PERMISSION_TIMEOUT_MS__`를 우선 사용하도록 선행 구현)
2. 편집 권한 요청 유도 프롬프트 전송 ("Create a file named test.txt")
3. ToolCard에 허용/거절 버튼 노출 대기 후 응답하지 않고 4초 대기
4. `browser_snapshot` → "권한 요청 타임아웃, 거부됨" 메시지 확인
5. 입력창에 다음 프롬프트 입력 가능 상태 확인

**기대 결과**:
- 타이머 만료 시 모달 자동 닫힘
- 대화 히스토리에 타임아웃 메시지
- 세션 활성 유지, 다음 메시지 전송 가능

> 프론트엔드에 주입 포인트가 없으면 본 시나리오는 자동 실행 전 "선행 코드 주입" 카드(인프라 작업)로 기록. 5분 실시간 대기는 금지.
