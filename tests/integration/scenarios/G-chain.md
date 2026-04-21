# G. 프롬프트 체인

**범위**: 체인 항목 관리, 순차 실행 & 재시도, 다중 탭 동기화.
**선행 도메인**: A, B, C.

---

## G1. 체인 항목 추가 · 삭제 · 재정렬 `[CORE] [DnD]`

### G-01-01: 체인 배너 추가
**선행 조건**: 새 세션에 **긴 응답 유도 프롬프트**를 먼저 전송해 스트리밍을 지속시킨다. idle 세션에서 체인 항목을 추가하면 서버가 즉시 drain하므로 pending 상태가 DOM에 유지되지 않는다.

**절차**:
1. 새 세션 진입 후 체인 모드가 OFF인 상태에서 2000자 이상 essay 프롬프트 전송:
   ```
   Write a detailed 2000-word essay on the history of computing.
   ```
   → `[aria-label="Claude가 응답을 생성하고 있습니다"]` 노출 확인
2. 체인 모드 ON (`button[aria-label="체인 모드 켜기"]` 클릭 → aria-label이 "체인 모드 끄기"로 변경)
3. 빠르게 3개 항목 추가 (textarea에 텍스트 → `button[aria-label="체인에 추가"]` 클릭 반복):
   ```js
   browser_evaluate(`async () => {
     const ta = document.querySelector('textarea');
     const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
     const addBtn = () => document.querySelector('button[aria-label="체인에 추가"]');
     for (const t of ['Item A', 'Item B', 'Item C']) {
       setter.call(ta, t);
       ta.dispatchEvent(new Event('input', { bubbles: true }));
       await new Promise(r => setTimeout(r, 120));
       addBtn()?.click();
       await new Promise(r => setTimeout(r, 100));
     }
   }`)
   ```
4. 배너 상태 조회:
   ```js
   browser_evaluate(`() => {
     const banner = document.querySelector('[data-testid="prompt-chain-banner"]');
     return { present: !!banner, aria: banner?.getAttribute('aria-label'), text: banner?.textContent.slice(0, 150) };
   }`)
   ```
   → `aria`에 "프롬프트 체인: 다음 명령 대기 중 — ...", `text`에 "다음\<첫항목\>+\<N-1\>" 포함
5. 배너를 펼쳐 개별 삭제 버튼 검증:
   ```js
   browser_evaluate(`() => {
     document.querySelector('button[aria-label="체인 목록 펼치기"]')?.click();
     const removeBtns = Array.from(document.querySelectorAll('[data-testid="chain-item"] button[aria-label^="프롬프트 삭제"]'));
     removeBtns[removeBtns.length - 1]?.click();
     return { removeBtnCount: removeBtns.length };
   }`)
   ```
   → 최소 1개 이상의 삭제 버튼 존재 및 클릭 후 활성 항목 수가 감소

**기대 결과**:
- `chain:add` 이벤트 전송 (socket.io POST)
- PromptChainBanner(`data-testid="prompt-chain-banner"`) DOM 생성, aria에 대기 메시지 포함
- 펼친 상태에서 각 chain-item에 개별 삭제 버튼(`aria-label^="프롬프트 삭제"`) 존재, 클릭 시 항목 제거

### G-01-02: 드래그로 순서 변경 `[DnD] [MANUAL]`
**목적**: pending 상태인 체인 항목을 드래그드롭으로 재정렬하고, 서버에 동기화되는지 검증.

> **자동화 불가 사유 (2026-04-20 확인)**:
> 1. idle 세션에서 체인 항목을 추가하면 서버가 **즉시** drain하여 pending 상태 DOM이 유지되지 않음 — 10개를 빠르게 추가해도 DOM에 `draggable="true"`인 chain-item이 관찰되지 않음
> 2. 가령 pending 창을 확보하더라도 Playwright `DragEvent` 디스패치가 React DnD 핸들러에서 재정렬을 트리거하지 못하는 DnD 제약 (F-02-02/F-05-02 동일 원인)
>
> 두 가지 이유로 자동화 경로 불가 — **릴리즈 직전 수동 회귀에서 확인**한다.

