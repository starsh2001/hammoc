# D. 권한 & 인터랙션 ★ SDK 핵심

**범위**: 권한 프롬프트, 권한 모드, AskUserQuestion, 타임아웃.
**선행 도메인**: A, B, C.

---

## D1. 권한 프롬프트 응답 `[SDK] [CORE]`

### D-01-01: 파일 편집 권한 Allow
**선행 조건**: 권한 모드 = "Ask before edits".
**절차**:
1. "Create a file named test.txt with content: hello" 프롬프트 전송
2. 권한 모달이 뜰 때까지 `browser_wait_for(text="Allow")`
3. "Allow" 버튼 클릭

**기대 결과**:
- `permission:request` 이벤트 수신
- 모달 내용: 툴 이름(Write), 대상 경로
- Allow 클릭 후 `permission:respond` 전송, 파일 실제 생성
- ToolCard 상태 Running → Completed

### D-01-02: Deny 응답
**절차**: D-01-01 과 동일하되 "Deny" 선택.
**기대 결과**: 도구 실행 거부, 어시스턴트 메시지에 거부 안내 포함.

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
1. 편집 권한 모달 등장 유도
2. 5분 경과 (또는 테스트용으로 클라이언트 타이머 단축하여 검증)

**기대 결과**:
- 모달 자동 닫힘
- 대화에 "권한 요청 타임아웃, 거부됨" 메시지 추가
- 세션은 활성 상태 유지, 다음 프롬프트 전송 가능

**주의**: 실제 5분 대기 대신 `browser_evaluate` 로 타임아웃 상수를 단축하거나 서버 측 타임아웃 변수 조정으로 재현.
