# Hammoc 유즈케이스 택소노미

> 통합 테스트 지시서([TEST_PLAN.md](TEST_PLAN.md))의 기반 계층 구조.
> 총 **19개 도메인 / 80개 리프 기능 노드 / 175개 시나리오**.

---

## 태그 정의

| 태그 | 의미 | 필터 키워드 |
|---|---|---|
| `[SDK]` | Claude Agent SDK 스펙/계약에 직접 영향받음 | `sdk-sensitive` |
| `[CORE]` | 유저 기본 경로 · 스모크 대상 | `smoke` |
| `[EDGE]` | 엣지케이스 · 심층 회귀 | `tag:EDGE` |
| `[ASYNC]` | 비동기·스트리밍·상태전이 동시성 | `tag:ASYNC` |
| `[MOBILE]` | 모바일 전용 또는 반응형 검증 필요 | `tag:MOBILE` |
| `[DnD]` | Drag-and-drop 동작 포함 | `tag:DnD` |
| `[MANUAL]` | 자동화 불가 — 실행 종료 시 수동 체크리스트로 전달 | `tag:MANUAL` |
| `[SDK_BLOCKED]` | SDK 업스트림 버그로 현재 검증 불가 — SDK 수정 시 자동 PASS로 전환 예상 | `tag:SDK_BLOCKED` |

리프마다 복수 태그 가능. 예: `[SDK] [CORE] [ASYNC]`.

---

## 도메인 계층

### A. 인증 & 초기화
- A1. 로그인 `[CORE]`
- A2. 온보딩 체크리스트 `[CORE]`
- A3. 세션 유지/복구 (브라우저 새로고침) `[EDGE]`

### B. 프로젝트 라이프사이클
- B1. 프로젝트 목록 로드 · 대시보드 카드 `[CORE] [ASYNC]`
- B2. 프로젝트 생성 (일반 + BMad 옵션 + 디렉토리 브라우저로 경로 선택) `[CORE] [MOBILE]`
- B3. 프로젝트 숨김/표시/삭제 `[EDGE]`
- B4. 프로젝트 설정 탭 (모델 오버라이드 · 권한 모드 오버라이드 · 숨김 토글 · 전역 초기화) `[CORE]`
- B5. 하네스 파일 API · 외부 변경 이벤트 · YAML/JSONC 라운드트립 (Story 28.0.5 선행 인프라) `[CORE]`
- B6. 하네스 플러그인 조회 · 활성 토글 (Story 28.1) `[CORE]` `[EDGE]`
- B7. 하네스 스킬 섹션 (Story 28.2) `[CORE]`
- B8. 하네스 MCP 섹션 (Story 28.3) `[CORE]` `[SDK]`
- B9. 하네스 Hook 섹션 (Story 28.4) `[SDK] [EDGE]`
- B10. 하네스 슬래시 커맨드 섹션 (Story 28.5) `[CORE]`
- B11. 하네스 서브에이전트 섹션 (Story 28.6) `[CORE]`
- B12. 하네스 CLAUDE.md 편집기 섹션 (Story 29.1) `[CORE] [EDGE]`
- B13. 하네스 스니펫 / 즐겨찾기 칩 섹션 (Story 29.2) `[CORE] [EDGE]`
- B14. 하네스 공유/로컬 배지 + Mode 배너 + 시크릿 차단 (Story 30.1) `[EDGE]` <!-- T-domain migration trigger: re-evaluate after Story 30.2 (B15) and Story 30.8 (B16) merge — see Epic 30 PRD § Integration Test Mapping -->
- B15. 정적 하네스 Lint (Story 30.2) `[EDGE]` <!-- T-domain migration trigger: re-evaluate after Story 30.8 (B16) merge — see Epic 30 PRD § Integration Test Mapping -->
- B16. 하네스 Export/Import 번들 (Story 30.5+30.6+30.7) `[CORE]` `[EDGE]` <!-- DECISION REQUIRED IN THIS PR — see Story 30.8 Task D -->
- B17. BMad core-config 편집기 (Story 31.1) `[EDGE]` <!-- Q 교차 — see Story 31.1 AC8.c (Q3·Q4 cross-link): devStoryLocation/qaLocation/epicFilePattern 폼 편집 후 Q3·Q4 재실행 검증 -->
- B18. SessionStart 컨텍스트 빌더 (Story 31.2) `[SDK]` `[EDGE]` <!-- spike #1 세션 트리거 시맨틱 · spike #2 additionalContext 10k 캡 — see sdk-upstream-issues.md §12·§13. 신규 세션 additionalContext 실주입은 수동 [SDK] 시나리오 -->
- B19. 관측성 — MCP 로그 + 토큰 어트리뷰션 (Story 31.3) `[SDK]` `[EDGE]` `[CORE]` <!-- spike #1 tokenizer 정확도(미채택, size/4 단일 tier) · spike #2 count_tokens(기존 @anthropic-ai/sdk, OAuth authToken) · spike #3 JSONL 영속화 — see sdk-upstream-issues.md §14·§15·§16. 실제 MCP 도구 호출의 타임라인 영속 기록은 수동 [SDK] 시나리오 (B-19-05) -->
- B20. 플러그인 마켓플레이스 탐색 + 설치/제거 가이드 (Story 31.4) `[SDK]` `[EDGE]` `[CORE]` <!-- spike #1 /plugin SDK 미해석("/plugin isn't available") → 채팅 직접시도 버튼 제거 · spike #2 직접설치 취약(version:2 sha 결합)+임의 clone 보안경계 → 자동 설치/마켓추가 드롭 — see sdk-upstream-issues.md §17·§18. 카탈로그/필터/복사가이드 전용. 외부 CLI 실설치 후 와처 자동갱신은 수동 [SDK] 시나리오 (B-20-05) -->

