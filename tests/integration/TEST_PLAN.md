# Hammoc 통합 테스트 지시서 (Playwright MCP)

> **목적**: Claude Agent SDK 버전이 업데이트될 때마다 Hammoc의 유저 기능이 회귀 없이 작동하는지 검증한다. 단위 테스트로 포착되지 않는 실제 유저 워크플로우 · 엣지케이스를 Playwright MCP로 직접 시뮬레이션한다.
>
> **대상 실행자**: Claude Code(또는 호환 에이전트)가 Playwright MCP 도구를 호출하며 본 지시서를 따른다.

---

## 1. 문서 구조

```
tests/integration/
├── TEST_PLAN.md               (← 이 문서: 실행 규약·보고 포맷)
├── TAXONOMY.md                (도메인 계층 · 태그 정의)
├── shortcuts-matrix.md        (키보드 단축키 부록)
└── scenarios/
    ├── A-auth.md              (인증·온보딩)
    ├── B-project.md           (프로젝트 라이프사이클)
    ├── C-chat.md              (채팅·세션) ★ SDK 핵심
    ├── D-permission.md        (권한·인터랙션) ★ SDK 핵심
    ├── E-model.md             (모델·SDK 파라미터) ★ SDK 핵심
    ├── F-input.md             (채팅 입력·첨부)
    ├── G-chain.md             (프롬프트 체인)
    ├── H-queue.md             (큐 러너)
    ├── I-board.md             (보드·이슈)
    ├── J-files.md             (파일 탐색기)
    ├── K-git.md               (Git)
    ├── L-terminal.md          (터미널)
    ├── M-quickpanel.md        (Quick Panel)
    ├── N-dashboard.md         (대시보드 실시간)
    ├── O-notify.md            (알림)
    ├── P-settings.md          (전역 설정)
    ├── Q-bmad.md              (BMad)
    ├── R-websocket.md         (WebSocket 복원력) ★ SDK 핵심
    └── S-viewer.md            (뷰어·렌더러)
```

---

## 2. 실행 모드

테스트 실행 요청은 아래 4가지 모드 중 하나로 지정된다.

### 2.1 `full` — 전체 회귀
모든 리프 시나리오 수행. 메이저 릴리스 전 최종 검증용. 74개 기능 노드 / 152개 시나리오.

### 2.2 `sdk-sensitive` — SDK 민감영역만
`[SDK]` 태그가 붙은 리프만 수행. **SDK 버전 업그레이드 직후 최우선 실행.**
해당되는 도메인: C, D, E, R (+ C10, H2, H5, P4 등 일부)

### 2.3 `smoke` — 핵심 경로 스모크
`[CORE]` 태그가 붙은 리프만 수행. 일상 개발 중 빠른 헬스체크.

### 2.4 `domain:<letters>` — 특정 도메인
예: `domain:C,D` → 채팅 + 권한만. 부분 기능 수정 후 검증용.

### 2.5 커스텀 태그 조합
`tag:SDK+EDGE` 처럼 태그 교집합으로 필터 가능. 태그 정의는 [TAXONOMY.md](TAXONOMY.md) 참조.

---

## 3. 실행 규약

### 3.1 환경 전제
- Hammoc 서버가 `http://localhost:3000`(기본) 에서 기동 중
- 최초 로그인 비밀번호는 환경변수 `HAMMOC_TEST_PASSWORD` 또는 수동 입력
- Playwright MCP (`mcp__plugin_playwright_playwright__*`) 도구 사용 가능
- 테스트 격리를 위해 **전용 테스트 프로젝트** 사용 (3.3 참조)

### 3.2 Playwright MCP 기본 동작 규약

| 상황 | 사용할 도구 |
|---|---|
| 페이지 이동 | `browser_navigate` |
| 현재 UI 상태 파악 | `browser_snapshot` (accessibility tree 우선, 스크린샷은 증거용) |
| 클릭·호버 | `browser_click`, `browser_hover` |
| 텍스트 입력 | `browser_type` (textarea/input 대상) |
| 폼 일괄 입력 | `browser_fill_form` |
| 단축키 | `browser_press_key` |
| 드래그·드롭 | `browser_drag` |
| 파일 업로드 | `browser_file_upload` |
| 네트워크 확인 | `browser_network_requests` (WebSocket 이벤트 검증) |
| 콘솔 오류 확인 | `browser_console_messages` |
| 비동기 대기 | `browser_wait_for` (text 또는 element 가시성) |
| 증거 스크린샷 | `browser_take_screenshot` (pass/fail 모두) |
| JS 상태 조회 | `browser_evaluate` (예: Zustand store 값) |