**수동 절차**:
1. 세션에 긴 응답 유도 프롬프트 1개 전송 (예: "Write a 2000-word essay on X") → 스트리밍 진행 중임을 확인
2. 체인 모드 ON 후 pending 상태가 유지되도록 짧은 프롬프트 5개 이상 빠르게 추가 (각 `"hi N"`)
3. PromptChainBanner에서 pending 항목 카드 확인 (GripVertical 핸들 가시)
4. 첫 번째 pending 항목을 마우스로 드래그해 마지막 위치로 이동 → release
5. 배너에서 순서 변경 즉시 반영 확인
6. DevTools Network 탭에서 WebSocket 메시지 중 `chain:reorder` 이벤트가 전송됐는지 확인 (payload: `{ sessionId, ids: [...] }`)
7. (선택) 같은 세션을 다른 탭에서 열어 재정렬이 브로드캐스트되는지 확인

**기대 결과**:
- `chain:reorder` 소켓 이벤트 전송, 서버 `chainState` 갱신
- 두 번째 탭에서도 동일한 재정렬 순서로 브로드캐스트됨
- 첫 번째 drain 스트림이 완료되면 재정렬된 순서대로 큐 실행

> **구현 참조**: [PromptChainBanner.tsx:116-191](../../packages/client/src/components/PromptChainBanner.tsx#L116-L191), [websocket.ts chain:reorder 핸들러](../../packages/server/src/handlers/websocket.ts#L1542-L1571).

---

## G2. 체인 순차 실행 & 재시도 `[ASYNC] [EDGE]`

### G-02-01: 자동 순차 전송
**선행 조건**: G-01-01 절차 1~3과 동일한 방식으로 스트리밍 중 세션에 pending 항목 3개가 적재된 상태. (idle 세션은 즉시 drain되어 상태 관찰 불가)

**절차**:
1. G-01-01 절차 1~3 수행하여 essay 스트리밍 중인 세션에 체인 3개 적재
2. 배너를 펼친 뒤 chain-item 상태를 DOM 속성으로 관찰:
   ```js
   browser_evaluate(`() => {
     document.querySelector('button[aria-label="체인 목록 펼치기"]')?.click();
     return Array.from(document.querySelectorAll('[data-testid="chain-item"]')).map(li => ({
       text: (li.textContent || '').slice(0, 60),
       draggable: li.getAttribute('draggable'),
       spinner: !!li.querySelector('.animate-spin')
     }));
   }`)
   ```
   → 첫 항목: `draggable="false"`, `spinner=true` (**sending**) / 나머지: `draggable="true"`, `spinner=false` (**pending**) — [PromptChainBanner.tsx:119-167](../../packages/client/src/components/PromptChainBanner.tsx#L119-L167) 렌더 로직 참조
3. 첫 스트림 완료 또는 중단 → 나머지 항목이 순차로 sending→sent 전이되는지 관찰
4. 모두 완료 후 배너 DOM이 사라지는지 확인:
   ```js
   browser_evaluate(`() => !!document.querySelector('[data-testid="prompt-chain-banner"]')`)
   ```
   → `false`

**기대 결과**:
- chain-item의 `draggable`/`.animate-spin`로 pending↔sending 상태 구분 관찰 가능
- 각 항목 간 별도 지연 없이 순차 실행 (user 메시지 순서 보존)
- `activeItems` 필터(`pending`/`sending`만)가 비면 `PromptChainBanner`는 null 반환 → 배너 자동 숨김

### G-02-02: 실패 시 재시도 (최대 3회)
**유도**: 테스트 런처에서 제공하는 디버그 엔드포인트로 체인 drain 실패를 주입한다. 서버는 `CHAIN_MAX_RETRIES=3`까지 재시도한 뒤 `~/.hammoc/chain-failures/<sessionId>.json`에 기록한다 ([websocket.ts:360-376](../../packages/server/src/handlers/websocket.ts#L360-L376)).

**선행 조건**: 테스트 런처 사용 (`ENABLE_TEST_ENDPOINTS=true`) — `/api/debug/fail-next-chain-item` 엔드포인트 등록 필요.

**절차** (순서 중요 — 실패 주입을 반드시 항목 추가 **전에** 수행):
1. 새 빈 세션 진입 → 세션 ID 확인:
   ```js
   browser_evaluate(`() => location.pathname.split('/session/')[1]`)
   ```
2. **체인 항목을 추가하기 전에** 다음 3번의 drain 시도를 모두 실패로 주입:
   ```js
   browser_evaluate(`async () => {
     const sid = location.pathname.split('/session/')[1];
     return fetch('/api/debug/fail-next-chain-item', {
       method: 'POST',
       headers: {'Content-Type':'application/json'},
       body: JSON.stringify({ sessionId: sid, count: 3 }),
       credentials: 'include'
     }).then(r => r.json());
   }`)
   ```
   → `{ success: true, sessionId, count: 3 }` 응답 확인
3. 이제 체인 모드 ON → 짧은 항목 1개 추가 (`"hi"` 정도) → 체인이 drain을 시도하면서 서버가 주입된 실패를 throw함 ([websocket.ts:336](../../packages/server/src/handlers/websocket.ts#L336))
4. `status="failed"`로 전환되면 `activeItems`(pending/sending) 필터에서 제외되어 **배너 DOM이 사라진다** ([PromptChainBanner.tsx:40-41](../../packages/client/src/components/PromptChainBanner.tsx#L40-L41)). 이는 정상 동작이므로 "배너 없음"을 FAIL로 판정하지 말 것. 대신 파일시스템 persist를 hard-check 기준으로 사용한다:
   ```bash
   # Bash 도구로 파일 존재 및 retryCount=3 확인 — 약 5~10초 후
   cat ~/.hammoc/chain-failures/<sessionId>.json
   ```
   → `{ "failures": [{ "id": "...", "content": "hi", "status": "failed", "retryCount": 3 }] }`

> **절차 순서 주의**: `fail-next-chain-item`은 **다음 N번의 drain 호출에서 소모**된다 (`consumeChainDrainFailureInjection`). 체인 항목을 먼저 추가하면 첫 drain이 실패 주입 **이전에** 정상 실행돼 retry를 관찰할 수 없게 된다. 반드시 실패 주입 → 항목 추가 순서를 지킨다.

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
**선행 조건**: 탭 A에서 스트리밍이 진행 중이어야 체인 항목이 pending 상태로 유지된다.

**절차**:
1. 탭 A에서 새 세션 생성 → **체인 모드 OFF로 긴 essay 프롬프트 전송해 스트리밍 시작**:
   ```
   Write a detailed 3000-word essay on the history of programming languages.
   ```
2. `browser_tabs(action="new")` 후 탭 B를 동일 세션 URL로 이동
3. 탭 A로 전환(`browser_tabs(action="select", index=0)`) → 체인 모드 ON → 3개 항목(`TabA-1/2/3`) 빠르게 추가 (G-01-01 절차 3 스니펫 재사용)
4. 탭 B로 전환(`browser_tabs(action="select", index=1)`) → 배너 조회:
   ```js
   browser_evaluate(`() => {
     const banner = document.querySelector('[data-testid="prompt-chain-banner"]');
     return { aria: banner?.getAttribute('aria-label'), text: banner?.textContent.slice(0, 100) };
   }`)
   ```
   → 탭 A와 동일한 `aria` 및 `text`("다음TabA-1+2")

**기대 결과**: 두 탭의 체인 상태가 동일 (`chain:update` 이벤트 브로드캐스트). 서버에서 방송하는 체인 상태가 세션에 연결된 모든 소켓에 전파됨.

### G-03-02: 세션 전환 시 체인 상태
**선행 조건**: 원본 세션에 **스트리밍 진행 중** 상태에서 pending 체인 항목이 적재되어 있어야 한다. idle 세션은 이미 drain된 상태라 검증 의미가 없다.

**절차**:
1. G-03-01 절차 1~3과 동일하게 세션 `S1`에 스트리밍 + 체인 3개 pending 확보
2. 원본 세션 ID 저장:
   ```js
   browser_evaluate(`() => location.pathname.split('/session/')[1]`)
   ```
3. 세션 패널에서 다른 기존 세션 `S2` 클릭 → 이동 후 `data-testid="prompt-chain-banner"` **없음** 확인 (세션 스코프 검증)
4. `browser_navigate`로 `S1` URL 다시 방문 → 배너 재표시 및 동일한 pending 3개 유지 확인:
   ```js
   browser_evaluate(`() => {
     const banner = document.querySelector('[data-testid="prompt-chain-banner"]');
     return { present: !!banner, text: banner?.textContent.slice(0, 100) };
   }`)
   ```
   → `present=true`, `text="다음TabA-1+2"`

**기대 결과**:
- 다른 세션 이동 시 배너 미표시 (세션 단위 체인 분리)
- 원본 세션 복귀 시 체인 상태 유지 (서버 `chainState` 단일 소스)
