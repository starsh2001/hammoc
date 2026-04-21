# E. 모델 & SDK 파라미터 ★ SDK 핵심

**범위**: 모델 선택, Thinking Effort, Max Turns/Budget, 1M 컨텍스트.
**선행 도메인**: A, B, C.

> **공통 주의 — WebSocket 페이로드 직접 검증 불가**: 채팅 전송은 socket.io(WebSocket)로 이뤄진다. `browser_network_requests`는 HTTP만 기록하므로 `chat:send` 이벤트의 `model`/`effort` 파라미터를 직접 확인할 수 없다. 본 도메인 시나리오는 **응답 본문(모델 자기소개), ContextUsageDisplay 툴팁, ModelSelector 라벨** 등 클라이언트 측 관찰로 간접 검증한다.
>
> **공통 주의 — Playwright MCP 브라우저 세션 불안정성**: 대용량 textarea 값 주입(E-04-02의 ~200KB) 또는 장시간 세션 사용 후 MCP가 Chrome 연결을 잃는 현상이 재현됐다. 시나리오 중 `browserBackend.callTool: Target page, context or browser has been closed` 오류가 뜨면 (1) `browser_close` → (2) 잔여 `mcp-chrome-*` 프로세스 종료 → (3) `browser_navigate`로 동일 세션 URL 재진입 후 이어서 진행한다. 서버와 세션 상태는 보존되므로 중간 재개 가능.
>
> **공통 주의 — Preferences 복원 경로**: Max Budget / Max Turns / `modelOverride` 등을 변경한 시나리오는 종료 시 `PATCH /api/preferences` 또는 `PATCH /api/projects/:id/settings`로 원상 복원한다. 런처가 `~/.hammoc/preferences.json`을 시작 시 스냅샷·종료 시 복원하지만, 시나리오 내부에서도 정리해 크로스 시나리오 오염을 막는다.

---

## E1. 모델 선택 `[SDK] [CORE]`

### E-01-01: Opus / Sonnet / Haiku 전환
**절차**:
1. 새 세션 시작.
2. **채팅 입력바 하단**의 모델 버튼 (`aria-label^="모델:"`) 클릭 → 드롭다운 열림 확인:
   ```js
   browser_evaluate(`() => document.querySelector('[role="listbox"][aria-label]')?.getAttribute('aria-label')`)
   // 예: "모델 선택"
   ```
3. `Latest Opus` 옵션 선택:
   ```js
   browser_evaluate(`() => [...document.querySelectorAll('[role="option"]')].find(o => o.textContent.startsWith('OpusLatest'))?.click()`)
   ```
4. 모델명 확인용 프롬프트 전송: `Say your model name in one short line (e.g. "I am Claude Opus 4.7"). No other text.` → 응답 완료 대기.
5. 응답에 `Claude Opus` 문자열이 포함되는지 확인:
   ```js
   browser_evaluate(`() => {
     const last = [...document.querySelectorAll('[aria-label^="Claude 메시지"]')].pop();
     return last?.textContent?.match(/I am Claude (Opus|Sonnet|Haiku)[^\\n]*/)?.[0];
   }`)
   ```
6. 드롭다운 재오픈 → `Latest Sonnet` 선택 → 동일 프롬프트 재전송 → 응답에 `Claude Sonnet` 포함 확인.
7. `Latest Haiku` 선택 → 동일 반복 → 응답에 `Claude Haiku` 포함 확인.
8. (각 단계 후) 모델 버튼 `aria-label`이 `"모델: Opus"` / `"모델: Sonnet"` / `"모델: Haiku"` 순으로 갱신되는지 확인:
   ```js
   browser_evaluate(`() => document.querySelector('button[aria-label^="모델:"]')?.getAttribute('aria-label')`)
   ```

**기대 결과**:
- 세 모델 모두 자기소개 응답에서 모델 family가 일치 (Opus/Sonnet/Haiku)
- ModelSelector 버튼 aria-label이 선택한 모델로 갱신
- UsageStatusBar에 모델별 비용 반영 (숫자 자체 비교는 요금 변경에 취약하므로 "0 이상" 정도만 확인)
- **`chat:send` 페이로드 직접 검증 불가** — WebSocket이라 `browser_network_requests`로 잡히지 않음. 응답 본문의 모델명 일치로 간접 검증

