# C. 채팅 · 세션 ★ SDK 핵심

**범위**: 세션 라이프사이클, 스트리밍, 편집·분기, 컨텍스트 오버플로, Abort, Summarize, Rewind, 토큰 사용량.
**선행 도메인**: A, B. 테스트 프로젝트 진입 상태 필요.

---

## C1. 새 세션 시작 `[CORE] [SDK] [ASYNC]`

### C-01-01: 빈 프로젝트에서 첫 메시지 전송
**절차**:
1. 프로젝트 진입 → 빈 채팅 화면 확인
2. ChatInput에 "Hello, reply with exactly: OK" 입력
3. Enter 키 또는 전송 버튼

**기대 결과**:
- 네트워크: `chat:send` WebSocket 메시지 발송 (`browser_network_requests` 에서 WS 프레임 확인)
- UI: 유저 말풍선 즉시 표시 → 어시스턴트 말풍선 스트리밍 시작
- 스트리밍 완료 후 응답에 "OK" 포함
- UsageStatusBar에 토큰 사용량 표시

**엣지케이스**:
- E1. 네트워크 끊김 중 전송: 재연결 후 자동 재시도 또는 오류 배너
- E2. CHAT_TIMEOUT 초과: 자동 abort 후 오류 배너

**증거**: `C-01-01-firstmessage.png`

---

## C2. 메시지 스트리밍 & 렌더링 `[CORE] [SDK] [ASYNC]`

### C-02-01: 스트리밍 진행 중 UI 상태
**목적**: 스트리밍 중 입력바 상태와 Abort 노출 확인.
**절차**:
1. 긴 응답을 유도할 프롬프트 전송 ("Write a 500-word essay about...")
2. 스트리밍 시작 직후 `browser_snapshot`

**기대 결과**:
- 어시스턴트 말풍선에 점진적 텍스트 추가
- 입력바: 전송 버튼이 **중단(Stop)** 버튼으로 바뀜
- `browser_network_requests` 에서 `message:chunk` 이벤트 연속 수신

### C-02-02: 마크다운 · 코드블록 렌더링 (→ S2 참조)
**절차**: "Show a Python hello world in code block" 요청.
**기대 결과**: 코드블록 구문 강조, 복사 버튼 가시.

---

## C3. 메시지 편집 & 대화 분기 `[SDK] [EDGE]`

### C-03-01: 이전 유저 메시지 편집 → 새 분기
**절차**:
1. 2~3 턴 대화 후 첫 유저 메시지의 편집 버튼 클릭
2. 내용 수정 후 Ctrl+Enter 또는 체크마크

**기대 결과**:
- `chat:send` 요청에 `resumeSessionAt: <message-uuid>` 포함 (네트워크 확인)
- 새 어시스턴트 응답이 기존 히스토리와 별개 분기로 생성
- Branch Viewer(§2.23)로 분기 전환 가능

**엣지케이스**:
- E1. 편집 중 다른 탭에서 같은 세션에 새 메시지 도착: 편집 취소 경고 혹은 충돌 감지

---

## C4. 컨텍스트 오버플로 & 자동 Compact `[SDK] [EDGE]`

### C-04-01: 컨텍스트 80%+ 상태에서 compact 유도
**유도 방법**:
- 매우 긴 본문(수만 토큰) 반복 전송, 또는
- SDK 응답 대용량 유도 프롬프트

**절차**:
1. 토큰 사용량이 UsageStatusBar 기준 80% 이상에 도달할 때까지 메시지 반복
2. 계속 전송

**기대 결과**:
- 90% 근방에서 `system:compact` 이벤트 수신 → "Summarize & Continue" 배너 가시
- 수락 시 자동 요약 후 새 세션 fork, 이전 세션에 "This session is being continued..." 경계선 출력
- 기대: `correctContextWindow()` 로 계산된 1M/200K 한계가 SDK 보고값과 일치

**엣지케이스**:
- E1. 1M 모델에서 SDK `contextWindow` 오보 → `correctContextWindow` 가 올바른 값으로 교정하는지 확인 (커밋 6219883 대응)

---

## C5. 세션 재개 / Fork `[SDK] [ASYNC]`

### C-05-01: 기존 세션 이어가기
**절차**:
1. 세션 리스트(프로젝트 탭)에서 이전 세션 선택 → "계속"
2. 새 메시지 전송