### 3.3 공통 Setup / Teardown

**Setup (테스트 세션 시작 시 1회) — Interactive 모드**
1. `browser_navigate("http://localhost:3000")`
2. 현재 상태 판별 (snapshot):
   - 이미 인증된 페이지 → 바로 3단계로
   - 로그인 페이지 → 유저에게 "직접 로그인해 주세요" 안내 후 `browser_wait_for` 로 최대 10분 대기
3. 테스트 전용 프로젝트가 없으면 생성:
   - 이름: `__hammoc_test_<타임스탬프>__`
   - 경로: `<임시 디렉토리>/hammoc-test-<타임스탬프>`
   - BMad 초기화: 필요한 경우만 (Q 도메인 실행 시)
4. 프로젝트 진입 완료 확인

> **비밀번호 정책**: 테스트 코드·환경변수·파일에 비밀번호를 저장하지 않는다. 유저가 브라우저에 직접 입력한다. 원격 실행이 필요하면 RDP/VNC로 GUI 접근 후 동일하게 수행한다.

**시나리오 간**
- 각 시나리오 시작 전 `browser_snapshot` 으로 UI 초기 상태 기록
- 시나리오마다 **새 세션**을 원칙으로 사용 (세션 간 상태 오염 방지)
- 큐·체인·스트림이 실행 중이면 반드시 중단·초기화 후 다음 시나리오 진입

**Teardown (테스트 세션 종료 시)**
- 테스트 중 생성된 세션 목록을 `browser_snapshot` 으로 기록
- 정리 정책:
  - 기본: 삭제하지 않음 (분석용). 보고서에 정리 명령만 안내.
  - `cleanup=true` 옵션이 지정된 경우: 세션·이슈 일괄 삭제

### 3.4 비동기 상태 대기 가이드

SDK/WebSocket 이벤트 기반 UI는 타이밍 민감. 다음 원칙을 따른다.

- **고정 `sleep` 금지.** `browser_wait_for` 로 DOM/텍스트 조건을 기다린다.
- 스트리밍 완료 판정: UsageStatusBar에 토큰 집계가 갱신되었는지 + 입력바가 `idle` 상태인지 확인.
- 권한 모달 판정: `role="dialog"` + 모달 내 "Allow/Deny" 버튼 가시성.
- 도구 실행 판정: ToolCard의 상태 텍스트 `Running` → `Completed`/`Error` 전이.
- 타임아웃: 개별 wait 최대 90초 (CHAT_TIMEOUT 기본값 5분보다 짧게 잡고 실패 시 재시도).

### 3.5 엣지케이스 유도 방법

| 엣지케이스 유형 | 유도 방법 |
|---|---|
| 네트워크 끊김 | `browser_evaluate`로 WebSocket 강제 `close()` 호출 후 재연결 관찰 |
| 컨텍스트 오버플로 | 매우 긴 입력 (수만 토큰 상당) 또는 SDK 응답을 연속 유도 |
| 동시성 | `browser_tabs` 로 다중 탭 오픈 후 같은 세션 동시 조작 |
| 권한 타임아웃 | 권한 프롬프트 등장 후 5분 이상 응답 안 하는 시나리오 수행 |
| 예산 초과 | Settings에서 maxBudgetUsd 를 극소값으로 설정 후 긴 작업 유도 |

### 3.6 SDK 사전 검증 의무

본 테스트 착수 전, **SDK가 실제로 어떤 스펙을 반환하는지 간단한 샘플 요청으로 먼저 확인**한다. 특히 아래 항목은 SDK 버전마다 달라질 수 있으므로 테스트 기대값을 SDK 실측에 맞춰야 한다.
- `contextWindow` 보고값
- `thinkingTokens` 필드 존재 여부
- `message:chunk` 이벤트 포맷
- 도구 호출 입력 스키마

SDK 실측과 지시서 기대값이 불일치하면 **지시서 수정** 후 진행 (테스트를 억지로 통과시키는 우회 금지).

---

## 4. 시나리오 파일 포맷

각 `scenarios/*.md` 파일은 다음 구조를 따른다.

