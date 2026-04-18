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
**선행 조건**: 모델 = Opus 4.6+.
**절차**:
1. Thinking Effort Off → 동일 복잡 프롬프트 전송 → thinking 토큰 기록
2. Medium → 동일 프롬프트 → 기록
3. Max → 동일 프롬프트 → 기록

**기대 결과**:
- `chat:send` 에 `maxThinkingTokens` 파라미터가 레벨별 값으로 전달
- UsageStatusBar의 thinking 토큰 수치가 레벨에 비례 증가
- Haiku 등 지원 안 하는 모델에서는 UI 비활성화 또는 무시

---

## E3. Max Turns / Max Budget `[SDK] [EDGE]`

### E-03-01: Max Budget 초과 자동 중단
**선행 조건**: Settings → Advanced → Max Budget 를 극소값($0.01 등)으로 설정.
**절차**: 비용이 임계를 넘길 긴 프롬프트 전송.
**기대 결과**:
- 임계 근접 시 경고 배너
- 초과 감지 순간 SDK 스트림 자동 `abort`
- 대화에 "Budget exceeded" 시스템 메시지

### E-03-02: Max Turns 도달
**선행 조건**: Settings → Advanced → Max Turns 를 2 등으로 설정.
**절차**: 도구 호출이 여러 턴 필요한 프롬프트 전송.
**기대 결과**: Max Turns 도달 시 SDK가 자연 종료, UI에 "Max turns reached" 표시.

---

## E4. 1M 컨텍스트 모델 동작 `[SDK] [EDGE]`

### E-04-01: 1M 모델 사용 시 contextWindow 표시
**선행 조건**: 모델 = Opus 4.7 (1M 지원 모델).
**절차**:
1. 모델 선택 → 1M 지원 모델
2. UsageStatusBar/ContextUsageDisplay 의 최대 컨텍스트 표기 확인

**기대 결과**:
- `contextWindow` 가 1,000,000 으로 표시 (SDK 오보 시 `correctContextWindow` 가 교정)
- 커밋 6219883 대응: 실제 사용 중 200K 부근에서 잘못된 경고가 뜨지 않는지 확인

### E-04-02: 1M 모델에서 대용량 입력 처리
**절차**: 100K 토큰 이상 입력을 일부러 생성하여 전송 (큰 파일 포함 요청 등).
**기대 결과**:
- 오버플로 판정이 1M 기준으로 이뤄짐
- 스트리밍 성공 후 토큰 집계가 모델 최대값 대비 정확한 % 로 표시
