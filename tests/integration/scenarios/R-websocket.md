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
1. 세션 진입 후 URL 에서 `sessionId` 파싱 (`location.pathname.split('/session/')[1]`).
2. "Count slowly from 1 to 30, one number per second. Put each number on its own line." 프롬프트 전송 → 스트림 시작.
3. 3초 대기 후 `POST /api/debug/kill-ws` (표준 절차) 로 현재 세션 소켓 강제 종료.
4. 재연결 증거 수집 — 다음 중 **둘 중 하나**로 재연결을 확정:
   - (권장) `browser_network_requests(filter='socket.io')` 로 kill-ws 전후의 `sid` 쿼리 파라미터가 달라지는지 확인 (새 EIO handshake → 새 `sid`). 배너는 수십~수백 ms 만에 사라질 수 있으므로 이 방식이 가장 안정적.
   - (옵셔널) `browser_wait_for(text='재연결')` 최대 2초 — 빠른 재연결 시 타이밍 상 놓칠 수 있으므로 실패해도 시나리오 FAIL 처리하지 말 것.
5. 스트림 완료까지 대기 (`browser_wait_for` 로 최종 숫자 `30` 가시성).
6. `browser_evaluate`로 어시스턴트 메시지 본문에서 `/(?<![0-9])(\d{1,2})(?![0-9])/g` 매치해 1~30 집합을 추출, 전부 포함되며 중복 없음을 검증.

**기대 결과**:
- socket.io sid 교체 확인 (kill-ws 전후 서로 다른 `sid`).
- 재연결 후 진행 중 스트림 버퍼 재생 (`stream:buffer-replay`) — 최종 응답에 1~30 전부 포함, 중복 없음.
- "재연결 중" 배너 포착은 **옵셔널**. 빠른 재연결 환경에서는 snapshot 타이밍 전에 사라지므로 이 항목 단독으로는 FAIL 근거가 아님.

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
1. 탭 A에서 긴 응답 유도 프롬프트 전송 (예: "Write a 500-word essay on recursion in programming. Include examples.").
2. 응답 시작 확인 후 (첫 청크가 메시지 버블에 나타난 직후) `browser_tabs(action='new')` → 동일 세션 URL 열기.
3. 탭 B에서 `browser_snapshot` 즉시 수행 — 이미 과거 메시지와 현재까지 스트림된 내용이 렌더되어 있어야 함.
4. 양쪽 탭 모두 스트림 완료까지 대기.
5. `browser_evaluate`로 탭 A와 탭 B의 마지막 어시스턴트 메시지 본문 **길이 + 간이 해시**를 비교:
   ```js
   () => {
     const last = [...document.querySelectorAll('[role="log"] [role="listitem"]')].slice(-1)[0];
     const t = last?.textContent?.trim() || '';
     return { len: t.length, hash: [...t].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) };
   }
   ```

**기대 결과**:
- 두 탭의 최종 어시스턴트 메시지 본문의 **길이와 해시가 동일** (서버가 `stream:history` + `stream:buffer-replay`로 탭 B를 탭 A와 동일 상태로 수렴시킴).
- Opus 같이 응답이 빠른 모델은 탭 B가 열리는 순간 이미 스트림이 완료될 수 있음 — "진행 중 메시지 수신" 자체는 관찰이 어렵지만 최종 수렴이 보장되면 PASS.

### R-02-02: 히스토리 순서 일관성
**절차**:
1. 세션에서 3~4회 메시지 전송/응답 완료. 각 프롬프트에 구별 가능한 마커(예: `ECHO-1`, `ECHO-2`)를 넣으면 비교가 쉬움.
2. `browser_evaluate('() => location.reload()')` 로 재로드 → 첫 렌더 완료 대기 후 메시지 순서 기록.
3. 다시 한 번 reload → 두 번째 DOM 순서 기록.
4. 두 DOM 순서를 `browser_evaluate`로 비교. 시간 표시(`방금 전` / `n분 전`)가 본문에 섞여 있으므로 앞쪽 40자만 비교하거나 본문만 추출:
   ```js
   () => [...document.querySelectorAll('[role="log"] [role="listitem"]')]
     .map(el => el.textContent.trim().replace(/(방금 전|\d+분 전|\d+시간 전)$/g, '').slice(0, 60))
   ```
   참고: 예전 버전의 `[data-testid="message-bubble"]` 셀렉터는 현재 구현에 존재하지 않음. `[role="log"] > [role="listitem"]` 이 실제 구조.

