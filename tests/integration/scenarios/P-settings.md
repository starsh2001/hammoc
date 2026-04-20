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
**목적**: "Restart Server" 액션이 서버 프로세스를 실제로 재기동하고, 클라이언트가 자동 재연결 후 세션을 복원하는지 검증.

**선행 조건**: 스킬 인자 `password:<값>`로 자동 로그인된 상태 (재시작 후 세션 secret 재생성으로 재로그인 필요). 수동 실행 환경에서는 유저가 로그인 정보를 다시 입력해야 하므로 본 시나리오는 자동 모드에서만 PASS 가능.

**절차**:
1. 현재 접속 호스트가 `localhost` 또는 `127.0.0.1` 인지 확인 (`browser_evaluate("() => location.hostname")`). 다른 값이면 `http://localhost:3000` 으로 재접속 (원격 IP에서는 재시작 버튼 비활성 — E1 검증).
2. 재시작 전 상태 기록 (서버 버전/uptime 등):
   ```js
   browser_evaluate(`() => fetch('/api/health').then(r => r.json())`)
   ```
3. Settings → Advanced → "Restart Server" 클릭 → 확인 모달 승인
4. `browser_wait_for({ text: '로그인', time: 60 })` 또는 URL이 `/login`으로 전환되는 것 감지 — 서버 재기동으로 세션 무효화 확인
5. 자동 로그인 재수행 (스킬 자동 모드):
   ```js
   browser_evaluate(`() => {
     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
     const pw = document.querySelector('input[type="password"]');
     setter.call(pw, '<PASSWORD_FROM_SKILL_ARG>');
     pw.dispatchEvent(new Event('input', { bubbles: true }));
     return true;
   }`)
   // 이후 로그인 버튼 클릭 또는 Enter
   ```
6. 로그인 후 `/api/health` 재호출 → 서버 uptime이 초기화되어 시작점 가까운 값(3초 이내 등)인지 확인
7. 재시작 이전에 있던 세션 URL로 이동 → 세션이 히스토리와 함께 복원되는지 확인 (`stream:history` 수신)

**기대 결과**:
- 서버 프로세스 재기동 (uptime 리셋)
- 클라이언트: `io server disconnect` → `useWebSocket` 복구 로직으로 자동 재연결 시도
- 세션 secret 갱신으로 로그인 화면 노출 → 재로그인 후 세션 리스트 복원
- 재시작 이전 세션의 메시지 히스토리 모두 보존 (JSONL에서 로드)

**엣지케이스**:
- E1. 원격 접속(비-loopback)에서 재시작 버튼 비활성 — `location.hostname`이 로컬 IP가 아닐 때 UI 상태 검증
- E2. 재시작 직전 활성 스트림 있음: 스트림 abort 처리되고 마지막 상태까지의 메시지 JSONL 저장 확인

> **수동 로그인 환경 처리**: `password:<값>` 인자가 없으면 재로그인 단계(5)에서 유저 수동 입력 필요. 본 시나리오는 자동 모드에서만 자동으로 완결되며, 수동 모드에서는 절차 4까지만 자동 진행 후 유저 확인 대기.

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
