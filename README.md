<p align="center">
  <img src="logo/Hammoc-Header.png" alt="Hammoc" width="480">
</p>

<p align="center">
  <strong>Kick Back. Tap. Ship.</strong><br>
  The web IDE built for AI-driven development workflows — starting with BMAD-METHOD.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/hammoc"><img src="https://img.shields.io/npm/v/hammoc" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/hammoc"><img src="https://img.shields.io/npm/dm/hammoc" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/starsh2001/hammoc" alt="license"></a>
</p>

<p align="center">
  <a href="docs/MANUAL.md"><strong>User Manual</strong></a> ·
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="#features"><strong>Features</strong></a>
</p>

---

## What is Hammoc?

Hammoc is a web IDE optimized for structured AI-driven development methodologies. It currently provides first-class support for the [BMAD-METHOD V4](https://github.com/bmad-code-org/BMAD-METHOD) workflow — with plans to support additional methodologies in the future.

Built on top of [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Hammoc provides everything you need to run a full BMAD workflow from your browser: agent switching, PRD-to-queue automation, epic/story tracking, and a Kanban board — all in one place. No terminal hopping, no context switching.

Fully responsive and mobile-first. Kick back in your hammock, tap a command on your phone, and let the AI ship it. Inspired by Rich Hickey's *Hammock Driven Development* — the idea that real breakthroughs come when you step back, not when you're grinding at the terminal.

---

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0 (v22 LTS recommended)
- **Claude Code CLI** installed and authenticated (`claude --version`)

### Install & Run

```bash
# Run directly (no install needed)
npx hammoc

# Or install globally
npm install -g hammoc
hammoc
```

Open http://localhost:3000 in your browser. First launch guides you through password setup and CLI verification.

### CLI Options

```
hammoc [options]

Options:
  --port <number>        Port to listen on (default: 3000, env: PORT)
  --host <string>        Host to bind to (default: 0.0.0.0, env: HOST)
  --trust-proxy          Enable reverse proxy support (env: TRUST_PROXY)
  --cors-origin <url>    Restrict CORS to specific origin (env: CORS_ORIGIN)
  --reset-password       Reset the admin password
  -h, --help             Show this help message
  -v, --version          Show version number
```

### Mobile Access

Fully responsive. Access from your phone or tablet at `http://<your-ip>:3000` on the same network.

### PWA (Progressive Web App)

Hammoc can be installed as a standalone app on your PC or mobile device.

- **PC (localhost):** Open `http://localhost:3000` in Chrome → click the install icon in the address bar. No extra setup needed.
- **Mobile (local network):** Requires HTTPS. See the [HTTPS Setup](#https-setup-for-mobile-pwa) section below.

> ⚠️ **Security Notice**
>
> Hammoc is designed for **local network / VPN use**. While it includes security hardening for external exposure (see [Remote Access](#remote-access) below), it has not undergone a formal security audit. For maximum safety, run behind a **trusted VPN** (e.g., Tailscale, WireGuard).

### Remote Access

If you need to expose Hammoc through a reverse proxy (Cloudflare Tunnel, nginx, etc.):

```bash
npx hammoc --trust-proxy --cors-origin https://hammoc.yourdomain.com
```

This enables:
- **Proxy header support** — Correctly identifies client IPs behind the proxy (CF-Connecting-IP, X-Forwarded-For, X-Real-IP) for localhost/local-network access checks
- **Secure cookies** — Session cookies are set with `Secure` flag for HTTPS
- **CORS restriction** — Only the specified origin can make authenticated requests

> Hammoc does not apply request rate limiting itself. Configure traffic shaping at your reverse proxy / WAF (e.g. nginx `limit_req`, Cloudflare WAF) — the layer that owns the real client IP and topology.

**Security features (always active):**
- Helmet.js security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
- Server management APIs restricted to loopback only (127.0.0.1)
- Terminal access restricted to local network IPs
- Login brute-force protection (5 failed attempts → 30s lockout per IP)
- IP validation with strict format checking and `net.isIP()` verification
- XFF spoofing protection (rightmost IP parsing)
- Debug endpoints disabled in production

---

## Features

### Why Hammoc?

| | Hammoc | Terminal-based IDE | Generic Web IDE |
|---|:---:|:---:|:---:|
| BMAD-METHOD workflow | **Built-in** | Manual | N/A |
| Agent switching (SM, PM, Dev, QA...) | **One tap** | CLI commands | N/A |
| PRD → Queue automation | **Auto-generate** | Copy-paste | N/A |
| Mobile development | **Full support** | Limited | Partial |
| Kanban + Epic tracking | **Integrated** | Separate tool | Separate tool |

### Chat Interface

Real-time conversations with Claude through a rich web UI.

- **Streaming responses** — Messages appear progressively as Claude generates them
- **Markdown rendering** — Full markdown support with syntax-highlighted code blocks, copy buttons, and inline HTML rendering
- **Image attachments** — Attach up to 5 images (PNG, JPEG, GIF, WebP) per message with thumbnail display
- **Tool call visualization** — See what tools Claude uses, with inputs, outputs, and execution time
- **Diff viewer** — Side-by-side file diff display for code changes
- **Extended thinking** — View Claude's reasoning process in collapsible blocks
- **Message edit** — Edit previous messages to branch the conversation into alternative paths
- **Summarize & Continue** — Compress long conversations with AI-generated summaries
- **Code rewind** — Restore project files to any earlier point in the conversation
- **Session fork** — Branch into a new session from any assistant response
- **Conversation branching** — Navigate between branches with pagination controls, and browse all branches in a read-only viewer
- **Prompt history** — Navigate previous inputs with arrow keys
- **Prompt chaining** — Queue up to 10 prompts for sequential execution (server-synced, multi-browser, drag-to-reorder)
- **Voice input** — Dictate messages using browser speech recognition (Chrome, Edge, Safari)
- **Context usage monitor** — Track token usage and cost in real-time, with auto-compact on context overflow (master switch in Settings)
- **Background task wait card** — When Claude runs background tasks, an amber card shows elapsed time and pending count with an optional Stop button
- **Abort generation** — Stop responses with the abort button or ESC key

### Session Management

- **Session list** — Browse past conversations with preview, message count, and date
- **Session search** — Search by name or conversation content (server-side)
- **Session renaming & deletion** — Keep conversations organized
- **Quick session panel** — Access sessions without leaving the chat
- **Active streaming indicator** — See which sessions are currently active
- **Pending question indicator** — Spot sessions awaiting user input at a glance

### Slash Commands, Snippets & Favorites

- **Command palette** — Type `/` to browse available commands with autocomplete
- **Prompt snippets** — Type `%` to insert reusable prompt templates with argument substitution, context blocks, and multi-prompt chaining
- **Snippet hierarchy** — Project, global, and bundled snippets with override support
- **Favorites bar** — Pin up to 20 frequently used commands above the input
- **Star favorites** — Mark up to 10 star commands for quick access
- **Drag-to-reorder** — Customize favorite command order
- **Agent-specific commands** — Context-aware commands per BMad agent

### Model & Permission Control

- **Model selector** — Choose between Claude Sonnet, Opus, Haiku, and Fable variants with the model name on the button, plus a **1M context** toggle (auto-on for Opus, opt-in for Sonnet and Fable)
- **Thinking effort** — Adjust reasoning intensity (Low / Medium / High, plus Max on 4.6 models and XHigh on Opus 4.7+ / Fable 5)
- **Permission modes** — Plan, Ask (default), Auto, or Bypass
- **Conversation engine** — Run chats through the Claude Agent SDK (API credits, Recommended) or the Claude Code CLI (subscription billing, Beta), switchable globally or per-project with side-by-side comparison
- **Per-project overrides** — Different settings per project

### Project Management

- **Project list** — Browse all projects with session counts and last activity
- **Project dashboard** — Real-time status: active chats, queue runners, terminals
- **Project creation** — Create new projects with a visual directory picker (Browse) and optional BMad Method initialization
- **Per-project Settings tab** — Each project carries its own Settings tab (model, permission, budget) plus the Harness Workbench (see below). No more switching to the global Settings page and picking a project from a dropdown
- **Hide/unhide projects** — Keep the list clean

### Harness Workbench

Edit the `.claude/` configuration tree from inside Hammoc — no need to hand-edit JSON or Markdown on disk.

- **Plugins, Skills, MCP, Hooks, Slash Commands, Sub-agents** — Card-grid panels for each, with project ↔ global copy actions and conflict dialogs
- **CLAUDE.md editor** — Two-column edit of project and global instruction documents with live Markdown preview
- **Snippets & Favorites** — Manage Hammoc `%snippets` (project / global / bundled) alongside Claude Code slash-command favorites in a single panel
- **Share badges + mode banner** — See at a glance which files are git-tracked vs local, so you know which edits will reach teammates
- **Static lint (7 rules)** — Surfaces duplicate names, invalid hook regex, missing env vars, malformed MCP URLs, non-standard agent tools, etc.; per-rule on/off preferences
- **Secret-on-shared guard** — Blocks plaintext API keys / tokens from sneaking into committed config files, with one-click "move to local sibling" remediation
- **Bundle Export / Import** — Pack the entire workbench (5 domains + `CLAUDE.md` + snippets) into a single `.zip` with a chosen secrets policy (exclude / env-ref placeholders / explicit with multi-layer guards), import on another machine with a per-item conflict preview — round-trip identical, ideal for Mode B projects where `.claude/` is git-ignored
- **Fullscreen editor overlay** — Maximize any body field (skill, command, agent, CLAUDE.md, snippet) into a fullscreen CodeMirror
- **BMad core-config editor** — Form-based editing of `.bmad-core/core-config.yaml` (paths, flags, sharding) for BMad projects, with a raw-YAML fallback
- **Context Builder** — Auto-injects reference files and dynamic variables (current branch, active story, recent commits…) into every new session via a generated SessionStart hook
- **Observability** — MCP/tool call timeline and aggregates, plus per-element token attribution against the model's context window
- **Plugin marketplace** — Browse plugins from registered marketplaces with copy-paste install/uninstall command guides

### File Explorer & Editor

- **Grid & List views** — Finder-style grid or traditional list layout
- **Tree navigation** — Directory hierarchy with breadcrumbs
- **Text editor** — Syntax highlighting with save (Ctrl+S) and binary file download
- **Markdown preview** — Toggle between edit and preview modes
- **Image viewer** — Full-screen viewer with zoom, fit-to-screen/width/height and 1:1 toggles, touch gestures (pinch, swipe, pan), and multi-image navigation across attachments or folder siblings
- **External change detection** — Editor alerts you when an open file is modified or deleted on disk, with reload / overwrite options for stale-write conflicts
- **File operations** — Create, rename, and delete files and folders

### Git Integration

- **Status panel** — Staged, unstaged, and untracked changes at a glance
- **Stage & commit** — Stage files individually or all at once, write commit messages
- **Branch management** — Create, switch, and view branches
- **Pull & Push** — Sync with remote repositories
- **Quick Git panel** — Lightweight Git access from the chat view
- **AI-assisted split-commit** — One-click chip delegates "split this messy working tree into logical commits" to Claude in a fresh session (available in both the full Git tab and the Quick Git panel)
- **Git environment detection** — Actionable UI when Git is not installed or authentication fails

### Terminal

- **PTY emulation** — Full terminal emulation powered by xterm.js with a touch-first input model: read-only viewport, dedicated input bar, quick-key buttons (arrows, Tab, Esc, Ctrl combos), and mobile touch selection with drag handles
- **CJK / IME support** — Korean, Japanese, and Chinese input via Input Method Editor with composition preview
- **Multiple tabs** — Run several terminal sessions simultaneously
- **Security** — Restricted to local network by default; configurable via settings

### Queue Runner (Batch Automation)

Automate repetitive prompt sequences.

- **Queue editor** — Write prompt sequences line by line, with a sticky line-number gutter
- **Special commands** — `@new`, `@save`, `@load`, `@pause`, `@model`, `@delay`, `@pauseword`, `@loop`/`@end`, `@label`/`@jumpif` (forward jumps), `@(/@)`, `#` comments
- **Execution control** — Start, pause (deferred), resume, abort, and edit remaining items while paused
- **Templates** — Save and load reusable queue scripts; ships a ready-to-use BMad story workflow template in the source repo
- **Story-based generation** — Auto-generate queue from PRD epics and stories
- **Variable substitution** — Use `{story_num}`, `{epic_num}`, `{story_index}`, `{story_title}`, `{date}` in templates

### Project Board (Issue Tracking)

- **Kanban board** — Visual cards across customizable status columns; issue cards show a `#N` prefix matching their `ISSUE-N.md` file
- **List view** — Tabular alternative with sorting and filtering
- **Issue types** — Bug, Improvement
- **Severity levels** — Low, Medium, High, Critical
- **Status workflow** — Open → Draft → Approved → In Progress → Blocked → Review → Done → Closed
- **Mobile Kanban** — Touch-optimized board for small screens

### Settings

- **Theme** — Dark, Light, or System
- **Language** — English, 中文, 日本語, 한국어, Español, Português
- **Chat timeout** — 1m, 3m, 5m (default), 10m, 30m
- **Web Push & Telegram notifications** — Get notified on permission requests, completions, and errors
- **Display name** — Set a preferred name for the agent to use when addressing you
- **Claude account & usage** — Inspect the linked Claude Code account plus 5h / 7d usage quotas with live refresh
- **System prompt editing** — Customize Claude's behavior per project
- **Advanced** — Server restart, software updates, SDK parameters (thinking tokens, turns, budget — now applied to both chat and queue runs)

---

## BMAD-METHOD V4 Integration

Hammoc is the most convenient way to run a full [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development) workflow. Every step — from project inception to QA — is built into the IDE.

- **One-click BMad setup** — Initialize `.bmad-core` in any project with version selection
- **BMad Agent switching** — Instantly switch between agents (SM, PM, Architect, Dev, QA, PO, etc.) in chat with a single tap
- **Slash commands per agent** — Context-aware `/commands` that change based on the active BMad agent
- **PRD → Queue automation** — Auto-generate prompt queues directly from your PRD epics and stories
- **Project overview dashboard** — Visual status showing PRD completion, epic progress, and story status
- **Kanban board integration** — Track epics and stories with status workflow, promote/validate actions
- **Story workflows** — Start development, request QA, and apply fixes — all through the board UI

> **Methodology support roadmap:** Hammoc is designed to be methodology-agnostic. BMAD-METHOD V4 is the first supported workflow, with more development methodologies planned for future releases.

For detailed BMAD-METHOD documentation, visit the [official repository](https://github.com/bmad-code-org/BMAD-METHOD).

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (desktop) |
| `Shift+Enter` | New line in message |
| `ESC` | Abort generation |
| `Ctrl+S` | Save file in editor |
| `Ctrl+=` `Ctrl+-` | Terminal font size |
| `Ctrl+0` | Reset terminal font size |
| `%` | Open snippet autocomplete palette |
| `↑` / `↓` | Navigate prompt history |
| `Alt+1/2/3/4` | Toggle quick panel (Sessions/Files/Git/Terminal) |

---

## Architecture

Hammoc is a monorepo with three packages:

```
hammoc/
├── bin/hammoc.js             # CLI entry point
├── packages/
│   ├── shared/                    # Shared types, constants, utilities
│   ├── server/                    # Express + Socket.io backend
│   └── client/                    # React + Vite frontend
└── scripts/
    └── postinstall.cjs            # Shared package linker
```

**Tech Stack:**
- **Frontend:** React 18, Vite, Tailwind CSS, Zustand, Socket.io Client, xterm.js
- **Backend:** Node.js, Express, Socket.io, node-pty, Claude Agent SDK
- **Shared:** TypeScript, Zod validation

---

## Development

```bash
git clone https://github.com/starsh2001/hammoc.git
cd hammoc
npm install
npm run dev
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in development mode |
| `npm run build` | Build all packages for production |
| `npm start` | Run server in production mode |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint on all packages |
| `npm run typecheck` | Run TypeScript type checking |

---

## Data Storage

| Data | Location |
|------|----------|
| App config & password | `~/.hammoc/config.json` |
| User preferences | `~/.hammoc/preferences.json` |
| Queue templates | `<project-root>/.hammoc/queue-templates.json` (per project) |
| Chain failures | `~/.hammoc/chain-failures/<sessionId>.json` (per session) |
| MCP call log & token cache | `~/.hammoc/observability/` (per project; 30-day retention) |
| Snippets (global) | `~/.hammoc/snippets/` (shared across projects) |
| Snippets (project) | `<project-root>/.hammoc/snippets/` (per project) |
| Harness items (global) | `~/.claude/` (skills, agents, commands, hooks, `CLAUDE.md`, `.mcp.json`, `settings.json`) |
| Harness items (project) | `<project-root>/.claude/` (same layout; project wins on conflict) |
| TLS certificates | `~/.hammoc/cert.pem`, `~/.hammoc/key.pem` |
| Manual shards (synced) | `~/.hammoc/docs/manual/` and `~/.hammoc/docs/.manual-version` (auto-synced from package on server boot) |
| Internals docs (synced) | `~/.hammoc/docs/internals/` (agent-only mechanism reference; also re-synced on package version change) |
| Session data | `~/.claude/projects/` (managed by Claude Code CLI) |

---

## HTTPS Setup (for Mobile PWA)

PWA installation on mobile devices requires HTTPS. Hammoc automatically starts in HTTPS mode when TLS certificates are found at `~/.hammoc/cert.pem` and `~/.hammoc/key.pem`. If no certificates are found, it falls back to HTTP.

### Option 1: mkcert (Recommended)

1. **Install mkcert:**

   ```bash
   # Windows
   winget install FiloSottile.mkcert

   # macOS
   brew install mkcert

   # Linux
   # See https://github.com/FiloSottile/mkcert#installation
   ```

2. **Create a local CA and generate certificates:**

   ```bash
   mkcert -install
   mkcert -key-file ~/.hammoc/key.pem -cert-file ~/.hammoc/cert.pem localhost 127.0.0.1 YOUR_LOCAL_IP
   ```

   Replace `YOUR_LOCAL_IP` with your PC's IP address (e.g., `192.168.0.10`).

3. **Install the root CA on your mobile device:**

   Find the CA certificate location:
   ```bash
   mkcert -CAROOT
   ```

   Transfer `rootCA.pem` to your mobile device, then:
   - **Android:** Settings → Security → Install certificate
   - **iOS:** Open the file → Install Profile → Settings → General → About → Certificate Trust Settings → Enable

4. **Start Hammoc** — it will automatically detect the certificates and start in HTTPS mode:

   ```
   Hammoc Server running on:
     Local:   https://localhost:3000
     Network: https://192.168.0.10:3000
     TLS:     enabled (certs from ~/.hammoc/)
   ```

5. **Open on mobile:** Navigate to `https://YOUR_LOCAL_IP:3000` and install the PWA.

### Option 2: Reverse Proxy

If you already have a reverse proxy (Nginx, Caddy, etc.) handling HTTPS, simply keep Hammoc running in HTTP mode (no certificates needed) and point your proxy to `http://localhost:3000`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | — | Set to `production` for optimized mode |
| `TRUST_PROXY` | `false` | Enable reverse proxy support (Cloudflare Tunnel, nginx, etc.) |
| `CORS_ORIGIN` | `true` | CORS origin (`true` allows any; set a URL to restrict) |
| `CHAT_TIMEOUT_MS` | `300000` | Chat response timeout (ms) |
| `LOG_LEVEL` | `INFO`/`DEBUG` | ERROR, WARN, INFO, DEBUG, VERBOSE |
| `TERMINAL_ENABLED` | `true` | Enable/disable terminal feature |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID for notifications |

---

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic — The AI coding assistant that powers Hammoc
- [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) by BMad Code — The agile AI-driven development methodology integrated into Hammoc