**엣지케이스**:
- E1. **구모델(legacy)**: 드롭다운 옵션에 없는 모델 ID는 존재 안 함. 수동 입력 경로는 현재 UI에 없음
- E2. **스트리밍 중 모델 변경**: 스트리밍 중에도 모델 버튼은 활성 상태이나 현재 스트림은 기존 모델로 끝까지 진행. 다음 메시지부터 새 모델 적용. 재현은 긴 응답 유도 프롬프트 전송 중 모델 전환으로

### E-01-02: 프로젝트 기본 모델 설정
**절차**:
1. 현재 프로젝트의 원래 `modelOverride` 값 기록 (복원용):
   ```js
   browser_evaluate(`() => fetch('/api/projects/<PROJECT_ID>/settings', { credentials: 'include' }).then(r => r.json()).then(s => s.modelOverride ?? null)`)
   // `<PROJECT_ID>`는 현재 URL의 `/project/<ID>/` 세그먼트
   ```
2. `modelOverride`를 `claude-sonnet-4-6`으로 설정 (UI 대신 API로 직접 — 설정 페이지 왕복 생략):
   ```js
   browser_evaluate(`() => fetch('/api/projects/<PROJECT_ID>/settings', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     credentials: 'include',
     body: JSON.stringify({ modelOverride: 'claude-sonnet-4-6' })
   }).then(r => r.json())`)
   // 응답에 effectiveModel: 'claude-sonnet-4-6' 포함 확인
   ```
3. 프로젝트 페이지로 재진입 (새로고침해 preferences store 반영):
   ```
   browser_navigate("/project/<PROJECT_ID>")
   ```
4. 새 세션 시작.
5. **모델 버튼 상태 확인** — 버튼 텍스트와 드롭다운 Default 옵션 설명 양쪽 모두:
   ```js
   browser_evaluate(`() => {
     const btn = document.querySelector('button[aria-label^="모델:"]');
     btn?.click();
     return new Promise(r => setTimeout(() => {
       const defaultOpt = [...document.querySelectorAll('[role="option"]')].find(o => o.getAttribute('aria-selected') === 'true');
       r({
         buttonText: btn?.textContent?.trim(),           // "Sonnet" 기대
         defaultOptionText: defaultOpt?.textContent       // "DefaultSonnet 4.6" 기대 ("Default"+"Sonnet 4.6" 병합)
       });
     }, 100));
   }`)
   ```
6. 드롭다운 닫기 (`browser_press_key("Escape")`).
7. 모델명 확인 프롬프트 전송: `Say your model name in one short line. No other text.` → 응답 완료 대기.
8. 응답 본문에 `Sonnet 4.6` 또는 `Claude Sonnet 4.6` 문자열 포함 확인.
9. **정리** — `modelOverride`를 1단계에서 기록한 원래 값으로 복원 (보통 `null`):
   ```js
   browser_evaluate(`() => fetch('/api/projects/<PROJECT_ID>/settings', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     credentials: 'include',
     body: JSON.stringify({ modelOverride: null })
   }).then(r => r.json())`)
   ```

