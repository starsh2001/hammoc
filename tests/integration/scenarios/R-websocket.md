# R. WebSocket 연결 복원력 ★ SDK 핵심

**범위**: 재연결 후 스트림 복구, 히스토리/버퍼 재생, 다중 브라우저 동기화.
**선행 도메인**: A, B, C. 전역 횡단 도메인 (타 도메인 실패 시 원인이 R일 수 있음).

---

## 네트워크 끊김 유도 표준 절차

socket.io 클라이언트는 ES 모듈 클로저 내부에 캡슐화되어 `window.__wsInstance__`로 직접 접근 불가. 또한 `window.dispatchEvent(new Event('offline'))`는 OS 네트워크 레이어를 건드리지 않기 때문에 socket.io가 실제 연결을 끊지 않는다 (브라우저 테스트 환경의 설계상 한계). 따라서 서버 사이드 강제 종료 훅을 **표준 방법**으로 사용한다.

**표준: 서버 강제 소켓 종료** (`NODE_ENV=development` 또는 `ENABLE_TEST_ENDPOINTS=true` 환경에서만 라우트 등록. 통합 테스트 런처가 후자를 자동 설정)
```js
browser_evaluate(`() => fetch('/api/debug/kill-ws', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ sessionId: '<세션ID>' })  // 생략 시 전체 소켓 종료
}).then(r => r.json())`)
```
서버가 해당 세션(또는 전체)의 소켓을 서버 측에서 강제로 disconnect → 클라이언트가 재연결 시도.

**복구**: 자동. socket.io 클라이언트의 reconnection 로직이 자동으로 재연결한다.

**참고 (비권장)**: `window.dispatchEvent(new Event('offline'))` 는 socket.io 동작에 영향을 주지 않는다. UI의 navigator.onLine 기반 배너 표시를 단독 검증할 때만 사용.

---

## R1. 재연결 후 스트림 복구 `[SDK] [ASYNC]`

### R-01-01: 스트리밍 중 WebSocket 강제 닫힘
**절차**:
1. 세션 진입 후 현재 세션ID 기록 (`fetch('/api/sessions/active').then(r => r.json())` 또는 URL 파싱)
2. "Count slowly from 1 to 30, one number per second" 프롬프트 전송 → 스트림 시작
3. 3초 대기 후 `POST /api/debug/kill-ws` (표준 절차) 로 현재 세션 소켓 강제 종료
4. `browser_snapshot` → UI 상단에 "재연결 중" 또는 오프라인 배너 확인
5. socket.io 자동 재연결 대기 (수 초 이내)
6. 스트림 완료까지 대기
7. `browser_snapshot` → 최종 응답이 1~30까지 중복 없이 수신되었는지 확인

**기대 결과**:
- "재연결 중" 배너 표시
- 재연결 후 진행 중 스트림 버퍼 재생 (`stream:buffer-replay`)
- 최종 응답에 1~30 모두 포함, 중복 없음

### R-01-02: 연결 단절 → 재연결 후 새 메시지 전송
**절차**:
1. 세션 진입 후 짧은 프롬프트 전송 → 응답 완료
2. `POST /api/debug/kill-ws` (표준 절차)
3. 수 초 대기 (자동 재연결 발생)
4. 새 프롬프트 전송 → 정상 응답 확인

**기대 결과**: 자동 재연결, 활성 세션 복원, 새 메시지 정상 전송/수신.

---

## R2. stream:history · buffer-replay `[SDK] [ASYNC]`

### R-02-01: 신규 탭에서 진행 중인 세션 접속
**절차**:
1. 탭 A에서 긴 응답 유도 프롬프트 전송 (예: "Write a 500-word essay on recursion")
2. 응답 시작 확인 후 `browser_tabs(action="new")` → 동일 세션 URL 열기
3. 탭 B에서 `browser_snapshot` 즉시 수행
4. 탭 B에서 스트림 종료까지 대기
5. 탭 A와 탭 B 모두 `browser_snapshot` → 최종 메시지 동일성 확인

**기대 결과**:
- 탭 B에 과거 메시지 + 진행 중 어시스턴트 메시지 모두 수신
- 두 탭 최종 메시지 내용 동일

### R-02-02: 히스토리 순서 일관성
**절차**:
1. 세션에서 3~4회 메시지 전송/응답 완료
2. `browser_evaluate("() => location.reload()")`로 재로드
3. `browser_snapshot` → 메시지 순서 기록
4. 서버 `GET /api/sessions/:id/messages` API 호출 (browser_evaluate fetch) → 순서 비교

**기대 결과**: UI 순서와 서버 기록 순서 일치.

---

## R3. 다중 컨텍스트 동기화 `[EDGE]`

> 본 시나리오는 **같은 브라우저의 다중 탭**(`browser_tabs`)으로 동기화 경로를 검증한다. 크로스 엔진(Chrome↔Firefox) 차이는 별도 CI 브라우저 매트릭스에서 다룬다.

### R-03-01: 두 탭에서 같은 세션 동기화
**절차**:
1. 탭 A에서 세션 진입
2. `browser_tabs(action="new")` → 같은 세션 URL 열기 (탭 B)
3. 탭 A에서 메시지 전송 → 응답 완료 대기
4. `browser_tabs(action="select", index=1)` 탭 B 이동 → `browser_snapshot` → 동일 메시지 존재 확인

**기대 결과**: 탭 A→B 메시지 실시간 반영.

### R-03-02: 권한 응답 경합
**절차**:
1. 두 탭 동일 세션. 권한 필요한 도구 호출 프롬프트 전송 (예: "Read file /etc/passwd")
2. 두 탭 모두 권한 모달/ToolCard 인라인 버튼 표시 대기
3. 탭 A에서 "허용" 클릭 → 즉시 탭 B 전환
4. 탭 B `browser_snapshot` → 모달 자동 닫힘 확인

**기대 결과**:
- 먼저 도착한 응답 적용
- 나머지 탭 모달 자동 닫힘, 서버 상태 일관성

### R-03-03: 설정 변경 전파
**절차**:
1. 두 탭 오픈 (탭 A: 설정 페이지, 탭 B: 채팅 페이지)
2. 탭 A에서 권한 모드 토글 (예: `default` → `plan`)
3. 2초 대기 후 탭 B 이동 → `browser_snapshot` → 헤더·UI에 변경 반영 확인

**기대 결과**: `permission:mode-change` 이벤트로 탭 B 즉시 갱신.