### C. 채팅 · 세션 ★ SDK 핵심
- C1. 새 세션 시작 · 첫 메시지 송신 `[CORE] [SDK] [ASYNC]`
- C2. 메시지 스트리밍 수신 & 렌더링 `[CORE] [SDK] [ASYNC]`
- C3. 메시지 편집 & 대화 분기 생성 `[SDK] [EDGE]`
- C4. 컨텍스트 오버플로 & 자동 Compact `[SDK] [EDGE]`
- C5. 세션 재개 / Fork `[SDK] [ASYNC]`
- C6. 세션 검색 (메타 + 콘텐츠) & 정렬 `[CORE]`
- C7. Abort / ESC 중단 `[SDK] [ASYNC]`
- C8. Summarize & Continue `[SDK] [EDGE]`
- C9. Code Rewind (파일 체크포인트) `[SDK] [EDGE]`
- C10. 토큰 사용량 표시 (UsageStatusBar / ContextUsageDisplay) `[SDK] [CORE]`
- C11. CLI 엔진 대화 (구독 풀 · 블록 단위 렌더) `[MANUAL]`

### D. 권한 & 인터랙션 ★ SDK 핵심
- D1. 권한 프롬프트 응답 (Allow/Deny) `[SDK] [CORE]`
- D2. 권한 모드 전환 (Plan / Ask / Auto / Bypass) `[SDK]`
- D3. AskUserQuestion 응답 `[SDK] [EDGE]`
- D4. 권한 타임아웃 (5분 자동 거부) `[EDGE]`

### E. 모델 & SDK 파라미터 ★ SDK 핵심
- E1. 모델 선택 (Opus / Sonnet / Haiku) `[SDK] [CORE]`
- E2. Thinking Effort 조정 `[SDK]`
- E3. Max Turns / Max Budget `[SDK] [EDGE]`
- E4. 1M 컨텍스트 모델 동작 `[SDK] [EDGE]`

### F. 채팅 입력 & 첨부
- F1. 텍스트 입력 · Enter/Shift+Enter `[CORE]`
- F2. 이미지 첨부 (최대 5개 · 5MB) `[SDK] [EDGE] [DnD]`
- F3. 슬래시 명령어 팔레트 `[CORE]`
- F4. 프롬프트 스니펫 `%` 치환 `[CORE]`
- F5. 즐겨찾기 칩 바 · 재정렬 `[MOBILE] [DnD]`

### G. 프롬프트 체인
- G1. 체인 항목 추가/삭제/재정렬 `[CORE] [DnD]`
- G2. 체인 순차 실행 & 재시도 `[ASYNC] [EDGE]`
- G3. 체인·세션 동기화 (다중 탭) `[EDGE]`

