# Observability Storage

Hammoc's Observability panel (user-facing, manual §12.18) persists two kinds of data under the user's home `.hammoc` directory. These are **not** under `.claude/` and are reached with direct file reads, not through the harness file service.

`<homeDir>` must be resolved before use — Read does not expand `~`. On Windows that is `C:\Users\<user>\`.

## MCP / tool call log

- **Path:** `<homeDir>/.hammoc/observability/<projectSlug>.jsonl`
- **Format:** JSON Lines — one tool-call record per line. Each record holds: tool-use id, project slug, session id, server name (parsed from the `mcp__<server>__<tool>` prefix; `null` for built-in tools like Read/Edit/Bash), tool name, start timestamp (epoch ms), duration in ms (`null` if the call never returned), argument byte size, result byte size (`null` if no response), and a success flag (`null` if no response).
- **Bodies are never written** — only sizes. The log therefore cannot leak file contents or secrets.
- **Retention:** records older than 30 days (override with the `OBSERVABILITY_RETENTION_DAYS` env var) are pruned on append (throttled to ~30 min) and at server startup.
- **Written by:** the chat service hooks the existing SDK message stream and appends one record per tool result. "Orphan" calls (started, never returned) are flushed once at turn end with `null` duration / result / success.

## Exact token-count cache

- **Path:** `<homeDir>/.hammoc/observability/token-count-cache.json`
- **Format:** a JSON object mapping a SHA-256 hash of the input text → official token count.
- The **Exact count** button calls Anthropic's count-tokens API; the result is cached here keyed by content hash, so re-counting an unchanged file is free and the cache is shared across projects (identical files hash the same).

## Tokenizer preference

- The inline `~` hint is always a byte-size heuristic (size ÷ 4); a tokenizer-grade tier was evaluated but not adopted (it drifted 25–45% from the official count on Claude 4.x). The preference lives in `<homeDir>/.hammoc/preferences.json` under `observabilityTokenizer` and is global (all projects), though its toggle UI sits inside the Observability panel.
