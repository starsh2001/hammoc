# P. 전역 설정

**범위**: 언어 / 테마 / 채팅 타임아웃 / 고급 설정 / 서버 업데이트.
**선행 도메인**: A.

---

## P1. 언어 전환 `[CORE]`

### P-01-01: 6개 로케일 순회
**절차**: Settings → Global → Language → en / ko / ja / zh-CN / es / pt 순차 선택.
**기대 결과**:
- 전체 UI 라벨 변경 (로그인 버튼, 탭 이름, 대시보드 카드 타이틀 등)
- localStorage에 선택값 저장
- 재로그인 후 유지

**엣지케이스**:
- E1. 일부 번역 누락: 기본 언어(en) 폴백
- E2. 폰트 지원: zh-CN/ja 의 한자 렌더링 이상 없음

---

## P2. 테마 `[CORE]`

### P-02-01: Dark / Light / System
**절차**: Settings → Theme → 각 옵션 선택.
**기대 결과**:
- `documentElement` 클래스 토글 (dark:)
- 색상 전환 깜빡임 없음
- System 모드: OS 설정에 따름, OS 테마 변경 실시간 감지

---

## P3. 채팅 타임아웃 `[EDGE]`

### P-03-01: 짧은 타임아웃 유도
**절차**:
1. Settings → Chat Timeout을 최소값(UI가 허용하는 최소 — 예: 1분)으로 설정
2. 실행 시간 단축을 위해 서버 환경변수 `CHAT_TIMEOUT_MS`를 테스트 런처가 10초로 주입 (`run-integration-test.mjs --chat-timeout=10000`)
3. 응답이 10초를 초과하도록 유도: "Start replying with the word 'WAIT', then pause 15 seconds, then continue."
4. 10초 경과 후 스트림 자동 중단 확인
5. 메시지 히스토리에 "요청 시간 초과" 또는 abort 메시지 확인

**기대 결과**: 설정된 타임아웃 도달 시 자동 abort, 안내 메시지.

> 런처 플래그가 없다면 `run-integration-test.mjs`에 `--chat-timeout` 옵션을 선행 추가. 1분 실시간 대기는 금지.

**엣지케이스**:
- E1. 서버 `CHAT_TIMEOUT_MS` 와 불일치 시 더 짧은 쪽이 우세

---

## P4. 고급 설정 & 서버 재시작 `[SDK] [EDGE]`

### P-04-01: Thinking / Max Turns / Budget 값 저장
**절차**: 각 항목 입력 후 저장.
**기대 결과**: 새 세션부터 SDK 파라미터로 전달됨 (E 도메인과 교차검증).

### P-04-02: 서버 재시작
**절차**:
1. 현재 접속 URL 호스트가 `localhost` 또는 `127.0.0.1` 인지 확인 (`browser_evaluate("() => location.hostname")`). 다른 값이면 브라우저를 `http://localhost:3000` 으로 재접속
2. Settings → Advanced → "Restart Server" 버튼 클릭 → 확인 모달 승인
**기대 결과**:
- 서버 프로세스 재기동
- 클라이언트: 일시 연결 끊김 후 자동 재연결 (R1과 동일)
- 재시작 전 진행 중 스트림은 abort 처리

**엣지케이스**:
- E1. 원격 접속(비-loopback)에서 재시작 버튼 비활성

---

## P5. 서버 업데이트 체크 & 업데이트 `[EDGE]`

### P-05-01: 업데이트 확인
**절차**: About 섹션 → "Check for Updates" 또는 백엔드 `/api/server/check-update` 호출.
**기대 결과**:
- 현재 버전 vs npm 레지스트리 최신 버전 표시
- 신버전 있을 시 업데이트 버튼 활성

### P-05-02: 업데이트 수행
**기대 결과**:
- `/api/server/update` 호출 → npm update 실행
- 완료 후 서버 재시작 플로우 진입 (P-04-02)
- 실패 시 롤백 안내

**엣지케이스**:
- E1. 네트워크 차단 → 조용히 실패하지 말고 명확히 오류
- E2. 권한 부족 (glob 설치 경로) → 사용자 가이드 표시