### H. 큐 러너 (배치 자동화)
- H1. 큐 문법 파싱 (@new/@model/@loop/@delay/@pause/@save/@load) `[CORE]`
- H2. 큐 실행 / 일시정지 / 재개 `[ASYNC] [SDK]`
- H3. 큐 중단 & 상태 리셋 `[EDGE]`
- H4. PRD → Queue 자동 생성 `[CORE]`
- H5. 큐 실행 중 권한·예산 이벤트 `[SDK] [EDGE]`

### I. 보드 & 이슈
- I1. 칸반 뷰 / 리스트 뷰 전환 `[CORE] [MOBILE]`
- I2. 이슈 CRUD `[CORE]`
- I4. 에픽/스토리 진행률 `[CORE]`

### J. 파일 탐색기
- J1. 트리 · 그리드 뷰 탐색 `[CORE]`
- J2. 파일 편집 & 저장 (Ctrl+S) `[CORE]`
- J4. 파일 CRUD · 외부 변경 감지 `[EDGE]`
- J5. 파일명 검색 (searchFiles) `[CORE]`

> J3 마크다운 미리보기는 S2 로 이동 (뷰어 도메인 통합).

### K. Git
- K1. Git 상태 & Diff 확인 `[CORE]`
- K2. Stage & Commit `[CORE]`
- K3. 브랜치 전환 · Push/Pull `[EDGE]`

### L. 터미널 (PTY)
- L1. 터미널 생성·입력·리사이즈 `[CORE] [ASYNC]`
- L2. 다중 터미널 관리 `[EDGE]`
- L3. 보안 (로컬 IP / TERMINAL_ENABLED) `[EDGE]`

### M. Quick Panel
- M1. 패널 토글 · Alt+1~4 단축키 `[CORE]`
- M2. 탭 전환 (세션 / 파일 / Git / 터미널) `[CORE]`

### N. 대시보드 실시간 상태
- N1. 5개 통계 카드 (프로젝트 / 세션 / 활성 / 큐 / 터미널) `[CORE] [ASYNC]`
- N2. 구독 / 구독해제 라이프사이클 `[EDGE]`

### O. 알림
- O1. 웹 푸시 알림 `[EDGE]`
- O2. Telegram 알림 `[EDGE]`

### P. 전역 설정
- P1. 언어 전환 (en / ko / ja / zh-CN / es / pt) `[CORE]`
- P2. 테마 (Dark / Light / System) `[CORE]`
- P3. 채팅 타임아웃 설정 `[EDGE]`
- P4. 고급 설정 & 서버 재시작 `[SDK] [EDGE]`
- P5. 서버 업데이트 체크 & 업데이트 `[EDGE]`
- P6. 엔진 모드 토글 & CLI 설정 패널 `[EDGE]`
- P7. 설정 멀티 기기 동기화 (한 브라우저 변경 → 타 브라우저 실시간 반영) `[EDGE]`
- P8. 디버그 설정 페이지 (HAMMOC_DEBUG 게이트) `[EDGE]`

### Q. BMad Method
- Q1. BMad 초기화 `[CORE]`
- Q2. 에이전트 전환 (SM / PM / Architect / Dev / QA) `[CORE]`
- Q3. PRD → Queue 생성 `[CORE]`
- Q4. 스토리 워크플로우 (개발 → QA → 완료) `[EDGE]`

### R. WebSocket 연결 복원력 ★ SDK 핵심
- R1. 재연결 후 스트림 복구 `[SDK] [ASYNC]`
- R2. stream:history · buffer-replay 재생 `[SDK] [ASYNC]`
- R3. 다중 브라우저 동기화 `[EDGE]`

### S. 뷰어 & 렌더러 (cross-cutting)
- S1. 이미지 뷰어 (줌 · 팬 · 다중 네비게이션) `[CORE] [MOBILE]`
- S2. 마크다운 렌더러 (GFM · 코드 하이라이팅) `[CORE]`
- S3. 텍스트/코드 에디터 (CodeMirror) `[CORE]`
- S4. Diff 뷰어 (F7 / Shift+F7) `[CORE]`
- S5. 바이너리 파일 처리 (다운로드 버튼 · 대용량 스트리밍) `[EDGE]`

---