**기대 결과**:
- `PATCH /api/projects/:id/settings`가 `effectiveModel: 'claude-sonnet-4-6'` 반환
- ModelSelector 버튼 텍스트가 `"Sonnet"`으로 표시 (과거에는 전역 default만 참조해 "Opus" 표기하는 회귀가 있었으므로 재발 감시 — [ChatPage.tsx:725](../../packages/client/src/pages/ChatPage.tsx#L725) `effectiveActiveModel = projectModelOverride || defaultModel || activeModel`)
- 드롭다운 Default 옵션 설명이 `"Sonnet 4.6"`
- 응답 본문의 자기 소개가 Sonnet 계열
- 정리 후 `effectiveModel`이 전역 default로 복귀

---

## E2. Thinking Effort `[SDK]`

### E-02-01: Effort 레벨 전환 · ThinkingBlock 영속 렌더링
**전제**: Thinking Effort는 5 값 enum — `low | medium | high | xhigh | max` ([ModelSelector.tsx:139](../../packages/client/src/components/ModelSelector.tsx#L139)). 모델별 노출 bar 수가 다르다([ModelSelector.tsx:147-164](../../packages/client/src/components/ModelSelector.tsx#L147-L164)): 3 bar (Low/Medium/High — 레거시), 4 bar (+Max — Opus 4.6·Sonnet 4.6), 5 bar (+XHigh — Opus 4.7 only). **"Off" 레벨은 존재하지 않는다.** 명시적 선택이 없으면 `effort: undefined`로 전송되어 SDK 기본값(Opus 4.7=XHigh, 그 외=High)이 적용된다.

**절차**:
1. 새 세션 시작 → **채팅 입력바 하단**의 모델 버튼 (`aria-label^="모델:"`) 클릭 → 드롭다운에서 **Opus 4.7** 명시 선택 (5 bar 전부 노출하기 위함; Opus 4.7이 없으면 Opus 4.6 또는 `Latest Opus`로 대체하고 Max를 XHigh 대용으로 사용)
2. 모델 드롭다운을 다시 열어 Thinking Effort radiogroup 확인:
   ```js
   browser_evaluate(`() => {
     const rg = document.querySelector('[role="radiogroup"][aria-label*="노력" i], [role="radiogroup"][aria-label*="effort" i]');
     return {
       radios: [...(rg?.querySelectorAll('[role="radio"]') || [])].map(r => ({ title: r.title, checked: r.getAttribute('aria-checked') }))
     };
   }`)
   ```
   기대: `radios`가 5개이고 titles = `['Low','Medium','High','XHigh','Max']`. 전부 `aria-checked="false"`이면 effort 미선택 상태(SDK default).
3. **Low 선택** — React 커스텀 버튼은 단일 `click()`만으론 handler가 안 붙는 경우가 있으므로 pointer 시퀀스 포함:
   ```js
   browser_evaluate(`() => {
     const el = document.querySelector('[role="radio"][title="Low"]');
     ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true })));
     return el.getAttribute('aria-checked');  // → "true"
   }`)
   ```
   라디오 클릭은 **드롭다운을 닫지 않는다** (effort는 다시 닫지 않는 영구 선택). 드롭다운은 Escape 또는 바깥 클릭으로 닫는다.
4. 드롭다운 닫기 (`browser_press_key("Escape")`) → **thinking-강제 프롬프트** 전송. 평범한 "분석해줘"는 Opus 4.7이 thinking 없이 즉답하므로 비자명한 답 + 여러 접근 평가가 필요한 문제를 쓴다:
   ```
   12 balls puzzle: One of 12 balls has a different weight from the other 11 — you don't know if it's heavier or lighter. Using a two-pan balance, design a procedure that in exactly 3 weighings identifies the odd ball AND determines heavier-or-lighter. Respond with ONLY a compact decision tree (weighing 1 / weighing 2 / weighing 3 branches), no prose explanation, no preamble.
   ```
   응답 완료 대기 (전송 버튼 `disabled=true`이고 `button[aria-label="중단"]` 부재 시 완료)
