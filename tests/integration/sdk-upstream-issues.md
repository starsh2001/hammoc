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

<!-- Add new upstream issues above this line as they are discovered. -->
