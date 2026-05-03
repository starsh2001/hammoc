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

<!-- Add new upstream issues above this line as they are discovered. -->