```markdown
# <도메인 기호>. <도메인 이름>

**범위**: (한 줄 요약)
**선행 도메인**: (예: A 로그인 필요)

## <기능노드 번호>. <기능노드 이름> [태그들]

### 시나리오 ID: <도메인>-<번호>-<서브번호>
**목적**: 한 줄
**선행 조건**:
- (필요한 사전 상태)

**절차**:
1. (액션) → MCP 도구 힌트: `browser_click(...)`
2. ...

**기대 결과**:
- UI: (관찰 가능한 상태)
- 이벤트: (WebSocket/네트워크 관찰값)
- 상태: (Zustand 등)

**엣지케이스**:
- E1. (상황) → (확인 방법)

**증거**:
- `browser_take_screenshot(filename="<scenario-id>.png")`
```

---

## 5. 보고 포맷

테스트 실행이 끝나면 아래 Markdown 보고서를 생성한다.

```markdown
# Hammoc 통합 테스트 결과

**실행일시**: <ISO-8601>
**Hammoc 버전**: <package.json version>
**SDK 버전**: <@anthropic-ai/claude-agent-sdk version>
**실행 모드**: <full|sdk-sensitive|smoke|domain:X|tag:X>
**소요시간**: <mm:ss>

## 요약
- 총 시나리오: N
- PASS: N  FAIL: N  SKIP: N  BLOCKED: N

## 도메인별 결과
| 도메인 | 통과 | 실패 | 스킵 |
|---|---|---|---|
| C. 채팅·세션 | 8 | 1 | 0 |
| ... | | | |

## 실패 상세
### <scenario-id>: <제목>
- **증상**: (실측 동작)
- **기대**: (기대 동작)
- **재현 절차**: (번호 리스트)
- **증거**: ![](./artifacts/<scenario-id>.png)
- **SDK 관련 의심**: yes/no (근거)

## SDK 회귀 의심 영역
(SDK 민감 시나리오 실패만 집계)

## 다음 조치
- (우선순위 정렬된 액션 아이템)
```

### 상태 코드 정의
- **PASS**: 모든 기대 결과 충족
- **FAIL**: 기대와 실측 불일치
- **SKIP**: 전제 미충족으로 실행 안 함 (예: BMad 시나리오인데 BMad 미초기화)
- **BLOCKED**: 선행 시나리오 실패로 실행 불가

---

## 6. SDK 업데이트 대응 체크리스트

SDK 버전이 올라가면 아래 순서로 실행한다.

1. `npm list @anthropic-ai/claude-agent-sdk` 로 신규 버전 확인
2. SDK CHANGELOG 훑어 **스펙/계약 변경 항목** 추출
3. 본 지시서에서 영향받는 시나리오 번호를 도메인별로 리스트업
4. **`sdk-sensitive` 모드 실행** → 실패 집계
5. 실패를 분류:
   - (a) 지시서 기대값 업데이트 필요 → 지시서 수정 후 재실행
   - (b) Hammoc 측 어댑터(예: `correctContextWindow`) 수정 필요 → 이슈 등록 후 수정
   - (c) SDK 버그 → 업스트림 보고
6. `smoke` 모드로 나머지 핵심 경로 확인
7. 필요 시 `full` 모드 실행

---

## 7. 제외 범위 (Not Applicable)

아래 기능은 현재 **Hammoc에 미구현**이므로 시나리오가 없다. 구현되면 택소노미 업데이트.

- MCP 서버 설정/관리 UI
- Claude Code hooks 편집 UI
- CLAUDE.md 편집 UI (프로젝트별)
- 세션 export / import (JSON)
- 채팅/세션 스크린샷 공유 기능
- 사용자 정의 키보드 단축키
- 서버 로그 뷰어
- 플러그인/확장 시스템
- 세션 공유 링크 / 읽기전용 뷰
- 외부 MCP OAuth UI (Gmail/Drive 등)
- 외부 webhook / REST API
- PWA 설치 매니페스트
- 커스텀 서브에이전트 관리
- 세션 태그/아카이브
- Language Server (LSP)

---

## 8. 우선순위 레퍼런스

**항상 가장 먼저 확인:**
- C1, C2, C4 — 채팅 기본 동작, 오버플로·compact
- C5 — 세션 재개/fork 분기 생성
- C7 — Abort
- D1, D2 — 권한 모달 동작, 모드 전환
- E1, E2, E4 — 모델 전환, Thinking, 1M 컨텍스트
- R1, R2 — WebSocket 재연결 복구

이 영역이 모두 통과하면 유저 체감상 "주요 기능은 살아있음" 상태로 판단할 수 있다.