## 태그별 시나리오 인덱스

### `[SDK]` (SDK 민감영역 — sdk-sensitive 모드)
B9, B18, B19, B20, C1, C2, C3, C4, C5, C7, C8, C9, C10, D1, D2, D3, E1, E2, E3, E4, F2, H2, H5, P4, R1, R2

### `[CORE]` (smoke 모드)
A1, A2, B1, B2, B4, B5, B7, B16, B19, B20, C1, C2, C6, C10, D1, E1, F1, F3, F4, G1, H1, H4, I1, I2, I4, J1, J2, J5, K1, K2, L1, M1, M2, N1, P1, P2, Q1, Q2, Q3, S1, S2, S3, S4

### `[EDGE]` (심층 회귀)
A3, B3, B9, B16, B17, B18, B19, B20, C3, C4, C8, C9, D3, D4, E3, E4, F2, G2, G3, H3, H5, J4, K3, L2, L3, N2, O1, O2, P3, P4, P5, P6, P7, Q4, R3, S5

### `[ASYNC]` (타이밍 · 동시성)
B1, C1, C2, C5, C7, G2, H2, L1, N1, R1, R2

### `[MOBILE]` (반응형)
B2, F5, I1, S1

### `[DnD]` (드래그 앤 드롭)
F2, F5, G1

### `[MANUAL]` (자동화 불가 — 릴리즈 직전 수동 회귀)
P-05-01, P-05-02, F-02-02, F-05-02, G-01-02, H-03-01, C-04-01, C-11-01

- P-05-01/02: 실제 최신 릴리즈 패키지 환경 필요
- F-02-02: HTML5 native DnD 파일 drop — JS `DragEvent` 디스패치로 재현 불가
- F-05-02: React DnD 핸들러가 Playwright 디스패치 이벤트로 재정렬 미반영
- G-01-02: idle 세션에서 체인 즉시 drain + React DnD 한계 이중 제약
- H-03-01: 큐 실행 중 Abort 버튼 포착 타이밍 확보 실패 (false FAIL 잦음)
- C-04-01: 1M 컨텍스트 모델에서 90% 토큰 도달이 비용·시간상 비현실적 (런처 compact 임계값 주입 훅 추가 시 자동화 전환 가능)
- C-11-01: CLI 엔진은 구독-인증 claude 바이너리 + 인터랙티브 PTY 필요 — 헤드리스 하네스에 구독 claude 부재 + PTY 화면 파싱 타이밍 취약 (토글·CLI 설정 UI 게이팅·선택·영속은 P-06-01 로 자동화)
- D-01-03: CLI 모드 독립 권한 카드는 C-11 과 동일 제약(구독 claude + PTY)으로 헤드리스 자동화 불가 — 수동 회귀. 클라 렌더 분기(`standalone` → 독립 카드)는 `useStreaming.interactive.test.ts` 단위로 가드

### `[SDK_BLOCKED]` (SDK 업스트림 미동작 — 수정 시 자동 PASS 전환)
_(현재 없음 — H-05-02는 2026-04-21 SDK 0.2.114 재검증으로 PASS 복귀. 자세한 맥락은 [sdk-upstream-issues.md](sdk-upstream-issues.md) 참조.)_

---

## 선행 도메인 의존성

```
A (로그인/온보딩)
 └─ B (프로젝트)
     ├─ C (채팅)
     │   ├─ D (권한)
     │   ├─ E (모델)
     │   ├─ F (입력)
     │   └─ S (뷰어 · 메시지 렌더링)
     ├─ G (체인) ← C 필요
     ├─ H (큐) ← C 필요
     ├─ I (보드)
     ├─ J (파일) → S (뷰어)
     ├─ K (Git) → S4 (Diff)
     ├─ L (터미널)
     ├─ M (퀵패널) ← C,J,K,L 모두 연계
     └─ Q (BMad) ← B 생성 시 옵션
N (대시보드), O (알림), P (설정), R (WS 복원력) — 전역/횡단
```

BMad(Q) 시나리오는 **테스트 프로젝트가 BMad 초기화된 상태**에서만 실행 가능. 기본 테스트 프로젝트는 비-BMad 로 생성하며, Q 실행 시 별도 BMad 프로젝트를 생성·사용한다.