**기대 결과**:
- `session:join` + `resume: <sessionId>` 이벤트
- 이전 메시지 히스토리 렌더링 후 새 메시지 이어짐
- 동일 세션 ID 유지

### C-05-02: 특정 메시지 시점에서 Fork
**절차**:
1. 세션의 중간 메시지 메뉴 → "Fork" 선택
2. 새 프롬프트 전송

**기대 결과**:
- **새 sessionId** 발급 (`session:forked` 이벤트)
- 원본 세션은 변경 없음, 새 세션은 분기점까지 히스토리만 가짐

**엣지케이스**:
- E1. 동시 Fork (다중 탭에서 같은 메시지 분기): 각자 독립 세션 생성, 충돌 없음

---

## C6. 세션 검색 & 정렬 `[CORE]`

### C-06-01: 메타데이터 검색 (제목 · 첫 프롬프트)
**절차**: 세션 리스트 검색창에 키워드 입력.
**기대 결과**: 해당 키워드가 제목/첫 프롬프트에 있는 세션만 필터링.

### C-06-02: 콘텐츠 검색 (JSONL 라인)
**절차**: "콘텐츠 검색" 토글 활성 후 키워드 입력.
**기대 결과**:
- 서버 `searchSessions(..., searchContent: true)` API 호출 (`browser_network_requests`)
- 본문에 키워드 포함된 세션 매치
- 대용량 세션(500+ 메시지)에서도 2초 내 응답

---

## C7. Abort / ESC 중단 `[SDK] [ASYNC]`

### C-07-01: 스트리밍 중 ESC 로 중단
**절차**:
1. 긴 응답 유도 프롬프트 전송
2. 수 초 후 입력바 포커스 상태에서 ESC
**기대 결과**:
- `chat:abort` 이벤트 전송
- 어시스턴트 말풍선에 부분 텍스트 + "중단됨" 표시
- 입력바 즉시 idle 상태 복귀

### C-07-02: Ctrl+C 중단 (텍스트 미선택 상태)
**절차**: 입력바에서 텍스트 선택 없이 Ctrl+C.
**기대 결과**: Abort 수행. 텍스트가 선택된 상태면 복사만 동작해야 함.

---

## C8. Summarize & Continue `[SDK] [EDGE]`

### C-08-01: 수동 Summarize 트리거
**절차**: 채팅 메뉴에서 "Summarize & Continue" 또는 `/summarize` 슬래시 명령.
**기대 결과**:
- `session:generate-summary` 요청
- 요약 생성 후 새 세션 자동 fork, 새 세션에 요약이 시스템 메시지로 주입
- 원본 세션 계속 열람 가능

**엣지케이스**:
- E1. 요약 생성 실패 (SDK 오류): 명확한 오류 배너 + 원본 세션 무결성 유지

---

## C9. Code Rewind `[SDK] [EDGE]`

### C-09-01: 파일 체크포인트로 되돌리기
**선행 조건**: 프로젝트 설정에서 파일 체크포인팅 활성화, 세션 중 Claude가 파일 수정한 이력 존재.
**절차**:
1. 수정된 파일이 있는 메시지에서 "Rewind to this point" 메뉴
2. 확인 모달 승인
**기대 결과**:
- `session:rewind-files` 요청
- 선택 지점 이후의 파일 변경 역순 복원
- 세션 히스토리에 "Rewound to ..." 표시

---

## C10. 토큰 사용량 표시 `[SDK] [CORE]`

### C-10-01: UsageStatusBar 집계
**절차**: 짧은 메시지 1회 주고받은 후 UsageStatusBar 관찰.
**기대 결과**:
- 입력/출력/캐시 토큰 각각 표시
- 누적 비용(USD) 표시
- SDK 응답의 usage 필드와 정확히 일치

### C-10-02: ContextUsageDisplay 도넛 차트
**절차**: `browser_snapshot` 으로 차트 영역 확인.
**기대 결과**:
- 컨텍스트 사용률 % 수치
- 임계값별 색상 변화 (노랑 70%+, 주황 85%+, 빨강 95%+)
- 캐시 토큰 별도 표시

**엣지케이스**:
- E1. SDK가 `thinkingTokens` 필드 미제공 시 해당 항목 안전하게 0 표시