5. **응답 turn에 ThinkingBlock이 영속 렌더링되는지 확인** ([ThinkingBlock.tsx:28-109](../../packages/client/src/components/ThinkingBlock.tsx#L28-L109) — 기본 collapsed이므로 `border-l-2 border-purple-*` 컨테이너 스타일은 **적용되지 않고**, 대신 Brain 아이콘 + "생각 중..." 텍스트 버튼으로만 존재). **중요**: ThinkingBlock은 `[aria-label^="Claude 메시지"]` 버블 박스 **밖**의 형제 요소로 렌더링된다 (같은 `.space-y-4` turn container의 다른 자식). 따라서 "마지막 어시스턴트 메시지 안"을 뒤지지 말고 **가장 최근 thinking 버튼을 전역 쿼리로** 찾는다:
   ```js
   browser_evaluate(`() => {
     const brainBtn = [...document.querySelectorAll('button[aria-expanded][aria-controls]')]
       .reverse()
       .find(b => b.querySelector('svg.lucide-brain'));
     return {
       hasThinkingButton: !!brainBtn,
       ariaExpanded: brainBtn?.getAttribute('aria-expanded'),
       buttonText: brainBtn?.textContent?.trim().slice(0, 30),
     };
   }`)
   ```
   각 레벨 테스트 전에 같은 쿼리로 **기존 Brain 버튼 수를 먼저 기록**하고 전송 후 **증가분(+1)이 생겼는지**로 "이번 턴에 새로 생성됐는가"를 판정한다. 여러 턴을 같은 세션에서 이어 테스트하면 누적되기 때문.
6. **Medium 선택** → 동일 프롬프트 재전송 → 완료 대기 → 동일 쿼리로 thinking button 존재 재확인
7. **Max 선택** → 동일 프롬프트 재전송 → 완료 대기 → 동일 쿼리로 thinking button 존재 재확인
8. (선택) 각 레벨에서 실제 전송된 effort 값을 Zustand store로 교차 확인 — store가 전역 노출되어 있으면 활용, 아니면 UI 라벨(`effort.tooltipFull.*`가 `버튼` title에 반영) 변화로 검증:
   ```js
   browser_evaluate(`() => document.querySelector('button[aria-label^="모델:"]')?.getAttribute('title')`)
   // 기대: "모델: Opus 4.7 · Low 사고" / "... · Medium 사고" / "... · Max 사고"
   ```

> **UI 위치 주의**: 모델 선택 및 Thinking Effort 셀렉터 모두 **채팅 입력바 하단 모델 버튼** 내부 동일 드롭다운에 있다([ModelSelector.tsx:294-397](../../packages/client/src/components/ModelSelector.tsx#L294-L397)). ChatHeader에는 모델 드롭다운이 없다.

**기대 결과**:
- radiogroup에 Low/Medium/High/XHigh/Max 5개 radio 존재 (Opus 4.7), 각 title 매칭
- Low/Medium/Max 각 레벨 클릭 시 해당 radio만 `aria-checked="true"`, 나머지 `"false"`
- 세 레벨 모두에서 프롬프트 전송·응답 수신 성공
- **Max에서 ThinkingBlock 영속 필수** — 12-balls 같은 thinking-강제 프롬프트 + Max effort 조합에서는 응답 완료 후에도 `button[aria-expanded][aria-controls]` + Brain 아이콘(`svg.lucide-brain`) + "생각 중..." 텍스트가 해당 turn 컨테이너 안에 남아있어야 한다 ([chatStore.ts:86](../../packages/client/src/stores/chatStore.ts#L86) `streamingSegments`에 thinking segment 영속). 이 한 레벨에서 thinking 경로가 동작함을 확인하면 `onThinking → thinking:chunk → addStreamingThinking → ThinkingBlock` 전체 체인 생존 검증으로 충분
- **Low / Medium은 thinking 생략 허용** — SDK가 effort 레벨과 프롬프트 난이도를 종합해 thinking 유무를 재량 결정한다. 12-balls 같은 고전 퍼즐은 모델 memory에서 해법을 회수할 수 있어 Medium에서도 thinking 없이 즉답하는 경우가 관찰됨. Low/Medium에서 ThinkingBlock이 없어도 FAIL이 아니며, **전송/응답 수신 성공 + 답이 비어있지 않음**으로 PASS 판정
- 모델 버튼 title 속성이 effort 레벨 변화에 따라 갱신

> **maxThinkingTokens 검증 불가**: 클라이언트는 `chat:send`에 `effort: <level>` 문자열만 넣어 전송([chatStore.ts:488](../../packages/client/src/stores/chatStore.ts#L488)). `maxThinkingTokens` 매핑은 서버측에서 수행되며, Playwright MCP는 socket.io WebSocket 페이로드를 기록하지 않는다. 별도 훅(예: `/api/debug/last-chat-send` — 추후 인프라 개선안)이 없는 한 본 시나리오는 클라이언트 측 관찰에 한정한다.

**엣지케이스**:
- E1. **미지원 모델 호환**: Haiku 선택 시 drop-down에서 radiogroup 자체가 숨겨지거나 bar 수가 줄어들어야 한다 (`supportsMaxEffort=false`, `supportsXHighEffort=false` → 3 bar).
- E2. **모델 전환 시 effort 보존**: Opus 4.7에서 Max 선택 → Sonnet 4.6로 전환 시 `effective effort`가 clamp됨 (`max`는 살아있고 `xhigh`는 제외). [ModelSelector.tsx:245-248](../../packages/client/src/components/ModelSelector.tsx#L245-L248).

> **Thinking 토큰 수치 UI 표시는 현재 구현에 없다** — `ContextUsageDisplay` 툴팁은 입력/캐시/출력/비용만 표시([ContextUsageDisplay.tsx:60-73](../../packages/client/src/components/ContextUsageDisplay.tsx#L60-L73)), `UsageStatusBar`는 5h/7d Rate Limit 전용.

---

## E3. Max Turns / Max Budget `[SDK] [EDGE]`

### E-03-01: Max Budget 초과 자동 중단
**절차**:
1. 원래 `maxBudgetUsd` 값 기록:
   ```js
   browser_evaluate(`() => fetch('/api/preferences', { credentials: 'include' }).then(r => r.json()).then(p => p.maxBudgetUsd ?? null)`)
   ```
2. Max Budget을 `0.01`로 설정 (UI 경로: Settings → 고급 설정 → 최대 예산 필드; 또는 API):
   ```js
   browser_evaluate(`() => fetch('/api/preferences', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     credentials: 'include',
     body: JSON.stringify({ maxBudgetUsd: 0.01 })
   }).then(r => r.json()).then(p => p.maxBudgetUsd)`)
   // → 0.01
   ```
3. 새 세션 + Opus 4.7 선택 (비용 빠르게 올려 초과 유도).
4. 긴 응답 유도 프롬프트 전송: `Write a detailed 2000-word essay on computer architecture history.`
5. 응답 스트리밍 중 **예산 경고 배너** 노출 확인 — 실제 UI 문구(ko): `예산 위험: 현재 비용 $<amount> / $<limit> (<pct>%) — 한도 초과 시 스트림이 자동 중단됩니다.`
   ```js
   browser_evaluate(`() => {
     const banner = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /예산 위험|Budget risk/i.test(e.textContent || ''));
     return banner?.textContent?.slice(0, 120);
   }`)
   ```
6. 스트림 자동 중단 후 **시스템 메시지 + 에러 카드** 노출 확인:
   ```js
   browser_evaluate(`() => {
     const cells = [...document.querySelectorAll('*')].filter(e => e.children.length === 0).map(e => e.textContent?.trim());
     return {
       hasError: cells.some(t => t === '오류: max budget usd' || t === 'Error: max budget usd'),
       hasSystemMsg: cells.some(t => /Reached maximum budget \\(\\$?[\\d.]+\\)/.test(t || ''))
     };
   }`)
   ```
7. 전송 버튼이 다시 활성화(`disabled=false` → false)되지는 않아도, `button[aria-label="중단"]` 부재로 스트림 종료 확인.
8. **정리** — `maxBudgetUsd`를 1단계에서 기록한 원래 값(보통 `null`)으로 복원:
   ```js
   browser_evaluate(`() => fetch('/api/preferences', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     credentials: 'include',
     body: JSON.stringify({ maxBudgetUsd: null })
   }).then(r => r.json())`)
   ```

**기대 결과**:
- 응답 스트리밍 중 `예산 위험: ...` 경고 배너 표시
- 한도 초과 시 SDK 스트림 자동 `abort` → 시스템 메시지 `Reached maximum budget ($0.01)` + 에러 카드 `오류: max budget usd`
- 정리 후 `maxBudgetUsd`가 원상 복구되어 차후 시나리오에 영향 없음

### E-03-02: Max Turns 도달
**절차**:
1. 원래 `maxTurns` 값 기록:
   ```js
   browser_evaluate(`() => fetch('/api/preferences', { credentials: 'include' }).then(r => r.json()).then(p => p.maxTurns ?? 0)`)
   ```
2. `maxTurns`를 `2`로 설정 (`0` = 무제한, 양수 = 강제 상한):
   ```js
   browser_evaluate(`() => fetch('/api/preferences', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json'},
     credentials: 'include',
     body: JSON.stringify({ maxTurns: 2 })
   }).then(r => r.json()).then(p => p.maxTurns)`)
   // → 2
   ```
3. 새 세션 시작 (이전 세션의 turn 누적 방지).
4. 도구 여러 턴이 필요한 프롬프트 전송: `List three files in the project using Bash, then read the first one with Read, then summarize it. Use multiple tool turns.`
5. SDK가 2 turn 도달 후 자연 종료하는지 확인:
   ```js
   browser_evaluate(`() => {
     const cells = [...document.querySelectorAll('*')].filter(e => e.children.length === 0).map(e => e.textContent?.trim());
     return {
       hasError: cells.some(t => t === '오류: max turns' || t === 'Error: max turns'),
       hasSystemMsg: cells.some(t => /Reached maximum number of turns \\(\\d+\\)/.test(t || ''))
     };
   }`)
   ```
6. **정리** — `maxTurns`를 원래 값(보통 `0`)으로 복원.

**기대 결과**:
- 시스템 메시지: `Reached maximum number of turns (2)` + 에러 카드 `오류: max turns`
- SDK 스트림이 예외 없이 자연 종료 (transport 에러 아닌 정상 abort)
- 정리 후 `maxTurns`가 원상 복구

---

## E4. 1M 컨텍스트 모델 동작 `[SDK] [EDGE]`

### E-04-01: 1M 모델 사용 시 contextWindow 표시
**절차**:
1. 새 세션 시작.
2. **채팅 입력바 하단**의 모델 버튼 (`aria-label^="모델:"`) 클릭 → 드롭다운에서 `Opus 4.7` 명시 선택. Opus 4.7이 드롭다운에 없으면 다른 `1M ctx` 표시 모델(Opus 4.6, Sonnet 4.6)로 대체.
3. 짧은 메시지 `"hi"` 전송 → 응답 완료 대기 (10-30s).
4. ContextUsageDisplay 상태 조회:
   ```js
   browser_evaluate(`() => {
     const el = document.querySelector('[aria-label*="컨텍스트"]');
     return { ariaLabel: el?.getAttribute('aria-label'), title: el?.getAttribute('title') };
   }`)
   ```
5. 검증 — `title` 문자열에 다음 3가지 모두 포함되어야 한다:
   - `"전체 윈도우: 1,000,000"` (1M 고정 표기)
   - `"컨텍스트: <num> / 967,000 토큰"` (출력 예약 20K·버퍼 13K 제외 유효 한도)
   - 비율 수치 (예: `(1%)`, `(3%)`) — 캐시 읽기 포함해 최소 1% 이상
6. `ariaLabel`은 `"컨텍스트 사용량 <pct>%"` 형식.

**기대 결과**:
- 툴팁 `title`에 `"전체 윈도우: 1,000,000"` 리터럴 존재 — SDK가 잘못된 값을 돌려줘도 `correctContextWindow`([packages/server/src/utils/correctContextWindow.ts](../../packages/server/src/utils/correctContextWindow.ts)) 가 1M로 고정
- 유효 한도는 967K (1M - 출력 예약 20K - 버퍼 13K)
- 200K 수준 부근에서 잘못된 "곧 compact" 경고가 뜨지 않는다 (E-04-02에서 추가 검증)

**엣지케이스**:
- E1. **1M 지원 모델이 라인업에 없는 경우**: 현재는 Opus 4.7, Opus 4.6, Sonnet 4.6 모두 있음. 향후 라인업 변경으로 전부 사라지면 본 시나리오는 "1M 지원 모델 부재"로 전환 (기대 title이 더 작은 윈도우 수치) — 이 경우 시나리오 파일을 먼저 수정

### E-04-02: 1M 모델에서 대용량 입력 처리
**배경**: 과거 버전은 `'The quick brown fox...'.repeat(20000)` 반복 문자열을 썼으나 Anthropic Usage Policy가 반복 패턴 대량 입력을 스팸으로 판정해 자동 거절한다("API Error ... appears to violate our Usage Policy"). 본 시나리오는 **다변형 자연어 단락을 무작위 배열**해 AUP를 통과하면서 1M 윈도우 계산 경로를 검증한다. 토큰 규모는 **1M 윈도우의 약 5~10%** (~50K 토큰, ~200KB)로 스케일 다운 — 계산 경로 검증 목적이라 초대용량 필요 없고, Opus 4.7 기준 입력 비용을 $1 이하로 억제하기 위함.

**절차**:
1. E-04-01 상태(1M 모델 = Opus 4.7 선택)를 이어가되, **새 세션**에서 시작 (앞 세션의 큰 context 누적 배제)
2. 다변형 자연어 페이로드 생성 후 textarea 주입. 주제별 다른 짧은 단락들을 셔플·재조립해 같은 패턴 반복을 회피한다:
   ```js
   browser_evaluate(`() => {
     // 주제 다양화된 24개 단락 (각 80-120자). 반복 포맷 아닌 자연 영문 문장으로 AUP 회피.
     const paragraphs = [
       "The invention of movable type in the 15th century transformed how knowledge spread across continents, enabling the Renaissance.",
       "Photosynthesis converts light energy into chemical energy, storing it in glucose and releasing oxygen as a byproduct.",
       "Compilers translate high-level source code into machine instructions through lexical analysis, parsing, and code generation phases.",
       "Ocean currents redistribute heat around the planet, moderating coastal climates and influencing weather patterns far inland.",
       "Quantum entanglement occurs when two particles share a state such that measuring one instantly affects the other, regardless of distance.",
       "The Silk Road connected Europe and East Asia for centuries, carrying not just goods but also ideas, religions, and diseases.",
       "Mitochondria generate ATP through oxidative phosphorylation, powering nearly every energy-dependent process in eukaryotic cells.",
       "Functional programming emphasizes immutable data and pure functions, reducing side effects and making code easier to reason about.",
       "Plate tectonics explains earthquakes, volcanoes, and mountain formation through the slow movement of rigid lithospheric plates.",
       "Neural networks learn hierarchical representations by adjusting weights through backpropagation of errors across successive layers.",
       "The Ottoman Empire lasted over six centuries, ruling vast territories across three continents at its peak in the 16th century.",
       "DNA replication is semiconservative: each daughter molecule retains one strand from the original parent molecule after division.",
       "Public key cryptography relies on mathematical problems easy in one direction but intractable in reverse, like factoring large primes.",
       "Coral reefs host roughly a quarter of marine species despite covering less than one percent of the ocean floor.",
       "Gödel's incompleteness theorems showed that any sufficiently powerful formal system contains true statements it cannot prove.",
       "Renaissance painters developed linear perspective to create convincing illusions of three-dimensional space on flat surfaces.",
       "The immune system distinguishes self from non-self through antigen recognition, mounting adaptive responses that can remember pathogens.",
       "Distributed systems must choose between consistency, availability, and partition tolerance per the CAP theorem's impossibility result.",
       "Stellar nucleosynthesis forges heavier elements inside stars, scattering them across space when massive stars end in supernova explosions.",
       "Haiku poetry traditionally captures a single moment with a seventeen-syllable structure divided into three lines of five-seven-five.",
       "Garbage collectors reclaim unreferenced memory automatically, freeing programmers from manual allocation but adding runtime overhead.",
       "The French Revolution dismantled centuries of feudal privilege, introducing concepts of citizenship and inalienable rights.",
       "Convolutional layers in vision networks detect local features like edges in early layers and complex shapes in deeper layers.",
       "Superconductors conduct electricity with zero resistance below a critical temperature, enabling powerful electromagnets without energy loss."
     ];

     // Shuffle helper (Fisher-Yates)
     const shuffle = (arr) => {
       const a = [...arr];
       for (let i = a.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [a[i], a[j]] = [a[j], a[i]];
       }
       return a;
     };

     // Build ~200KB of varied text. Empirically: 8 rounds ≈ 25KB / 6K tokens (paragraphs are ~130 chars),
     // so 64 rounds is needed to reach ~50K tokens (1M 윈도우의 ~5%). ROUNDS doubles as the expected
     // photosynthesis count (one occurrence per paragraph × ROUNDS rounds).
     const ROUNDS = 64;
     let text = '';
     for (let round = 0; round < ROUNDS; round++) {
       text += shuffle(paragraphs).join('\\n\\n') + '\\n\\n';
     }
     text += '위 텍스트에서 "photosynthesis"가 몇 번 등장하는지 정확한 숫자로만 답하세요. 다른 텍스트 금지.';

     const ta = document.querySelector('textarea[placeholder*="메시지"]');
     const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
     setter.call(ta, text);
     ta.dispatchEvent(new Event('input', { bubbles: true }));
     return { length: ta.value.length, approxTokens: Math.round(ta.value.length / 4), expectedCount: ROUNDS };
   }`)
   ```
   기대 출력: `length` ≈ 200,000, `approxTokens` ≈ 50,000, `expectedCount` = 64.
3. 전송 직전 ContextUsageDisplay 값 읽기 — 아직 0%에 가까워야 함 (pre-send는 누적 반영 안 할 수 있음):
   ```js
   browser_evaluate(`() => document.querySelector('[aria-label*="컨텍스트"]')?.getAttribute('title')`)
   ```
4. Enter 전송 → 응답 완료 대기 (Opus 4.7 입력 50K 토큰 수준이면 응답까지 30-60s 소요 예상; 최대 180s까지 허용)
5. 응답 완료 후 ContextUsageDisplay 툴팁 읽어서 검증:
   ```js
   browser_evaluate(`() => {
     const el = document.querySelector('[aria-label*="컨텍스트"]');
     return { label: el?.getAttribute('aria-label'), title: el?.getAttribute('title') };
   }`)
   ```
   - `title`에 `"전체 윈도우: 1,000,000"` 문자열이 포함되어야 한다 (1M 기준 판정)
   - `title`에 `"컨텍스트: <num> / 967,000 토큰 (<pct>%)"` 형식의 누적 표기가 나타나야 하며 `<num>`이 ~50,000 이상이어야 한다 (우리 입력이 반영된 증거)
   - 비율 `<pct>`는 5% 이상, 20% 미만 예상 (50K/967K ≈ 5.2%; 캐시 읽기 포함 시 더 높음)
6. 응답 본문이 **AUP 거절 메시지가 아니어야 한다** + 숫자 답이 들어있어야 한다:
   ```js
   browser_evaluate(`() => {
     const last = [...document.querySelectorAll('[aria-label^="Claude 메시지"]')].pop();
     const text = (last?.textContent ?? '').replace(/^Claude/, '').trim();
     const numMatch = text.match(/\\b(\\d{1,4})\\b/);
     return {
       aupRefused: /Usage Policy|violate|aup|unable to respond/i.test(text),
       parsedCount: numMatch ? parseInt(numMatch[1], 10) : null,
       preview: text.slice(0, 200)
     };
   }`)
   ```
   기대: `aupRefused=false`, `parsedCount`는 `expectedCount`(=64) 기준 ±2 범위 (SDK가 긴 context에서 정확한 카운트를 해주진 않으므로 근사값으로 판정).

**기대 결과**:
- 오버플로 판정 및 누적 표기가 **1,000,000 기준**으로 이루어진다 (툴팁 `"전체 윈도우: 1,000,000"` 고정)
- 50K 토큰 규모 입력이 AUP 거절 없이 수신되어 정상 응답 생성
- `<cum>` ≥ 50,000 (입력 규모가 실제로 집계에 반영)
- 응답이 숫자 형태이고 `expectedCount` ±2 이내 (SDK 카운트 정확도는 1M context에서 느슨; ±2 off는 통과)
- Hammoc `correctContextWindow` 어댑터가 SDK 반환값을 1M으로 고정 — 200K 부근에서 잘못된 경고 미발생

**엣지케이스**:
- E1. **압축 임계 진입**: ROUNDS를 128로 늘리면 ~100K 토큰 / 1M의 10% — 자동 compact 근접 경고 확인 가능. 비용은 두 배로 늘어나므로 별도 시나리오(C-04)에서 다룸.
- E2. **AUP 거절 재발**: 셔플에도 불구하고 거절되면 paragraphs 배열을 수정해 주제/문체 다양성을 더 키우거나 실제 공개 문서(예: `docs/MANUAL.md` 페치) 사용으로 대체.
- E3. **응답이 비어있거나 숫자 아님**: SDK가 context overflow로 답 포기 시 `parsedCount=null`. 이 경우 ContextUsageDisplay에서 실제 토큰 집계만 확인하고 응답 내용 검증은 건너뛰는 degraded PASS도 허용.
