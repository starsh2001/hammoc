## 12. Harness Workbench

The **Harness Workbench** is the unified surface for managing everything Claude Code reads from the `.claude/` configuration tree — plugins, skills, MCP servers, hooks, slash commands, sub-agents, `CLAUDE.md`, and Hammoc-native `%snippets`. It lives inside each project's **Settings** tab (see §5.3) under the "Harness Workbench" group, so the workbench is always scoped to the project you're working on but can also reach the global (`~/.claude/`) versions of each item.

The same Settings tab also hosts four sibling harness-engineering panels next to the Workbench (each a top-level nav item, not one of the Workbench's own sections): **BMad Settings** (§12.16, BMad projects only), **Context Builder** (§12.17), **Observability** (§12.18), and **Plugin Marketplace** (§12.19).

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
- **Private** (amber banner) — `.claude/` (or a parent path) is excluded by `.gitignore`. Files here stay on your machine, so a teammate cloning the repo gets none of them.

The banner is derived from the project root's `.gitignore`. Edit the rules and the banner updates the next time the workbench refreshes.

> The Private mode banner surfaces an **Export** action on its right edge (in addition to the workbench-wide Bundle menu) so you can ship the current harness state to a teammate as a single `.zip` bundle. See §12.15 for the full export/import flow.

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

Every Markdown body in the workbench — skill body and raw view, skill bundle files, command body and raw view, agent system prompt and raw view, `CLAUDE.md` (both columns), snippet body — shows a small **Expand** button (⤢ icon) above the editor area. Clicking it opens a fullscreen overlay with the same CodeMirror instance, line wrapping, and a Markdown edit / preview toggle, so you can write long content without scrolling inside a narrow modal. Edits in the overlay sync back to the host panel through the same 300 ms debounce auto-save — there is no separate save button. Close the overlay with **X** or `Escape`. Read-only buffers (a plugin-scope file, a bundled snippet) show a small "read-only" chip in the overlay header.

### 12.15 Bundle Export / Import (Team Sharing)

When your project's `.claude/` tree is **fully git-ignored** (Mode B — typical when you use Hammoc itself to develop on Hammoc, or when your team intentionally keeps the harness out of source control), you can still share the entire workbench configuration with a teammate by exporting it as a single `.zip` bundle and importing on the other side. The workbench shows a **Bundle** menu (top-right of the workbench header, also surfaced as an **Export** button on the Mode B banner), with two actions:

- **Export bundle** — Opens a dialog summarizing what will be packed (the five domain cards + `CLAUDE.md` + snippets) and lets you choose how secrets are handled:
  - **Exclude (default)** — Secrets detected by the heuristic are stripped before packing; the recipient sees a *"N secrets removed"* toast after import. Use this when you want your teammate to fill in their own credentials.
  - **Include as `${ENV_REF}` placeholders** — Detected secrets are replaced with named environment-variable references and a hint table lists which keys the recipient needs to set. Good for sharing a config skeleton without leaking real values.
  - **Include explicit (with secrets)** — Plain-text secrets are packed as-is. This is the *"send it over secure DM and delete after use"* mode: you must check a second confirmation box before the dialog enables the download button, the resulting filename contains a visible `WITH-SECRETS` token, and a 5-second warning toast appears after the download starts.
- **Import bundle** — Drop a `.zip` (or browse for one). Before anything is applied, Hammoc shows a preview of every incoming item alongside what already exists, with three per-item actions (Overwrite / Skip / Add only if missing) and three bulk-action shortcuts. Bundles tagged *"with secrets"* require the recipient to acknowledge a separate *"this bundle contains plaintext secrets"* checkbox before the apply button activates, and bundles produced by a newer Hammoc version (`bundleVersion` greater than what the local server supports) are rejected outright with an upgrade hint.

The export/import flow only touches the workbench items themselves — `package.json`, repository code, and tracked files outside `.claude/` are never bundled. Bundles produced and consumed by the same Hammoc version are round-trip identical: re-importing your own export into an empty project reproduces the workbench cards byte-for-byte (handy for backups or for setting up a new dev machine).

### 12.16 BMad Settings (core-config Editor)

> Shown only for BMad projects (those with a `.bmad-core/` folder). For non-BMad projects this nav item is hidden entirely — no empty placeholder.

A form-based editor for BMad's `core-config.yaml`, so you can change BMad's paths and flags without opening a terminal or text editor. It is a top-level item in the project Settings left nav (a sibling of the Harness Workbench, not one of its sections).

Keys are organized into collapsible groups — **General**, **QA**, **PRD**, **Architecture**, and **Brownfield Epic** — and each value uses a widget matched to its type:

- **Toggle** for boolean flags (e.g., Markdown Exploder, PRD Sharded)
- **Path picker** for file/folder paths — a **Browse** button opens a file-tree dialog; paths are relative to the project root (e.g., Dev Story Location, QA Location)
- **Text** for plain strings (e.g., PRD Version, Slash Prefix)
- **Glob** with a live match preview that counts the files matching the pattern (e.g., Epic File Pattern)
- **Drag-sortable list** for path arrays (e.g., Dev Load Always Files, Custom Technical Documents)

Other behaviors:

- **Auto-save** — Text/path/glob edits debounce-save (~300 ms); toggles and list changes save immediately. Saves write `.bmad-core/core-config.yaml` while preserving comments and key order.
- **Raw YAML toggle** — A **Form / Raw** switch in the top-right lets you edit the file as raw YAML; switching back to Form preserves comments and ordering. A parse error keeps you in Raw mode until it is fixed.
- **Unknown Keys** — Keys the form doesn't recognize (for example, a newer BMad schema) are preserved and listed read-only in an "Unknown Keys" section at the bottom; edit them in Raw mode.
- **External-change banner** — If the file changes outside Hammoc while the panel is open, a banner with a **Reload** button appears.

After you change a path such as **Dev Story Location**, the BMad agents (e.g., `/dev`) pick up the new value on their next run.

### 12.17 Context Builder

The **Context Builder** automatically injects a block of context into every new chat session, so you don't have to re-explain "what was I working on" each time. It does this by generating a Claude Code **SessionStart hook** for you. Available on all projects.

You declare three kinds of content in the panel:

- **Reference files** — Project files that are read fresh and injected at each session start. Each file shows its byte size and an approximate token count. If the combined size nears the SessionStart output cap an amber warning appears; past the hard cap (red), the content spills to a file plus a preview instead of being injected inline, so trim the list when warned.
- **Dynamic variables** — Built-in values recomputed every session, each with an on/off toggle:
  - **Current branch** — the active git branch
  - **Active BMad story** — title and status of the most recently modified story file
  - **Recent commits** — the most recent commit subjects (count configurable)
  - **Today** — today's date
  - **Uncommitted files** — count of files with uncommitted changes
- **Custom commands** (advanced) — Arbitrary shell commands whose output is appended. Because these run automatically at every session start, each requires you to tick a confirmation checkbox ("I understand this command runs automatically at every session start"). Hammoc also flags commands that look like they contain a secret.

When you save, Hammoc generates a hook script under the project's `.hammoc/` folder and registers a SessionStart entry in `.claude/settings.json`. In the **Hooks** panel (§12.7) that entry is marked **"Hammoc Context Builder"**; editing it by hand there raises a sync-loss warning, since the Context Builder owns it — change it from this panel instead. The token-size hints reuse the same approximation as Observability (§12.18).

### 12.18 Observability

The **Observability** panel is the feedback loop for harness tuning: it shows which tools get called and how much of the context window each harness element consumes. Available on all projects.

**MCP / tool calls:**

- A **timeline** of recent tool calls (server, tool, response time, and success / failed / no-response status) and an **aggregate chart** of calls per server and per tool with average response time and error counts.
- **Filters** by server, tool, and time window (default: last 30 days).
- Only call **metadata** is recorded — server, tool, timestamp, argument and response **sizes**, and duration. Argument and response **bodies are never stored**, so file contents and secrets don't leak into the log.

**Token attribution:**

- A bar chart of how many tokens each harness element contributes — project and global `CLAUDE.md`, each skill's `SKILL.md`, and the Context Builder's injected block — with an overlay showing the total against the current model's context window.
- Inline hints show an **approximate** token count prefixed with `~` (a fast byte-based estimate), expressed two ways at once: as a percentage of the context window and as a share of the total harness prompt.
- An **Exact count** button calls Anthropic's official token-count API and caches the result by file content; if the call fails, the approximation is kept.

### 12.19 Plugin Marketplace

The **Marketplace** panel lets you discover Claude Code plugins from the marketplaces registered on your machine, complementing the install/toggle view in the Plugins panel (§12.4). Available on all projects.

- **Catalog** — One card per plugin parsed from each registered marketplace, showing name, description, version, author, category, a type badge (**Plugin** or **External MCP**), bundled-component counts, and an **Installed** badge when applicable.
- **Filter & search** — By name, category, type, and installed state.
- **Install / Uninstall guide** — Because Claude Code's plugin commands are interactive slash commands (not shell subcommands), the **Install** and **Uninstall** buttons open a dialog containing the exact command — e.g. `/plugin install <name>@<marketplace>` — with a **Copy** button. Paste it into your Claude CLI session to run it; plugin commands can't be executed from the Hammoc chat.
- **Add marketplace** — A form takes a marketplace URL and produces the matching `/plugin marketplace add <url>` command to copy.
- **Auto-refresh** — After you install or remove a plugin in your CLI session, Hammoc detects the on-disk change and updates both this catalog's **Installed** badges and the Plugins panel cards automatically.
- **Resilience** — If one marketplace's catalog file can't be read, only that marketplace shows an error badge and the rest still load. If the installed-plugins file is in an unrecognized format, a warning banner notes that installed state may be incomplete.