**기대 결과**: 두 번의 재로드 후 DOM 순서(본문 기준)가 동일 — 서버의 JSONL 기록과 일치하므로 순서 재현성이 보장됨.

---

## R3. 다중 컨텍스트 동기화 `[EDGE]`

> 본 시나리오는 **같은 브라우저의 다중 탭**(`browser_tabs`)으로 동기화 경로를 검증한다. 크로스 엔진(Chrome↔Firefox) 차이는 별도 CI 브라우저 매트릭스에서 다룬다.

### R-03-01: 두 탭에서 같은 세션 동기화
**절차**:
1. 탭 A에서 새 세션 진입.
2. `browser_tabs(action='new')` → 같은 세션 URL 열기 (탭 B). 탭 B 초기 메시지 수 기록 (보통 0).
3. 탭 A에서 짧은 마커 프롬프트(예: `"Reply with exactly: SYNC-TAB-A"`) 전송 → 응답 완료 대기.
4. `browser_tabs(action='select', index=1)` 탭 B 이동 → `browser_evaluate`로 메시지 목록 개수 + 마커 텍스트 존재 확인:
   ```js
   () => {
     const items = [...document.querySelectorAll('[role="log"] [role="listitem"]')];
     return { count: items.length, hasMarker: items.some(el => /SYNC-TAB-A/.test(el.textContent)) };
   }
   ```

**기대 결과**: 탭 B에 탭 A의 유저 메시지 + Claude 응답이 실시간(재로드 없이) 반영됨. `count >= 2` 및 `hasMarker === true`.

### R-03-02: 권한 응답 경합
**목적**: 두 탭이 동일 세션을 공유할 때 한 탭의 권한 응답이 다른 탭의 모달을 즉시 닫는지 검증.

**도구 선택**: Bash 도구를 사용한다 (Write는 "File has not been read yet" SDK 오류 선행). 단, Bash 명령은 `~/.claude/settings.json` **그리고** `~/.claude/settings.local.json` 의 allowlist 어느 한쪽이라도 매치되면 SDK가 `canUseTool` 을 스킵해 모달이 뜨지 않는다 — 실행 전에 두 파일 모두 확인하고 매치되지 않는 **쓰기 계열** 명령을 사용할 것. `echo` 는 `settings.local.json` 에 `Bash(echo:*)` 가 등록된 경우가 많아 부적합. `whoami`/`ls` 등 read-only 명령은 Claude Code 번들 safe-bash 목록에 포함되어 허용/거부 모달 없이 자동 통과됨. 따라서 `mkdir /tmp/hammoc-r0302-<고유토큰>` 같은 **unique-path mkdir** 이 가장 안정적.

**모드**: **Ask 모드 (`permissionMode='default'`)**. `bypassPermissions`/`acceptEdits`는 자동 승인.

**절차**:
1. `browser_tabs(action='new')`로 탭 B 오픈, 같은 세션 URL 접속 → 두 탭이 같은 `sessionId` 공유 확인.
2. Ask 모드 확인 (UI 칩 레이블 "Ask" 또는 `useChatStore.permissionMode` 값 `'default'`). preferences 값만 확인하는 건 불충분 — 3.6.1 의 "Preferences vs useChatStore 불일치" 함정 참고.
3. 탭 A에서 `"Use the Bash tool to run: mkdir /tmp/hammoc-r0302-<고유토큰>"` 전송 → 두 탭 모두에서 Bash 인라인 허용/거부 버튼 노출 확인:
   ```js
   browser_evaluate(`() => {
     const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
     return { hasAllow: btns.some(t => t === '허용' || t === '도구 실행 허용'),
              hasDeny: btns.some(t => t === '거부' || t === '도구 실행 거절') };
   }`)
   ```
