# E. 모델 & SDK 파라미터 ★ SDK 핵심

**범위**: 모델 선택, Thinking Effort, Max Turns/Budget, 1M 컨텍스트.
**선행 도메인**: A, B, C.

---

## E1. 모델 선택 `[SDK] [CORE]`

### E-01-01: Opus / Sonnet / Haiku 전환
**절차**:
1. ChatHeader 모델 버튼 클릭
2. 드롭다운에서 각 모델 순차 선택
3. 모델마다 간단한 프롬프트 전송 ("Say your model name.")

**기대 결과**:
- `chat:send` 이벤트에 선택된 모델 ID 포함 (`browser_network_requests`)
- UsageStatusBar에 모델별 비용 단가 반영
- 응답에 모델명이 일치

**엣지케이스**:
- E1. 구모델(legacy): SDK 미지원 모델은 드롭다운에서 경고 또는 비활성화
- E2. 스트리밍 중 모델 변경: 현재 스트림은 기존 모델 유지, 다음 메시지부터 신규 모델

### E-01-02: 프로젝트 기본 모델 설정
**절차**: Settings → Project → Default Model 변경 → 새 세션 생성.
**기대 결과**: 새 세션이 설정한 기본 모델로 시작.

---

## E2. Thinking Effort `[SDK]`

### E-02-01: 레벨별 thinking token 소비 차이
**절차**:
1. ChatHeader 모델 드롭다운 → Opus 4.6+ 선택 (라인업에 없으면 최고 thinking 지원 모델 사용)
2. Thinking Effort 셀렉터 → Off 선택 → "Analyze the tradeoffs between depth-first and breadth-first search with a concrete example." 전송 → 응답 완료 후 UsageStatusBar에서 thinking 토큰 수치 기록 (0 예상)
3. Medium → 동일 프롬프트 → 수치 기록
4. Max → 동일 프롬프트 → 수치 기록
5. `browser_network_requests`로 `chat:send` 요청의 `maxThinkingTokens` 파라미터가 레벨별로 다른지 확인

**기대 결과**:
- 각 레벨에서 `maxThinkingTokens` 파라미터 값이 다름
- UsageStatusBar thinking 토큰 수치가 Off < Medium < Max
- Haiku 등 미지원 모델에서는 셀렉터 비활성화

---

## E3. Max Turns / Max Budget `[SDK] [EDGE]`

### E-03-01: Max Budget 초과 자동 중단
**절차**:
1. Settings → Advanced → Max Budget 필드 → `0.01` 입력 → 저장
2. 원래 값 기록 (테스트 후 복원용)
3. 채팅 페이지 복귀 → 긴 응답 유도 프롬프트 전송: "Write a detailed 2000-word essay on computer architecture history."
4. 응답 진행 중 UI에 경고 배너 노출 확인
5. 임계 초과 시 스트림 자동 중단 + "Budget exceeded" 메시지 확인
6. **정리** — Max Budget을 원래 값으로 복원

**기대 결과**:
- 임계 근접 시 경고 배너
- 초과 감지 순간 SDK 스트림 자동 `abort`
- "Budget exceeded" 시스템 메시지

### E-03-02: Max Turns 도달
**절차**:
1. Settings → Advanced → Max Turns → `2` 입력 → 저장 (원래 값 기록)
2. 채팅 복귀 → 도구 여러 턴 필요한 프롬프트 전송: "List three files in the project, then read the first one, then summarize it."
3. SDK가 2턴에서 자연 종료하는지 확인
4. UI에 "Max turns reached" 표시 확인
5. **정리** — Max Turns 원래 값 복원

**기대 결과**: Max Turns 도달 시 SDK 자연 종료, UI 알림 표시.

---

## E4. 1M 컨텍스트 모델 동작 `[SDK] [EDGE]`

### E-04-01: 1M 모델 사용 시 contextWindow 표시
**절차**:
1. ChatHeader 모델 드롭다운 오픈 → 1M 지원 모델(현재는 Opus 4.7) 선택. 드롭다운 자체에 해당 모델이 없으면 본 시나리오는 **모델 라인업에 1M 지원 모델 부재**로 판정, UI에 "1M 지원 모델 없음" 안내가 적절히 표시되는지 확인하는 경로로 전환
2. 모델 선택 후 ContextUsageDisplay에 호버 → 최대 컨텍스트 표기 확인
3. `browser_evaluate("() => fetch('/api/chat/model-info?model=claude-opus-4-7').then(r => r.json())")` → `contextWindow === 1000000` 검증
4. UI 텍스트가 "1M" 또는 "1,000,000" 포함 확인

**기대 결과**:
- `contextWindow` 1,000,000 표시
- SDK 오보 시 `correctContextWindow`가 교정
- 200K 부근에서 잘못된 경고 미발생

### E-04-02: 1M 모델에서 대용량 입력 처리
**절차**:
1. E-04-01 상태(1M 모델 선택)에서 대용량 입력 준비:
   ```js
   browser_evaluate(`() => {
     const ta = document.querySelector('textarea[placeholder*="메시지"]');
     const filler = 'The quick brown fox jumps over the lazy dog. '.repeat(20000);
     const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
     setter.call(ta, filler + '\n\n위 문장 개수를 숫자로만 답해.');
     ta.dispatchEvent(new Event('input', { bubbles: true }));
     return ta.value.length;
   }`)
   ```
   (약 1MB 텍스트 ≈ 100K+ 토큰)
2. 전송 직전 `browser_snapshot` → 토큰 추정치가 1M 기준 %로 표시되는지 확인
3. 전송 후 응답 완료까지 대기
4. UsageStatusBar의 누적 토큰이 1,000,000 대비 정확한 비율로 표시 확인

**기대 결과**:
- 오버플로 판정 1M 기준
- 토큰 집계 정확도 확인
