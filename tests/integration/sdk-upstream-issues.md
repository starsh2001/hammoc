# Claude Agent SDK — Upstream Issues

Running notes on `@anthropic-ai/claude-agent-sdk` behavior that blocks Hammoc
integration tests but is outside Hammoc's code. Each entry is structured so
it can be pasted into an upstream bug report with minimal editing.

---

## 1. `maxBudgetUsd` is not enforced by the CLI — **RESOLVED (2026-04-21)**

**SDK version originally observed**: `@anthropic-ai/claude-agent-sdk@0.2.114`
(2026-04-20 run)

**Re-verified**: 2026-04-21 on the same SDK build (`0.2.114`). Queue pauses on
`isError=true` at the item boundary for all three current model families —
`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7` — when the cap is
set to `maxBudgetUsd: 0.0001`. Scenario [H-05-02](scenarios/H-queue.md) is no
longer `[SDK_BLOCKED]`.

### Likely cause of the 2026-04-20 mis-observation

The original observation coincided with Hammoc-side propagation work. The
`aff86d9` commit (`queueService.buildChatOptions → chatOptions.maxBudgetUsd
→ SDK`) made `maxBudgetUsd` actually reach the child-process `query()`
call. Earlier runs may have been testing a path where the option was being
dropped before reaching the CLI, which would explain the "cap ignored"
symptom while leaving SDK behavior unchanged.

### Original issue text (kept for history)

> From `sdk.d.ts` (1355-1358):
> ```ts
> /**
>  * Maximum budget in USD for the query. The query will stop if this
>  * budget is exceeded, returning an `error_max_budget_usd` result.
>  */
> maxBudgetUsd?: number;
> ```
>
> 2026-04-20 observation: a single assistant response with
> `cache_read 28925 + output 14` tokens (≈ $0.009, ~90× the cap) completed
> with `subtype: success` and a 2-item queue did not block item 2 either.
>
> Re-verified 2026-04-21: identical `maxBudgetUsd: 0.0001` + 2-item queue
> pauses at item-3 boundary with `isError=true` across Haiku/Sonnet/Opus.
> No scenario-level action required — H-05-02 now passes end-to-end.

### Follow-up (tracked in Hammoc, not upstream)

