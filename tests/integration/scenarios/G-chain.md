# G. 프롬프트 체인

**범위**: 체인 항목 관리, 순차 실행 & 재시도, 다중 탭 동기화.
**선행 도메인**: A, B, C.

---

## G1. 체인 항목 추가 · 삭제 · 재정렬 `[CORE] [DnD]`

### G-01-01: 체인 배너 추가
**절차**:
1. 채팅에 스트리밍 진행 중인 상태에서 ChatInput에 프롬프트 입력
2. "체인에 추가" 버튼 클릭
3. 2~3개 더 추가

**기대 결과**:
- `chain:add` 이벤트 전송
- PromptChainBanner에 대기 목록 표시
- 각 항목 삭제 버튼 동작

### G-01-02: 드래그로 순서 변경 `[DnD]`
**목적**: pending 상태인 체인 항목을 드래그드롭으로 재정렬하고, 서버에 동기화되는지 검증.

**타이밍 전략**: 짧은 프롬프트 10개를 추가한다. 체인 drain은 한 번에 하나씩 처리하므로, 첫 번째 항목이 응답받는 짧은 시간(~2초) 동안 나머지 9개는 `pending` 상태로 DOM에 유지된다. 이 구간에 DnD를 실행한다. 긴 응답 프롬프트나 특수한 인프라 없이 **항목 수로 타이밍 창을 확보**한다.

**절차**:
1. 체인 모드 ON 후 짧은 항목 10개를 순서대로 추가 (모두 `"hi"`):
   ```js
   // 체인 추가 버튼을 10회 반복하거나, 체인 입력 후 Enter로 빠르게 추가
   // 각 항목 내용: "hi" (동일해도 무방, 순서 변경으로 검증)
   ```
2. 항목 추가 직후(첫 번째 drain이 시작되기 전 또는 직후) draggable 항목이 최소 5개 이상 있는지 확인:
   ```js
   browser_evaluate(`() => document.querySelectorAll('[data-testid="chain-item"][draggable="true"]').length`)
   ```
3. draggable pending 항목 중 첫 번째를 마지막으로 이동 — `dragenter` 필수:
   ```js
   browser_evaluate(`() => {
     const pending = [...document.querySelectorAll('[data-testid="chain-item"][draggable="true"]')];
     if (pending.length < 2) return 'not enough: ' + pending.length;
     const src = pending[0], dst = pending[pending.length - 1];
     const dt = new DataTransfer();
     src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
     src.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer: dt }));
     return [...document.querySelectorAll('[data-testid="chain-item"][draggable="true"]')]
       .map((el, i) => i + ':' + el.textContent.trim().slice(0, 6));
   }`)
   ```
4. `chain:reorder` 소켓 이벤트 전송 확인 (payload: `{ sessionId, ids: [...] }`)
5. 반환된 배열에서 원래 첫 번째 항목 ID가 마지막으로 이동했는지 확인
6. 현재 드레인 중인 스트림이 완료되면 큐가 재정렬 순서대로 실행되는지 관찰.

**기대 결과**:
- `chain:reorder` 소켓 이벤트 전송, 서버 `chainState` 갱신
- 두 번째 탭에서도 동일한 재정렬 순서로 브로드캐스트됨

> **구현 참조**: [PromptChainBanner.tsx:116-191](../../packages/client/src/components/PromptChainBanner.tsx#L116-L191), [websocket.ts chain:reorder 핸들러](../../packages/server/src/handlers/websocket.ts#L1542-L1571).
>
> `browser_drag` MCP 툴은 pointermove 기반이라 HTML5 DnD에서 종종 실패함. `DragEvent` 직접 디스패치가 안정적.

---

## G2. 체인 순차 실행 & 재시도 `[ASYNC] [EDGE]`

### G-02-01: 자동 순차 전송
**절차**:
1. 3개 항목이 대기 중인 상태에서 현재 스트림 완료
2. 자동으로 첫 항목 전송되는 것을 관찰

**기대 결과**:
- 항목 상태 전이: pending → sending → sent
- 각 항목 간 지연 없이 순차 실행
- 모든 항목 완료 시 배너 자동 숨김

### G-02-02: 실패 시 재시도 (최대 3회)
**유도**: 테스트 런처에서 제공하는 디버그 엔드포인트로 체인 drain 실패를 주입한다. 서버는 `CHAIN_MAX_RETRIES=3`까지 재시도한 뒤 `~/.hammoc/chain-failures/<sessionId>.json`에 기록한다 ([websocket.ts:360-376](../../packages/server/src/handlers/websocket.ts#L360-L376)).

**선행 조건**: 테스트 런처 사용 (`ENABLE_TEST_ENDPOINTS=true`) — `/api/debug/fail-next-chain-item` 엔드포인트 등록 필요.

**절차**:
1. 빈 세션에 체인 항목 1개 추가 (`"hi"` 정도). 세션 ID 확인:
   ```js
   browser_evaluate(`() => location.pathname.split('/session/')[1]`)
   ```
2. 다음 3번의 drain 시도를 모두 실패로 주입:
   ```js
   browser_evaluate(`(sid) => fetch('/api/debug/fail-next-chain-item', {
     method: 'POST',
     headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ sessionId: sid, count: 3 }),
     credentials: 'include'
   }).then(r => r.json())`, '<sessionId>')
   ```
3. `browser_snapshot` 또는 `browser_wait_for`로 배너에 오류 표시 및 `status="failed"` 전환 대기 (3번의 drain 시도가 다 실패할 때까지 약 2~3초 소요).
4. 파일 시스템에서 실패 기록 확인:
   ```bash
   # Bash 도구로 확인
   cat ~/.hammoc/chain-failures/<sessionId>.json
   ```

**기대 결과**:
- 각 drain 시도마다 `retryCount`가 1 → 2 → 3으로 증가
- 3회째에 `status="failed"`, 체인 배너에 오류 표시
- `chain-failures/<sessionId>.json`에 실패 항목이 persist됨
- 후속 pending 항목이 있다면 대기 유지

**엣지케이스**:
- E1. 주입된 실패 수가 `CHAIN_MAX_RETRIES` 미만이면 retry 성공 후 정상 drain (e.g. `count: 2` 후 3회째 성공).
- E2. 엔드포인트 미등록 환경(ENABLE_TEST_ENDPOINTS 없음): 404 응답 — 시나리오 BLOCKED로 기록하지 말고 런처를 재기동할 것.

---

## G3. 다중 탭 동기화 `[EDGE]`

### G-03-01: 탭 A에서 추가 → 탭 B에 즉시 반영
**절차**:
1. `browser_tabs(action="new")` 로 동일 세션 두 탭 오픈
2. 탭 A에서 체인 항목 추가
3. 탭 B `browser_snapshot` → 배너 업데이트 확인

**기대 결과**: 두 탭의 체인 상태가 동일 (`chain:update` 이벤트).

### G-03-02: 세션 전환 시 체인 상태
**절차**: 체인이 대기 중인 세션에서 다른 세션으로 이동 후 복귀.
**기대 결과**: 체인 상태 유지 (세션 단위로 저장).
