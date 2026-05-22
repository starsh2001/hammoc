# Harness File Layout

The Harness Workbench (user-facing, see manual §12) edits Claude Code's `.claude/` configuration trees in place. An agent can reach the same files directly with Read / Write / Edit and skip the UI when that's faster.

## On-disk roots

Two trees, walked in this priority order:

```
<projectRoot>/.claude/        # project scope (highest)
<homeDir>/.claude/            # global scope (user scope)
```

When the same name (skill, command, agent, hook, MCP server, snippet) exists in both, the project copy is **active** and the global copy is **shadowed** but kept on disk.

`<homeDir>` must be resolved before use — Read / Write / Edit do not expand `~`. On Windows that is `C:\Users\<user>\`.

## Per-item layout

| Item | Path (under either `.claude/` root) | Format |
|------|--------------------------------------|--------|
| Skill | `skills/<name>/SKILL.md` + bundle assets in the same directory | Markdown body + YAML frontmatter (`name`, `description`, `version`) |
| Slash command | `commands/<name>.md` | Markdown body + YAML frontmatter |
| Sub-agent | `agents/<name>.md` | Markdown body + YAML frontmatter (`name`, `description`, `tools`) |
| Hook | `settings.json` → `hooks.<EventName>[]` entries | JSON; one event name per array key (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreCompact`, `Notification`) |
| MCP server | `.mcp.json` at the project root, or `<homeDir>/.claude/.mcp.json` | JSON; entries under `mcpServers.<name>` |
| `CLAUDE.md` | `<projectRoot>/.claude/CLAUDE.md`, `<homeDir>/.claude/CLAUDE.md` | Plain Markdown; both files load into every session, project wins on conflict |
| Plugin | `plugins/<vendor>__<name>/` | Plugin bundle directory; treated read-only by Hammoc — copy items out to project/global to customize |

Hammoc-native `%snippets` are a separate layer (see manual §4.6); they live under `<projectRoot>/.hammoc/snippets/` and `<homeDir>/.hammoc/snippets/`, **not** the `.claude/` tree.

## Sharing scope

Each file's "share" status is computed from the project's `.gitignore`:

- **Shared** — File path is tracked by git
- **Local** — File path is untracked but `.claude/` is not ignored
- **Ignored** — A `.gitignore` rule excludes `.claude/` (or an ancestor)

The workbench shows a badge for each file. When an agent writes a file under `.claude/`, the resulting share scope is whatever the `.gitignore` already says — Hammoc does not rewrite `.gitignore` on the agent's behalf.

## Secret-on-Shared guard

When the user saves a `Shared`-scope file through the UI, Hammoc scans for plaintext secrets (entropy + pattern heuristic) and blocks the save with a dialog. **An agent writing the file directly via Write / Edit bypasses that dialog.** If the agent is editing a `Shared` file under `.claude/`, it must avoid committing plaintext API keys, bearer tokens, etc. Use a sibling `*.local.<ext>` file (gitignored) and reference it from the shared file, or use `${ENV_VAR}` references that the hook / MCP runtime expands.

## When changes take effect

- **Skills, commands, agents, CLAUDE.md, snippets** — Picked up on the next message in a chat turn (the system prompt and tool list re-resolve on each turn).
- **Hooks** — Same: next message in a chat turn.
- **MCP servers** — Picked up only on a **fresh session spawn**, not mid-session. The workbench UI shows a "Takes effect on your next user message" banner with a "Start new session" button after the user edits an MCP entry; an agent making MCP edits should remind the user to start a new session, or do so on their behalf.
- **Plugin enable/disable** — Same as MCP: fresh spawn required.

## Static lint (informational)

The workbench runs seven static-lint rules over the trees (see manual §12.12). Agents writing harness files should keep these rules in mind even though writes are not blocked:

- duplicate names across scopes
- invalid hook matcher regex
- frontmatter / JSON parse errors
- MCP `stdio` command not on `PATH`
- malformed MCP URLs
- non-standard agent tool names
- hook bodies referencing undefined env vars
