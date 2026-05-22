## 12. Harness Workbench

The **Harness Workbench** is the unified surface for managing everything Claude Code reads from the `.claude/` configuration tree — plugins, skills, MCP servers, hooks, slash commands, sub-agents, `CLAUDE.md`, and Hammoc-native `%snippets`. It lives inside each project's **Settings** tab (see §5.3) under the "Harness Workbench" group, so the workbench is always scoped to the project you're working on but can also reach the global (`~/.claude/`) versions of each item.

### 12.1 Layout

The workbench has two stacked headers above an eight-section navigator:

- **Mode banner** — Workbench-wide; explains whether the project's `.claude/` is git-tracked or ignored (see §12.2)
- **Lint preferences button** — Top-right; opens a dialog to toggle the seven static-lint rules (see §12.12)

The section navigator is a vertical sidebar on desktop and a horizontally-scrolling pill row on mobile. Sections, in order:

1. **Plugins** — Installed Claude Code plugins (see §12.4)
2. **Skills** — `SKILL.md` skill bundles (see §12.5)
3. **MCP** — MCP server entries from `.mcp.json` / `~/.claude/.mcp.json` (see §12.6)
4. **Hooks** — Lifecycle hooks declared in `settings.json` (see §12.7)
5. **Commands** — Slash command files (see §12.8)
6. **Agents** — Sub-agent definitions (see §12.9)
7. **CLAUDE.md** — Project and global instruction documents (see §12.10)
8. **Snippets** — Hammoc `%snippet` library + Claude Code slash-command favorites (see §12.11)

When the workbench loads, every section's data is fetched in parallel and cached, so switching between sections feels instant. Each section's data also stays in sync with disk: any external change (made outside Hammoc) updates the corresponding card without a reload.

### 12.2 Share Mode Banner

A workbench-wide banner just above the navigator tells you how the project shares its `.claude/` configuration:

- **Team-shared** (gray banner) — `.claude/` is **not** ignored by git. Files committed here (skills, hook definitions, the project `CLAUDE.md`, etc.) ship with the repo and reach every teammate.
- **Private** (amber banner) — `.claude/` (or a parent path) is excluded by `.gitignore`. Files here stay on your machine. An **"Export bundle"** button lets you ship the current harness state to a teammate as a single bundle file when you want to.

The banner is derived from the project root's `.gitignore`. Edit the rules and the banner updates the next time the workbench refreshes.

### 12.3 Share Badges

Every editable card (skill, MCP, hook, command, agent, `CLAUDE.md`, snippet) shows a small **share badge** indicating that specific file's git scope:

- **Shared** (blue) — File tracked by git; team will see your edits after a commit
- **Local** (gray) — File exists but is not tracked
- **Ignored** (amber) — `.claude/` is fully git-excluded; this file will not be committed

The badge is computed per-file so a single project can mix shared and local items.

### 12.4 Plugins Panel

Lists every Claude Code plugin discovered under the project and global plugin roots:

- One card per plugin with name, version, and small component counts (skills, commands, agents, hooks, MCP servers it ships)
- A toggle switch enables or disables the plugin without uninstalling it
- Plugin-provided items appear (read-only) in the other workbench sections too, with a **"Plugin: <key>"** scope badge

### 12.5 Skills Panel

Card grid for skill bundles (a `SKILL.md` plus optional supporting files):

- **Scope filter** — All / Project / Global / Plugin
- **Card front** — Name, description, scope badge, share badge, lint marker (if the skill has lint issues), and a kebab menu for copy actions
- **Open** — Click the card to open the **Skill Editor**, a modal with two modes:
  - **Form mode** — Separate fields for the YAML frontmatter (Name, Description, Version) and a Markdown body with edit/preview toggle
  - **Raw mode** — Edit the raw `SKILL.md` text directly when the frontmatter cannot be parsed
- **Bundle resources** — A nested tree of supporting files (references, examples, scripts, assets) with file counts. Binary files are marked read-only; files over 1 MB are truncated
- **Copy actions** — Copy a skill between Project / Global / Plugin scopes. If the destination already has a skill with the same name, a **conflict dialog** offers Overwrite / Skip / Rename
- **Auto-save** — Edits debounce-save every ~300 ms; no manual save button
- **External-change banner** — If another tool overwrites the skill while you are editing, the editor reloads with a banner explaining the change

