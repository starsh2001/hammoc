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

<!-- Add new upstream issues above this line as they are discovered. -->
