# Claude Agent SDK — Upstream Issues

Running notes on `@anthropic-ai/claude-agent-sdk` behavior that blocks Hammoc
integration tests but is outside Hammoc's code. Each entry is structured so
it can be pasted into an upstream bug report with minimal editing.

---

## 1. `maxBudgetUsd` is not enforced by the CLI

**SDK version**: `@anthropic-ai/claude-agent-sdk@0.2.114` (bundled Claude Code
CLI of the same release train)

**Related Hammoc scenario**: [H-05-02](scenarios/H-queue.md)

### Documented behavior

From `sdk.d.ts` (1355-1358):
```ts
/**
 * Maximum budget in USD for the query. The query will stop if this
 * budget is exceeded, returning an `error_max_budget_usd` result.
 */
maxBudgetUsd?: number;
```

`SDKResultError` subtype union (`sdk.d.ts` 2878-2880) includes
`error_max_budget_usd` alongside `error_max_turns`, so the expectation is
that the CLI aborts the turn loop when cumulative cost exceeds the cap and
emits the corresponding result message.

### Observed behavior

1. Hammoc forwards `maxBudgetUsd` into SDK `queryOptions` correctly
   (verified via unit test and by inspecting the child-process CLI
   invocation — `--max-budget-usd 0.0001` is on the argv).
2. Issue a query with `maxBudgetUsd: 0.0001` against Sonnet 4.6.
3. A single assistant response with `cache_read 28925 + output 14` tokens
   (≈ $0.009, ~90× the cap) completes with `subtype: success`.
4. Running the query inside a 2-item queue where item 1 exceeds the cap
   does not block item 2 either. No `error_max_budget_usd` is emitted at
   any point.

### Expected

Either the first-turn boundary check or the between-turns check should
fire and return an `SDKResultError { subtype: 'error_max_budget_usd' }`
before the response completes / before the next `query()` runs.

### Workaround tracked in Hammoc

Scenario tagged `[SDK_BLOCKED]`. Client-side queue handler
(`queueService.executePrompt`) already routes `response.isError` results
through `pauseWithError` + `notifyQueueError`, so the moment the CLI
starts emitting `error_max_budget_usd` the scenario goes to PASS with no
further Hammoc changes.

A client-side budget watchdog (accumulate `usage.totalCostUSD` across
queue items and abort) was considered but deferred — it would duplicate
SDK semantics and have to be removed once upstream is fixed.

---

<!-- Add new upstream issues above this line as they are discovered. -->