Bundled skills (from a plugin's `skills/`) can only be opened read-only — copy them to Project or Global scope first to customize.

### 12.6 MCP Panel

Card grid for MCP server entries (from `.mcp.json` or `~/.claude/.mcp.json`):

- **Type badges** — `stdio`, `sse`, `http`, `ws`
- **Toggle** — Enable / Disable a server. Disabling moves the entry to a backup section of the JSON file rather than deleting it, so you can re-enable later
- **Editor** — Form fields for the server type, command, arguments (one per line), URL, headers (key/value rows), and environment variables (key/value rows). A mask toggle hides secret-looking values
- **Secret detection** — Values that look like API keys are marked inline. When you copy a server between scopes, a warning dialog lists detected secrets and requires explicit acknowledgement before copying
- **Fresh-spawn banner** — After enabling/disabling or editing a server, a banner reminds you that MCP changes only take effect on your **next** message in a new chat turn. A **Start new session** button is available

### 12.7 Hooks Panel

Hooks are grouped by lifecycle event (PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, UserPromptSubmit, PreCompact, Notification):

- **Per-event sections** — Each event shows its hook cards and an inline "+ Add" button
- **Type badges** — `command` (shell command) and `prompt` (LLM-invoking)
- **Toggle** — Enable / Disable individual hooks
- **Matcher field** — Regex pattern that filters which tool calls (or events) the hook applies to; empty matcher means "all"
- **Parallel-execution badge** — Indicates when the hook runs alongside hooks from other sources for the same event
- **Cost warning** — `prompt`-type hooks invoke the LLM each time and show a cost/latency warning banner
- **Copy actions** — Same Project ↔ Global ↔ Plugin copy matrix as skills, with a review dialog that surfaces secret-looking values and command bodies before copying

### 12.8 Commands Panel

Slash command files (the `.md` files behind `/your-command`):

- One card per command with name, description, scope badge, share badge, and lint marker
- **Editor** — Markdown body with edit/preview toggle and frontmatter fields (description, argument hints)
- **Copy / Override-clone** — Copy to the other scope, or clone a plugin-provided command into Project / Global so you can customize it without losing the upstream copy

### 12.9 Agents Panel

Sub-agent definitions (`AGENT.md`-style files used by the `Agent` tool):

- One card per agent with name, role description, scope badge, share badge, lint marker
- **Editor** — Frontmatter fields (Name, Description, Tools), Markdown system prompt body, edit/preview toggle
- **Non-standard tools warning** — Lint rule flags tools that aren't part of the standard Claude Code toolset

### 12.10 CLAUDE.md Editor

Two-column editor for the instruction documents Claude Code loads at session start:

- **Left column** — Global `~/.claude/CLAUDE.md`
- **Right column** — Project `<root>/.claude/CLAUDE.md` with its own share badge
- **Mobile** — Columns collapse to a User / Project toggle above a single editor pane

Each column is a CodeMirror Markdown editor with edit/preview toggle and the same 300 ms debounce auto-save as the other panels. Copy buttons (← / →) move content between columns; if both files have content, a confirmation dialog warns before overwriting.

Both files load into every Claude Code session in this project; the project version takes precedence when an instruction is defined in both.

### 12.11 Snippets & Favorites Panel

A single panel manages both Hammoc-native snippets and Claude Code slash-command favorites.

**Snippets section** (top):

- Manages `%name` snippets from `<project-root>/.hammoc/snippets/`, `~/.hammoc/snippets/`, and the bundled set shipped with Hammoc (see §4.6)
- **Scope filter** — All / Project / Global / Bundled
- **+ New snippet** — Choose scope (Project or Global) and a name; an empty file is created and the editor opens
- **Editor** — CodeMirror with syntax highlighting for `%name%`, `{arg1}`, `{context}` tokens and an inline warning when a snippet references itself or forms a reference cycle (heuristic only — saves are not blocked)
- **Kebab menu** — Copy to the other scope, delete (with confirmation)
- **Bundled snippets** are read-only — copy to Project or Global scope first to customize

**Command Favorites section** (bottom):

- Drag-reorder list of slash command favorites (the same favorites shown in the chat input's favorites bar, see §4.3)
- Each entry shows the command name, scope, and a star toggle that moves it between regular and star favorites
- **Invalid chip** marker on favorites whose underlying command no longer exists on disk
- Up to 20 regular + 10 star favorites per scope

### 12.12 Static Lint

Every harness panel (skills, MCP, hooks, commands, agents) runs a background static-lint pass against its files. Lint output surfaces in three places:

- **Count badges on section nav** — A red dot with the error count and an amber dot with the warning count appear on the section tab when issues exist
- **Inline marker on cards** — The card header shows a small red or amber pill with the issue count; clicking jumps to the card detail or opens the editor
- **Issues list at the top of each panel** — Expandable list of every issue with file path, severity, message, and a "Open" link

**Rule preferences:** The **Lint preferences** button at the top-right of the workbench opens a dialog listing all seven rules. Each rule has an on/off toggle plus a description, and a **Restore defaults** button reverts the preferences. Preferences are stored globally (not per-project).

**Available rules:**

| Rule | Default | Catches |
|------|---------|---------|
| `naming/duplicate-across-sources` | on | The same name exists in two scopes (project + global, etc.) — surfaces which copy will actually load |
| `hook/matcher-regex-invalid` | on | Hook `matcher` regex won't compile |
| `parse/yaml-json-error` | on | Frontmatter or JSON config can't be parsed |
| `mcp/command-not-on-path` | off | MCP `stdio` command is not on the server's `PATH` |
| `mcp/url-invalid` | on | MCP `url` field is malformed for the chosen transport |
| `agent/tools-non-standard` | on | Agent declares a tool name Claude Code does not recognize |
| `hook/env-var-undefined` | on | Hook body references `${VAR}` that is not set on the server |

### 12.13 Secret-on-Shared Guard

When you save (or copy) a harness file whose share badge is **Shared**, Hammoc scans the content for plaintext secrets — long base64-looking values, AWS-style keys, bearer tokens — using both pattern and Shannon-entropy checks. If a likely secret is detected, the save is blocked and a dialog appears with three options:

- **Move to local file** — Auto-create a sibling file (e.g., `settings.local.json` next to `settings.json`), move the value there, and re-save the original with a reference. This keeps the secret out of git
- **Mark this value as not a secret** — One-shot opt-out for this save only; the heuristic does not persist the decision
- **Cancel** — Close the dialog without saving

The dialog lists exactly which values were flagged (line numbers for text files, dot-paths for JSON/YAML) so you can verify before deciding. The entropy gate avoids tripping on ordinary base64-looking strings (image tokens, integration test fixtures) that fall below the threshold.

### 12.14 Fullscreen Editor

Every body field (skill body, command body, agent prompt, CLAUDE.md, snippet body) shows a **Maximize** button (⤢ icon) next to the editor's close button. Clicking it opens a fullscreen overlay with the same CodeMirror editor and Markdown preview toggle, so you can write long content without scrolling inside a narrow modal. Edits in the overlay sync back to the host panel through the same debounce auto-save — there is no separate save button. Close the overlay with **X** or `Escape`.