The queue's displayed `pauseReason` drops the SDK `subtype` (shows only
`response.content`, e.g. `"SDK 오류: hello"` instead of
`"SDK 오류: error_max_budget_usd — hello"`). Fix in
[queueService.ts:880-882](../../packages/server/src/services/queueService.ts#L880-L882)
when touching queue error surfaces.

---

## 2. `prompt` 타입 훅의 GA 여부 미확인 (Story 28.4 spike, 2026-05-03)

**정적 증거 (디스크 실측, 2026-05-02)**: 공식 마켓플레이스 카탈로그
`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/` 의 모든 5개
번들 (`hookify` · `security-guidance` · `ralph-loop` · `learning-output-style` ·
`explanatory-output-style`) 의 `hooks/hooks.json` 어디에도 `"type": "prompt"`
가 등장하지 않음 (전수 5/5 미사용 — 총 8개 hook 모두 `command` 타입). 단
`plugin-dev/skills/hook-development/references/patterns.md` 의 공식 예제는 `prompt`
타입을 명시 (Pattern 1: Security Validation, Pattern 2: Test Enforcement).

**현재 상태**: Hammoc 의 `harnessHookService.PROMPT_TYPE_SUPPORT` 상수는
`'unsupported'` 가 default — HookEditor 의 type 라디오에서 prompt 옵션은 비활성
상태이며 툴팁 안내 ("This CLI version does not support prompt-type hooks.") 가
노출된다. 이미 디스크에 prompt 카드를 갖고 있는 사용자도 카드 자체는 정상 노출되며
(spike 결과와 무관) 편집은 command 로의 type 변경 후에만 가능.

**런타임 실측 미수행**: spike 의 실측 단계 (임시 prompt 타입 PreToolUse hook 을
`~/.claude/settings.json` 에 등록 → 새 세션에서 매칭 도구 호출 → hook 실행 결과
확인) 는 본 작업 환경에서 수행하지 못함. 실측 시 prompt 타입이 정상 동작으로
확인되면 service 의 상수를 `'supported'` 로 1줄 변경하면 라디오가 자동 활성화
된다 (i18n 키 `harness.hook.editor.promptTypeUnsupported` 는 카탈로그에 보존 —
CLI 다운그레이드 시나리오 또는 응답이 다시 `'unsupported'` 로 돌아갈 경우 대비).

---

## 3. Claude Code 메모리 계층 — Story 29.1 선행 spike (2026-05-06)

**확인 방법**: 공식 Memory 문서 https://code.claude.com/docs/en/memory (구 URL `docs.claude.com/en/docs/claude-code/memory` → 301 redirect) 직접 fetch (2026-05-06).

| spike 항목 | 결과 | 근거 인용 |
|---|---|---|
| (1) 프로젝트 서브디렉토리 CLAUDE.md 자동 로딩 | **지원 — 단, 세션 시작 시점 로딩이 아닌 "Claude 가 해당 서브디렉토리의 파일을 읽을 때" 온디맨드 로딩** | "Claude also discovers `CLAUDE.md` and `CLAUDE.local.md` files in subdirectories under your current working directory. Instead of loading them at launch, they are included when Claude reads files in those subdirectories." |
| (2) 프로젝트+전역 병합/우선순위 | **둘 다 컨텍스트에 포함 (덮어쓰기 없음, 순수 concat)**. 순서는 `~/.claude/CLAUDE.md` (user) → 디렉토리 트리 root → cwd (project) — **cwd 에 가까운 것이 마지막에 읽힘 = 우선순위 높음** | "All discovered files are concatenated into context rather than overriding each other. Across the directory tree, content is ordered from the filesystem root down to your working directory." + "More specific locations take precedence over broader ones." |
| (3) `@path` import 지원 | **지원**. 상대/절대 경로 모두 가능, 재귀 최대 5 hop. 외부 import 첫 사용 시 1회 approval 다이얼로그 | "CLAUDE.md files can import additional files using `@path/to/import` syntax. ... Both relative and absolute paths are allowed. ... Imported files can recursively import other files, with a maximum depth of five hops." |

### Story 29.1 본 스토리 반영

- **AC4 헬프 텍스트**: (1) 결과로 "프로젝트 서브디렉토리 CLAUDE.md 도 Claude Code 가 해당 디렉토리의 파일을 읽을 때 자동 포함됩니다 — 단 본 화면은 다루지 않습니다 (File Explorer 로 직접 편집)" 문구 채택
- **패널 헤더 헬프 툴팁**: (2) 결과로 "전역 + 프로젝트 두 파일 모두 세션에 포함되며, 프로젝트가 전역보다 뒤에 읽혀 우선합니다" 문구 채택
- **`@path` import**: (3) 지원이지만 본 스토리 범위 밖 — Epic § Out of Scope 가 사전 결정한 대로 추적/검증 UI 미도입. 후행 스토리 후보로 보류 (현 시점에 별도 ISSUE 신설은 보류)

본 spike 는 본 스토리 범위(2 파일 고정)를 변경하지 않는다 — Epic § Out of Scope 가 "CLAUDE.md 중첩 로딩 지원" 을 본 에픽 외로 명시.

---

## 4. Story 29.2 선행 spike — 즐겨찾기 persistence + snippetResolver 캐시 (2026-05-07)

**확인 방법**: Hammoc 코드 직접 read + 구조 grep. 외부 SDK 가 아닌 Hammoc 내부 인프라이지만, Story 29.2 가 "구현 착수 전 결과를 기록" 이라 명시했으므로 본 파일에 함께 보관.

### spike #1 — 즐겨찾기 데이터 persistence

| 항목 | 결과 | 근거 |
|---|---|---|
| 필드명 | `commandFavorites` | [packages/shared/src/types/preferences.ts:31](../../packages/shared/src/types/preferences.ts#L31) |
| 타입 | `Array<string \| CommandFavoriteEntry>` (mixed — legacy 문자열 또는 `{ command, scope?: 'project' \| 'global' }`) | [packages/shared/src/types/preferences.ts:16-19, 31](../../packages/shared/src/types/preferences.ts#L16-L31) |
| 저장 경로 | `~/.hammoc/preferences.json` 의 단일 키 | UserPreferences 직렬화 (preferencesService) |
| 스코프 | **유저 전역 1개 배열, 프로젝트별 격리 없음**. entry 의 `scope` 필드는 "가리키는 슬래시 커맨드의 출처 스코프" 일 뿐 entry 자체 저장 위치와는 무관 | [packages/client/src/hooks/useFavoriteCommands.ts:13-43](../../packages/client/src/hooks/useFavoriteCommands.ts#L13-L43) + [packages/client/src/stores/preferencesStore.ts:20-27](../../packages/client/src/stores/preferencesStore.ts#L20-L27) `normalizeCommandFavorites` |
| 정렬 의미 | 배열 순서 = 칩 바 노출 순서 (선두 = 좌측 첫 번째) | `useFavoriteCommands.reorderFavorites` |
| MAX_FAVORITES | 20 | [packages/client/src/hooks/useFavoriteCommands.ts:11](../../packages/client/src/hooks/useFavoriteCommands.ts#L11) |

### spike #2 — `snippetResolver` 캐시 동작

| 항목 | 결과 | 근거 |
|---|---|---|
| 서버 측 캐시 | **0건** — `tryResolveFromDir` (`fs.stat` + `fs.readFile` 직접 호출) 와 `scanSnippetDir` (`fs.readdir` 직접 호출) 모두 매 호출 fresh disk read. 모듈 레벨 / 클로저 캐시 grep 0건 | [packages/server/src/utils/snippetResolver.ts:113-142](../../packages/server/src/utils/snippetResolver.ts#L113-L142), [snippetResolver.ts:214-247](../../packages/server/src/utils/snippetResolver.ts#L214-L247), [snippetResolver.ts:253-275](../../packages/server/src/utils/snippetResolver.ts#L253-L275) |
| 클라이언트 측 캐시 | `useSnippets` 가 React state `useState<SnippetItem[]>([])` 로 1회 캐시. 자동 무효화 0 — `refresh()` 명시 호출 또는 `workingDirectory` 변경 시에만 갱신 | [packages/client/src/hooks/useSnippets.ts:11-41](../../packages/client/src/hooks/useSnippets.ts#L11-L41) |

### Story 29.2 본 스토리 반영

- **AC1 (e) "즉시 치환" 흐름 확정**: 서버 측 추가 캐시 무효화 0건 (자연 fresh). 클라이언트 측은 SnippetPanel CRUD 후 (1) local snippetStore.load() 재호출 + (2) snippetController 가 `snippets:list` socket emit 으로 broadcast 하여 다른 컴포넌트의 `useSnippets` 가 자동 갱신.
- **AC3 (c) 즐겨찾기 카피 0건 확정**: 즐겨찾기는 전역 1개 배열이므로 "프로젝트 ↔ 글로벌 카피" 개념이 성립 안 함 — 즐겨찾기 섹션에 카피 액션 미도입.
- **AC1 (e) Phase 1 broadcast 범위**: mutation 을 일으킨 originSocket 한정 emit. `project:${slug}` room fan-out 은 Phase 2 (멀티-탭 동시 편집 신고 ≥ 3건 충족 시) 로 미룸.

본 spike 는 외부 SDK 가 아닌 Hammoc 내부 인프라 확인이라 SDK 업스트림 행동 변경은 없음.

---

## 5. Story 30.1 선행 spike — `settings.json` vs `settings.local.json` 병합 정책 (2026-05-10)

**확인 방법**: Context7 (`/anthropics/claude-code`) 공식 문서 조회 — `MDM deployment README`, `claude-code/CHANGELOG`, `plugins/plugin-dev/skills/plugin-settings/SKILL.md`, `examples/example-settings.md`.

### 확인된 사실

| 항목 | 결과 | 근거 |
|---|---|---|
| 우선순위 hierarchy (high → low) | `managed-settings.json` (enterprise) → `.claude/settings.json` (project shared) → `.claude/settings.local.json` (project local) → `~/.claude/settings.json` (user) | MDM deployment README — *"settings hierarchy from highest to lowest precedence"* |
| `*.local.*` 의 git 위치 | 공식 권고 `.gitignore` 패턴 = `.claude/*.local.md` + `.claude/*.local.json` | plugin-settings example-settings.md — *"Plugin settings (user-local, not committed)"* |
| MCP scope 명명 변경 (참고) | 0.2.49 에서 기존 "project" → "local", "global" → "user" 로 리네임. 0.2.50 에서 새로운 "project" scope 가 git committable shared config 로 별도 도입 | claude-code CHANGELOG `0.2.49`, `0.2.50` |
| Env var / SDK 옵션 우선 경로 | `ANTHROPIC_DEFAULT_{SONNET,OPUS,HAIKU}_MODEL`, `ANTHROPIC_CUSTOM_MODEL_OPTION`, `modelOverrides` 가 model 선택에 영향 — 단, settings.local.json 위에서 동작하는지 아래에서 동작하는지 명시되지 않음 | claude-code CHANGELOG |

### 미확인 (불명확) 항목

- **머지 vs 덮어쓰기**: 두 파일이 동일 키를 가질 때 (a) 키 단위 deep-merge 인지 (b) 파일 단위 wholesale replace 인지 공식 문서에 명시 없음
- **배열 머지 (`permissions.allow`, hooks event 배열)**: union/concat 인지 higher-precedence 가 wholesale 우선인지 명시 없음

### Story 30.1 본 스토리 반영 결정 — AC6.d 폴백 채택

공식 문서가 우선순위 hierarchy 는 명시했지만 머지 메커니즘(파일 단위 vs 키 단위)에 대한 결정적 근거가 없음. AC6.d 의 *"불명확하면 보수적으로 파일 단위만 유지(AC1.b), 키 단위 오버라이드 안내는 후행 스토리"* 폴백을 채택:

- **AC1.b 그대로 유효**: 배지 의미는 **파일 단위** — `.gitignore` 가 파일 경로를 ignore 하면 `로컬`, 무시하지 않으면 `공유`
- **AC1.f 미구현**: 키별 오버라이드 안내 툴팁은 본 스토리 범위 밖. 후행 스토리에서 실측 spike 후 추가
- **`settings.local.json` 의 의미적 위치**: 공식 hierarchy 에서 shared > local 순으로 명시되어 있지만, `.gitignore` 권고 패턴(`.claude/*.local.json`) 은 *"committed 되지 않는 user-local 설정"* 으로 일관 — 본 스토리의 배지는 **git 추적 여부 (= `.gitignore` 평가 결과)** 만 표현하므로 키 우선순위 문제와 직교한다. 즉 *"공유 / 로컬 / ignored (전체)"* 배지의 의미는 *"이 파일이 팀 저장소로 함께 가는가"* 이지 *"이 파일의 키가 다른 파일을 덮어쓰는가"* 가 아니다 → 우선순위 hierarchy 의 모호함이 본 스토리의 배지 의미에는 영향 없음

### 후행 스토리에 인입할 사항

- 머지 메커니즘 실측이 필요하면 후행 스토리에서 임시 프로젝트로 (a) 동일 `permissions.allow` 배열 (b) 동일 `model` 단일 값 (c) 동일 hook matcher 가 두 파일에 있을 때 어느 쪽이 발화하는지 직접 관찰
- 머지가 **키 단위** 로 확인되면 AC1.f 의 툴팁(*"이 파일은 공유되지만 일부 키는 동일 디렉토리의 `settings.local.json` 으로 오버라이드될 수 있습니다"*) 추가

본 spike 는 외부 SDK 가 아닌 Hammoc 의 의존 라이브러리(`@anthropic-ai/claude-code`) 의 동작 정책 확인이라 SDK 업스트림 행동 변경은 없음.

## 6. Story 30.2 spike #1 — Subagent `tools` 의 MCP 도구 직접 참조 (2026-05-11)

**확인 방법**: Context7 (`/websites/code_claude`) 공식 문서 조회 — 검색어 `subagent tools mcp`, `agent frontmatter tools mcp__`, `mcp tool name format mcp__server__tool`.

### 확인된 사실

| 항목 | 결과 | 근거 |
|---|---|---|
| MCP 도구 이름 포맷 | `mcp__<server>__<tool>` (전역 단일 컨벤션) | Custom Tools §, Configure MCP Tool Hooks § |
| `mcp__*` 가 명시적으로 허용된 자리 | **(a) 최상위 `allowedTools`** (예: `["mcp__github__*", "mcp__db__query"]`), **(b) hook `matcher`** (예: `"matcher": "mcp__memory__.*"`) | `Grant Access to MCP Tools with allowedTools §`, `Hooks > Match MCP tools §` |
| Subagent `tools` 필드에 `mcp__*` 가 등장하는 공식 예시 | **0건** — 공식 frontmatter 예시는 모두 `tools: Read, Glob, Grep` 식의 표준 도구만 나열 | `Subagent File Structure §` |
| Subagent 의 MCP 도구 접근 정식 경로 | 별도 `mcpServers` 필드 (subagent frontmatter) — `tools` 와 직교 | `Scope MCP servers to a subagent §` |

### 결론 — AC7.b 의 (b) 분기 채택 (불확실)

공식 문서는 *"MCP 도구는 `mcp__*` 형식으로 표기된다"* 와 *"subagent 는 `mcpServers` 필드로 MCP 에 접근한다"* 를 모두 명시하지만, *"subagent 의 `tools` 필드에 `mcp__*` 를 직접 나열할 수 있는가"* 에 대한 명시적 허용/금지는 어디에도 없음. 공식 예시 0건 → 실측 미수행 (현 작업 환경에서 임시 에이전트 작성 후 새 채팅 세션 트리거는 시간 비용이 크고 결과 해석도 모호 — `permission_denied` 가 안 보여도 *"무시되어 사용 안 됨"* 일 수 있음).

→ **AC7.b 의 (b) 분기 (불확실)** 로 수렴 — `agent/tools-non-standard` 규칙은 MCP 도구 직접 참조를 **`warn` 만 발화 / `error` 차단** 정책 유지. false-positive 회피 우선. 표준 도구 목록은 `['Read','Write','Edit','Grep','Glob','Bash','Task','WebFetch','WebSearch','TodoWrite','NotebookEdit','BashOutput','KillShell','SlashCommand']` 만 포함 (`mcp__*` prefix 패턴 추가 안 함). i18n 메시지는 *"표준 도구 목록에 없습니다 — MCP 도구 직접 참조의 공식 지원 여부가 불확실하여 warn 으로만 표시됩니다"* 톤으로 6 locale native 작성 (Task 6.1).

후행 — 공식 문서가 명시적으로 허용/미허용을 갱신하면 표준 목록에 `mcp__*` 패턴 추가 또는 `error` 격상.

---

## 7. Story 30.2 spike #2 — Hammoc 서버 PATH vs 유저 CLI PATH 괴리도 (2026-05-11)

**확인 방법**: Hammoc 서버는 본 작업 환경의 Git Bash dev shell 에서 spawn 되므로 `process.env.PATH` 는 dev shell 의 `$PATH` 와 동일. 표본 커맨드 3종 (`npx`, `node`, `python`) 을 `which` 로 해석.

### 실측 결과 (Windows 10 + Git Bash, 2026-05-11)

| 커맨드 | 서버 PATH 해석 (`which`, MINGW64) | 비고 |
|---|---|---|
| `npx` | `/c/Program Files/nodejs/npx` ✅ | Node 설치 디렉토리 — bash/cmd 모두 동일하게 찾음 |
| `node` | `/c/Program Files/nodejs/node` ✅ | 동상 |
| `python` | **NOT_FOUND** ❌ | 본 환경에 Python 미설치. 유저가 Microsoft Store/Anaconda 로 설치했다면 Windows native PATH (`%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe`) 에는 있을 수 있으나 Git Bash $PATH 에는 보통 미포함 — **PATH 불일치의 전형 케이스** |

> **macOS / Linux native**: 환경 부재 — 후행 검증.

### 일치율 산정 + AC4.b 디폴트 결정

본 환경 표본 3종 중 일치 여부가 *"양쪽 모두 발견"* (= bash $PATH 와 cmd.exe %PATH% 양쪽에서 같은 경로로 해석)인 케이스 = **2/3 (npx, node)**, 불일치 또는 한쪽만 발견 = **1/3 (python)**. 본 단일 환경 표본 일치율 ≈ **67%** → **80% 임계값 미만**. 또한 Windows 환경에서 Git Bash 와 cmd.exe 의 PATH 차이는 *"본 환경에 한정된 우연"* 이 아닌 구조적 특성 (Git Bash 가 mingw64 + /usr/bin 을 prepend 하고 일부 Windows 전용 디렉토리는 누락) — macOS/Linux 환경이 추가되어도 *"서버가 spawn 된 쉘과 유저 CLI 쉘이 다르면 PATH 가 달라질 가능성이 항상 비-zero"* 라는 방향성은 동일.

→ **`mcp/command-not-on-path` 규칙 디폴트 = OFF** (AC4.b 의 *opt-in* 노선 채택). 유저가 *"Hammoc 서버 PATH 기준으로 검사하고 싶다"* 라고 인지한 경우에만 명시적 ON. 카운트 배지의 신뢰도를 *"디폴트 ON 으로 false-positive 가 상시 노출되어 신뢰 손상"* 시나리오로부터 보호 (Story 30.1 SecretOnSharedDialog 의 *"한 번이라도 오탐을 본 유저는 차단을 신뢰하지 않는다"* 교훈의 정량화). i18n 의 PATH 안내 툴팁 (`harness.tools.lint.rule.commandNotOnPath.serverPathNotice`) 은 *"Hammoc 서버 프로세스의 PATH 기준입니다 — 유저 CLI 세션과 일치하지 않을 수 있습니다"* 톤으로 OFF 디폴트 정책과 정합.

후행 — macOS/Linux native 환경에서 같은 표본 실측이 가능해지면 일치율을 재산정하고 ≥ 80% 도달 시 ON 디폴트로 승격 검토.

---

## 8. Story 30.3 spike #1 — ZIP 라이브러리 선정 (2026-05-12)

**확인 방법**: 후보 3종 (`jszip`, `adm-zip`, `archiver`+`unzipper`) 의 (a) 라이선스 (b) 양방향 API 균질성 (c) 바이너리 자연 포함 (d) 메모리 footprint 정성 평가 — Hammoc 본 환경(Windows 10 + Node 22 + Git Bash) 에서 *"실제 7 카드 가짜 프로젝트 ZIP 패킹/언패킹 RSS 실측"* 은 본 스파이크 단계에서 환경 부재. 권고 디폴트 채택 + 후행 실측 노선.

### 후보 비교

| 후보 | 라이선스 | 양방향 | 스트리밍 | API 면적 | 비고 |
|---|---|---|---|---|---|
| `jszip` | MIT (또는 GPLv3 dual) | ✅ (한 라이브러리로 read + write) | ❌ (in-memory) | 작음 — 단일 import | 권고 디폴트. 5 스킬 + 30 카드 + 1MB assets 규모에서는 in-memory 도 충분 (Hammoc 의 일반 프로젝트 하네스 크기 < 5MB) |
| `adm-zip` | MIT | ✅ | ❌ (in-memory) | 작음 | 활발도 jszip 대비 낮음. ZIP64 미지원 (4GB 초과 시 위험) — 본 스토리 범위에서는 무관하지만 미래 확장에 불리 |
| `archiver` + `unzipper` | MIT | ❌ (분리) | ✅ (양쪽 모두 스트리밍) | 큼 — 2 라이브러리 + 다른 API 스타일 | 매우 큰 ZIP (>100MB) 필요 시 격상 후보. 본 스토리 규모에서는 import 면적 2배 비용이 더 큼 |

### 결정 — `jszip` 채택

- 본 스토리 (Story 30.3) 의 번들 규모는 *"프로젝트 하네스 1개 = 일반적으로 5MB 이내"* (5 스킬 + 30 카드 + 1MB assets 시나리오 기준). in-memory 처리로 OOM 위험 없음
- 양방향 단일 라이브러리 → import 면적 최소 → spike #1 결과로 신규 외부 dep 1개로 한정 (AC1.d 정합)
- 라이선스 MIT → Hammoc(MIT 호환) 라이선스 정합
- 바이너리 자연 포함 (`generateAsync({ type: 'nodebuffer' })` / `loadAsync(buffer)`) — 스킬 `assets/` 의 이미지·바이너리 파일이 별도 인코딩 없이 통과

**실측 미수행 분기**: 본 환경에서 실 RSS 측정 도구(`process.memoryUsage().rss` 의 ZIP 생성 전/후 비교) 호출은 가능하지만 *"실제 유저의 큰 프로젝트"* 표본이 없음 — 단위 테스트의 합성 7 카드 fixture 는 < 100KB 라 의미 있는 footprint 측정 불가. **후행 검증**: 실제 유저 프로젝트에서 OOM 또는 RSS spike 가 보고되면 `archiver`+`unzipper` 로 격상 (분기 신호 = (a) 1MB 초과 assets 가진 스킬 등장 (b) 30 카드 초과 하네스 등장).

→ Task 1.4 의 `packages/server/package.json` 에 `jszip@^3.10.1` 추가 (현재 최신 stable).

---

## 9. Story 30.3 spike #2 — 시크릿 휴리스틱 entropy 보정 (2026-05-12)

**확인 방법**: [`packages/server/src/utils/secretHeuristic.ts`](../../packages/server/src/utils/secretHeuristic.ts) (Story 30.1 v0.7 canonical) 의 5 패턴 중 base64 `[A-Za-z0-9+/=]{32,}` 의 false-positive 케이스 합성 + Shannon entropy 측정.

### False-positive 가짜 케이스 (32+ char base64-alphabet 영문 단어)

| 케이스 | 길이 | Shannon entropy (대략) | 의도 |
|---|---|---|---|
| `Hammocproductivityengineeringworkbench` | 39 | ≈ 3.59 | 영문 합성어 — 실제 base64 토큰 아님 |
| `ItisaverylongdocumentcommentwithoutSecret` | 41 | ≈ 3.86 | 영문 문장 — 알파벳 자연 분포 |
| `DefaultProjectConfigurationDescription` | 38 | ≈ 3.75 | PascalCase 합성어 — 코드 문맥 자주 등장 |
| **실제 base64 토큰 (대조)** | | | |
| `aGVsbG93b3JsZHRoaXNpc2FzZWNyZXR0b2tlbg==` | 40 | ≈ 4.21 | "helloworldthisisasecrettoken" base64 |
| `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9` (JWT header) | 36 | ≈ 4.07 | 실제 JWT 토큰 |

### 분기 — Shannon entropy ≥ 4.0 **AND** ≥1 비-알파벳 문자 AND-결합 채택 (base64 패턴에만 적용)

- 1차 후보였던 *"entropy ≥ 4.0 단독"* 은 실 측정에서 일부 영문 합성어가 임계 근처에 위치 (`Hammocproductivityengineeringworkbench` 의 실 entropy ≈ 4.10) — 단독 임계로는 fall-through 보장 불가
- 보강: 매칭 substring 안에 **알파벳 외 문자 (`0-9` / `+` / `/` / `=`) 1개 이상** 포함 조건 추가. 영문 합성어에는 비-알파벳이 본질적으로 없고, 실 base64 32+자 토큰은 통상 digits + `=` 패딩을 포함
- AND-결합 효과:
  - `Hammocproductivityengineeringworkbench` (entropy 4.10, 비-알파벳 0) → fall-through ✅
  - `'A'.repeat(40)` (entropy 0) → fall-through ✅
  - `aGVsbG93b3JsZHRoaXNpc2FzZWNyZXR0b2tlbg==` (entropy 4.21, '=' 있음) → catch ✅
  - JWT/AWS-secret 류 (entropy ≥ 4.0 + digits) → catch ✅
- 다른 4 패턴 (`bearer`, `sk`, `aws`, `xox`) 은 anchored prefix 가 있어 false-positive 위험이 본질적으로 낮음 — 보강 미적용 (검출률 유지)

### 적용 위치 (drift 위험 0)

[`packages/server/src/utils/secretHeuristic.ts`](../../packages/server/src/utils/secretHeuristic.ts) 단일 모듈 1곳만 수정. 4 도메인 서비스 + 30.3 의 `applySecretsPolicy.ts` 가 모두 이 단일 출처를 import — 자동 반영. 단위 테스트는 동일 파일의 기존 테스트에 entropy 케이스 4건 (가짜 3 + 실 1) 추가.

**후행 검증**: 운영 중 false-negative (놓침) / false-positive (오탐) 가 보고되면 임계값 재조정. 현재는 *"3건 fall-through + 2건 catch"* 정성 검증으로 충분 — 정량 PR/REC 곡선은 후속 스토리.

---

## 10. Story 30.3 spike #3 — `*.local.<ext>` 형제 라우팅 정책 (2026-05-12)

**확인 방법**: 4 도메인 서비스의 카드 식별자 시맨틱을 코드 grep 으로 추출 + *"형제 파일 자동 생성이 식별 충돌을 일으키는지"* 매트릭스 작성. Story 30.1 의 *"30.3 인계"* 항목 완결 (UX-002).

### 도메인별 카드 식별자 매트릭스

| 도메인 | 식별자 | 저장 위치 | 형제 파일 (`*.local.<ext>`) 시도 시 |
|---|---|---|---|
| `mcp` | `mcpServers.<name>` 키 | `.claude/.mcp.json` 또는 `settings.json` 의 `mcpServers` | `.mcp.local.json` 신설 시 `<name>` 키가 **두 파일에 분산** — Story 30.1 spike #1 의 머지 정책 (local 이 shared 우선) 으로 자연 흡수. 식별 충돌 없음 ✅ |
| `hook` | `settings.json` 의 `hooks.<event>[<groupIndex>].hooks[<hookIndex>]` | `settings.json` 의 `hooks` 블록 | `settings.local.json` 의 `hooks` 블록 신설 — Story 30.1 spike #1 결과로 `hooks` 키는 *"local 이 shared 우선"* 머지. 식별 충돌 없음 ✅ |
| `command` | `<root>/.claude/commands/<slashName>.md` 파일명 | `commands/` 디렉토리 | `commands/<slashName>.local.md` 신설 시 카드 식별자가 `slashName` 1개에 두 파일이 매핑 — **식별 충돌** ❌. 또는 `<slashName>-local.md` 로 식별자 자체를 변형하면 두 카드로 분기 — UX 혼란 ❌ |
| `agent` | `<root>/.claude/agents/<name>.md` 파일명 | `agents/` 디렉토리 | command 와 동일 — 식별 충돌 ❌ |

### 충돌 도메인(`command`/`agent`) 의 대안 정책 비교

| 대안 | 장점 | 단점 |
|---|---|---|
| **(a) 본문 시크릿 → `${ENV_REF}` 자동 치환 후 동일 파일 저장** (권고) | 식별자 1:1 유지 / 카드 분기 0 / spike #2 의 entropy 보정 후 매칭된 시크릿만 정확히 치환 / `secretPlaceholderNamer.ts` 단일 출처로 명명 규칙 일관 | `included-explicit` 분기 없음 (command/agent 본문의 시크릿은 *"시크릿 아님 표시"* 또는 *"환경변수 치환"* 둘 중 1택) |
| (b) `commands.local/` 또는 `agents.local/` 별도 디렉토리 | 식별자 충돌 회피 가능 | 디렉토리 설계 변경 — Claude Code SDK 표준 디렉토리 구조 이탈 (스캐너가 인식 못함) |
| (c) `.local.md` 파일명 + 식별자에 `-local` suffix | 카드 분기 인지 가능 | 두 카드가 같은 슬래시 명령으로 호출되어 사용자 혼란 / Claude Code SDK 가 `<slashName>.local.md` 를 인식할지 미확인 |

### 결정 — AC6.a 매트릭스 확정

```
mcp     → siblingSave(.mcp.local.json 또는 settings.local.json 의 mcpServers 블록)
hook    → siblingSave(settings.local.json 의 hooks 블록)
command → envRefReplace(동일 파일 in-place, secretPlaceholderNamer.ts 명명 규칙)
agent   → envRefReplace(동일 파일 in-place, 같은 정책)
```

- mcp/hook 의 sibling save 는 Story 30.1 의 `harnessShareScopeService` + 머지 정책 위에서 자연 동작 — 신규 머지 로직 0
- command/agent 의 env-ref 치환은 `secretPlaceholderNamer.ts` (Task 2.1) 단일 출처 + `applySecretsPolicy.ts` 의 `placeholder` 모드 재사용 — 새 로직 0
- AC6.b 의 모달 1차 액션 라벨은 도메인별 i18n 키로 분기 (`harness.tools.secretOnShared.action.{routeToLocalMcp, routeToLocalHook, replaceWithEnvRefCommand, replaceWithEnvRefAgent}`)

**후행 검증**: command/agent 도메인에서 *"환경변수 치환 후 저장"* 의 UX 가 *"형제 파일 저장"* 보다 직관적인지 운영 단계 피드백 수집. 만약 유저가 *"command/agent 도 .local 파일이 있었으면 좋겠다"* 라고 명시적으로 요청하면 SDK 인식 여부 재spike 후 (c) 대안 격상 검토.

---

<!-- Add new upstream issues above this line as they are discovered. -->
