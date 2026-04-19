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
1. 런처를 `--chat-timeout=10000`으로 별도 포트에서 기동 (`node scripts/run-integration-test.mjs --port=21215 --chat-timeout=10000`)
2. `browser_tabs(action="new")` → **`http://localhost:21215`** 로 접속 (반드시 `localhost` 사용; `127.0.0.1`은 주 서버와 쿠키 origin이 달라 자동 로그인 실패). 쿠키가 공유되어 재로그인 없이 접속됨
3. `/api/preferences`에서 `chatTimeoutMs: 10000` 확인
4. 새 세션에서 Ask 모드로 전환 → 파일 편집 권한 요청 유도 ("Create a file named test.txt")
5. 권한 요청(ToolCard) 표시 후 응답하지 않고 15초 대기
6. "응답 시간이 초과되었습니다. 다시 시도해 주세요." 메시지 확인
7. 시나리오 완료 후 탭 닫기 + 별도 포트 런처 프로세스 종료

**기대 결과**: SDK 활동이 10초 이상 없을 때 타임아웃 발동 → 자동 abort + "응답 시간이 초과되었습니다." 메시지.

> **중요**: 타임아웃은 **활동 기반(activity-based)** — [websocket.ts:2556-2569](packages/server/src/handlers/websocket.ts#L2556-L2569) 참고. SDK 콜백 이벤트마다 `resetTimeout()`이 호출되므로, 단순히 긴 응답을 유도하는 것으로는 타임아웃이 발동하지 않음. 권한 요청 대기처럼 SDK 이벤트가 완전히 멈춘 상태여야 함.
> 클램프: 5s~30min 범위 외 값은 기본값(300000ms)으로 대체됨.

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

### P-05-01: 업데이트 확인 `[MANUAL]`
**절차 (수동)**: About 섹션 → "Check for Updates" 또는 백엔드 `/api/server/check-update` 호출.

**기대 결과**:
- 현재 버전 vs npm 레지스트리 최신 버전 표시
- 신버전 있을 시 업데이트 버튼 활성

> **[MANUAL] 사유**: 개발 모드(소스 체크아웃 환경)에서는 [serverController.ts:246-249](../../packages/server/src/controllers/serverController.ts#L246-L249)가 `501 NOT_APPLICABLE`을 반환하고 About UI에도 버튼이 숨겨진다. 글로벌/npx 설치 환경에서만 동작하므로 릴리즈 직전 수동 회귀에 포함.

### P-05-02: 업데이트 수행 `[MANUAL]`
**절차 (수동)**:
1. 별도 머신/VM에 `npm install -g hammoc@<이전버전>` 으로 구버전 설치
2. 해당 Hammoc 서버 기동 후 Settings → About → "Update" 버튼 클릭
3. `/api/server/update` 호출 → npm update 실행 → 서버 자동 재시작 확인
4. 재접속 후 버전이 최신으로 올라갔는지 확인

**기대 결과**:
- `/api/server/update` 호출 → npm update 실행
- 완료 후 서버 재시작 플로우 진입 (P-04-02)
- 실패 시 롤백 안내

> **[MANUAL] 사유**: 개발 모드(소스 체크아웃 환경)에서는 [serverController.ts:273-275](packages/server/src/controllers/serverController.ts#L273-L275)가 `DEV_ONLY` 403을 반환함. 실제 검증은 글로벌/npx 설치 환경에서만 가능하므로 릴리즈 직전 수동 회귀에 포함.

**엣지케이스**:
- E1. 네트워크 차단 → 조용히 실패하지 말고 명확히 오류
- E2. 권한 부족 (glob 설치 경로) → 사용자 가이드 표시