4. 탭 A에서 "도구 실행 허용" 클릭 → 즉시 `browser_tabs(action='select', index=1)`로 탭 B 전환.
5. 탭 B에서 `browser_evaluate`로 허용/거부 버튼이 사라지고 `[role="listitem"][aria-label^="도구 완료"]` 또는 ToolCard 상태가 `Completed` 로 전이됐는지 확인.
6. (cleanup) 생성된 디렉토리 정리는 옵셔널 — 고유 경로라 다음 실행에 영향 없음.

**기대 결과**:
- 먼저 도착한 응답이 서버 상태에 적용됨 (client→server `permission:respond`, server→all-session-sockets `permission:resolved`)
- 두 번째 탭의 모달/인라인 버튼은 자동으로 닫히거나 비활성화됨
- 서버 상태 일관성: 동일 `toolUseId`에 대한 중복 응답은 서버에서 무시

**엣지케이스**:
- E1. 두 탭이 거의 동시에 응답 제출 → 먼저 도착한 쪽이 채택되고 나머지는 "already answered" 또는 무시 처리
- E2. 탭 A가 허용 직후 탭 B가 거절 클릭 → 탭 B 클릭은 무시, Bash는 이미 실행된 상태

### R-03-03: 세션 권한 모드 다중 탭 실시간 동기
**목적**: 같은 세션을 보는 두 탭에서 한쪽이 입력바 권한 칩을 바꾸면 다른 탭 칩이 `permission:mode-change` 이벤트로 즉시 갱신되는지 확인.

**배경**: 권한 모드에는 두 개의 분리된 상태가 있다.
- **세션별 현재 모드** (`useChatStore.permissionMode` · 입력바 칩): 세션 입력바 칩 클릭 → `socket.emit('permission:mode-change', ...)` → 서버가 같은 세션 룸에 브로드캐스트 → 다른 탭 칩 즉시 갱신. **본 시나리오 대상.**
- **기본 권한 모드 preferences** (`permissionMode` 필드, 설정 페이지 라디오): `PATCH /api/preferences`만 호출하며 Socket 브로드캐스트 없음. 새 세션 시작 시에만 적용되고 다른 탭에는 reload 전까지 전파되지 않는다. 제품 의도된 동작.

**선행 조건**:
- `permissionSyncPolicy`가 `'always'`. 기본값 `'streaming'`은 스트림이 running 상태일 때만 브로드캐스트하므로, 유휴 상태 칩 변경은 전파되지 않는다. 절차 1단계에서 PATCH로 맞춘 뒤 마지막에 원복한다.

**절차**:
1. `browser_evaluate`로 현재 `permissionSyncPolicy` 기록 후 `PATCH /api/preferences { permissionSyncPolicy: 'always' }`로 변경.
2. 새 세션 진입 (탭 A). 입력바 권한 칩의 초기 모드(예: `Ask`) 기록.
3. `browser_tabs(action='new')`로 동일 세션 URL을 탭 B에서 열고 칩이 같은 초기 모드인지 확인.
4. 탭 A에서 권한 칩 클릭 (한 번 누르면 다음 모드로 전이: `Ask → Auto` 등). 새 aria-label 기록.
5. `browser_tabs(action='select', index=1)` 탭 B 전환 → `browser_evaluate`로 입력바 권한 칩 aria-label 조회.
6. (cleanup) `permissionSyncPolicy`를 1단계에서 기록한 원래 값으로 복구, 탭 B 닫기.

**기대 결과**:
- 탭 A의 `permission:mode-change` emit → [websocket.ts](../../../packages/server/src/handlers/websocket.ts) 의 핸들러가 `socket.to('session:${sessionId}').emit('permission:mode-change', { mode })` 로 같은 세션 룸에 브로드캐스트.
- 탭 B의 입력바 권한 칩 `aria-label`이 탭 A와 동일 모드 값으로 즉시(2초 이내) 갱신됨. `useStreaming.ts`의 `handlePermissionModeChange` 리스너가 `useChatStore.setState({ permissionMode })`로 로컬 상태 반영.

**엣지케이스**:
- E1. `permissionSyncPolicy='streaming'` + 세션이 유휴 상태 → 브로드캐스트 건너뜀. 탭 B는 칩 변경 반영 안 됨. 의도된 동작이므로 설정 복원 후 재확인 필요.
