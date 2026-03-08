# BMad Studio

A web-based IDE for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions, projects, and workflows. Built with seamless [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) integration for agile AI-driven development.

> **BMad Studio** turns Claude Code into a full-featured development environment — accessible from any browser, including mobile devices.

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0 (v22 LTS recommended)
- **Claude Code CLI** installed and authenticated (`claude --version`)

### Install & Run

```bash
# Option 1: Run directly (no install needed)
npx bmad-studio

# Option 2: Install globally
npm install -g bmad-studio
bmad-studio
```

Open http://localhost:3000 in your browser. On first launch, you'll be guided through password setup and CLI verification.

### CLI Options

```
bmad-studio [options]

Options:
  --port <number>   Port to listen on (default: 3000, env: PORT)
  --host <string>   Host to bind to (default: 0.0.0.0, env: HOST)
  --reset-password  Reset the admin password
  -h, --help        Show this help message
  -v, --version     Show version number
```

### Mobile Access

BMad Studio is fully responsive. Access it from your phone or tablet by navigating to `http://<your-ip>:3000` on the same network.

---

## Features

### Chat Interface

Real-time conversations with Claude through a rich web UI.

- **Streaming responses** — Messages appear progressively as Claude generates them
- **Markdown rendering** — Full markdown support with syntax-highlighted code blocks and copy buttons
- **Image attachments** — Attach up to 5 images (PNG, JPEG, GIF, WebP) per message
- **Tool call visualization** — See what tools Claude uses, with inputs, outputs, and execution time
- **Diff viewer** — Side-by-side file diff display for code changes
- **Extended thinking** — View Claude's reasoning process in collapsible blocks
- **Prompt history** — Navigate previous inputs with arrow keys
- **Prompt chaining** — Queue up to 5 prompts for sequential execution
- **Context usage monitor** — Track token usage and cost in real-time
- **Abort generation** — Stop responses with the abort button or ESC key

### Session Management

Organize and navigate conversations across projects.

- **Session list** — Browse past conversations with preview, message count, and date
- **Session search** — Search by name or conversation content (server-side)
- **Session renaming & deletion** — Keep conversations organized
- **Quick session panel** — Access sessions without leaving the chat
- **Active streaming indicator** — See which sessions are currently active
- **Confirm dialog** — Warns before switching away from an active session

### Slash Commands & Favorites

Speed up your workflow with command shortcuts.

- **Command palette** — Type `/` to browse available commands with autocomplete
- **Favorites bar** — Pin up to 20 frequently used commands above the input
- **Star favorites** — Mark up to 10 star commands for quick access
- **Drag-to-reorder** — Customize favorite command order
- **Agent-specific commands** — Context-aware commands per BMad agent

### Model & Permission Control

Fine-tune how Claude works on your projects.

- **Model selector** — Choose between Claude Sonnet, Opus, and Haiku variants
- **Permission modes** — Control file modification behavior:
  - **Plan** — Claude plans but doesn't execute
  - **Ask** — Asks for approval before changes (default)
  - **Auto** — Edits files automatically
  - **Bypass** — Full autonomy
- **Per-project overrides** — Different settings per project

### Project Management

Manage multiple Claude Code projects from one place.

- **Project list** — Browse all projects with session counts and last activity
- **Project dashboard** — Real-time status: active chats, queue runners, terminals
- **Project creation** — Create new projects with optional BMad Method initialization
- **Project settings** — Per-project model, permission, system prompt, and budget configuration
- **Hide/unhide projects** — Keep the list clean

### File Explorer & Editor

Browse and edit project files directly in the browser.

- **Grid & List views** — Finder-style grid or traditional list layout
- **Tree navigation** — Directory hierarchy with breadcrumbs
- **File search** — Quick search with filtering
- **Text editor** — Edit files with syntax highlighting and save (Ctrl+S)
- **Markdown preview** — Toggle between edit and preview modes
- **Image viewer** — Full-screen image viewing with zoom controls
- **File operations** — Create, rename, and delete files and folders
- **Hidden files toggle** — Show or hide dotfiles

### Git Integration

Full Git workflow without leaving the browser.

- **Status panel** — Staged, unstaged, and untracked changes at a glance
- **Stage & commit** — Stage files individually or all at once, write commit messages
- **Branch management** — Create, switch, and view branches
- **Commit history** — Browse recent commits with author and timestamp
- **Pull & Push** — Sync with remote repositories
- **Quick Git panel** — Lightweight Git access from the chat view

### Terminal

Web-based terminal access to your project directory.

- **PTY emulation** — Full terminal emulation powered by xterm.js
- **Multiple tabs** — Run several terminal sessions simultaneously
- **Font size controls** — Ctrl+/- to adjust, Ctrl+0 to reset
- **Security** — Restricted to local network by default; configurable via settings
- **Quick terminal** — Launch a terminal overlay from the chat view

### Queue Runner (Batch Automation)

Automate repetitive prompt sequences.

- **Queue editor** — Write prompt sequences line by line
- **Special commands** — `@newSession`, `@save`, `@load`, `@pause`, `@model`, `@wait`, `@multiline`, `@comment`
- **Execution control** — Start, pause, resume, and abort queue runs
- **Progress tracking** — Real-time progress display (current/total)
- **Templates** — Save and load reusable queue scripts
- **Story-based generation** — Auto-generate queue from PRD epics and stories
- **Variable substitution** — Use `{{variables}}` in templates
- **Session locking** — Prevents manual input during queue execution

### Project Board (Issue Tracking)

Visual task management for your projects.

- **Kanban board** — Drag-and-drop cards across customizable columns
- **List view** — Tabular alternative with sorting and filtering
- **Issue types** — Bug, Improvement, Quick Action
- **Severity levels** — Low, Medium, High, Critical
- **Status workflow** — Open → Draft → Approved → In Progress → Blocked → Review → Done → Closed
- **File attachments** — Up to 10 files per issue (images supported)
- **Issue promotion** — Promote issues to stories, stories to epics
- **Board configuration** — Customize columns, status mapping, and colors
- **Mobile Kanban** — Touch-optimized board for small screens

### Settings

Customize every aspect of BMad Studio.

- **Theme** — Dark, Light, or System
- **Language** — English, 中文, 日本語, 한국어, Español, Português
- **Chat timeout** — 1m, 3m, 5m (default), 10m, 30m
- **Telegram notifications** — Get notified on permission requests, completions, and errors
- **System prompt editing** — Customize Claude's behavior per project
- **Advanced** — Server restart, software updates, terminal toggle, reset all settings
- **About** — Version, server status, and project links (auto-populated from package metadata)

---

## BMAD-METHOD Integration

BMad Studio provides first-class support for the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development) workflow.

### What is BMAD-METHOD?

BMAD-METHOD is an open-source framework for structuring AI-driven software development. It defines agents (SM, PM, Architect, Developer, QA), documents (PRD, Architecture, Stories), and workflows that guide Claude through a complete development lifecycle.

### How BMad Studio Integrates

- **One-click BMad setup** — Initialize `.bmad-core` in any project with version selection
- **BMad Agent button** — Quick-switch between agents (SM, PM, Dev, QA, etc.) in chat
- **Project overview** — Visual dashboard showing PRD completion, epic progress, and story status
- **Queue templates from PRD** — Auto-generate prompt queues from your epics and stories
- **Board integration** — Track epics and stories on the Kanban board with promote/validate workflows
- **Story workflows** — Start development, request QA, and apply fixes through the board UI

### Getting Started with BMAD-METHOD

1. Create a new project in BMad Studio
2. Click **"Setup BMad"** on the project overview page
3. Select the BMAD-METHOD version to install
4. Use the **Agent button** in chat to start with the SM (Scrum Master) or PM agent
5. Follow the BMAD workflow: PRD → Architecture → Stories → Development → QA

For detailed BMAD-METHOD documentation, visit the [official repository](https://github.com/bmad-code-org/BMAD-METHOD).

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (desktop) |
| `Shift+Enter` | New line in message |
| `ESC` | Abort generation |
| `Ctrl+S` | Save file in editor |
| `Ctrl+/` `Ctrl+-` | Terminal font size |
| `Ctrl+0` | Reset terminal font size |
| `↑` / `↓` | Navigate prompt history |

---

## Architecture

BMad Studio is a monorepo with three packages:

```
bmad-studio/
├── bin/bmad-studio.js             # CLI entry point
├── packages/
│   ├── shared/                    # Shared types, constants, utilities
│   │   └── src/
│   ├── server/                    # Express + Socket.io backend
│   │   └── src/
│   │       ├── controllers/       # Request handlers
│   │       ├── services/          # Business logic
│   │       ├── routes/            # API route definitions
│   │       ├── handlers/          # WebSocket event handlers
│   │       └── middleware/        # Auth, i18n, rate limiting
│   └── client/                    # React + Vite frontend
│       └── src/
│           ├── components/        # UI components
│           ├── pages/             # Route pages
│           ├── stores/            # Zustand state management
│           ├── hooks/             # Custom React hooks
│           └── i18n/              # Translations (6 languages)
└── scripts/
    └── postinstall.cjs            # Shared package linker
```

**Tech Stack:**
- **Frontend:** React 18, Vite, Tailwind CSS, Zustand, Socket.io Client, xterm.js, Monaco Editor
- **Backend:** Node.js, Express, Socket.io, node-pty, Claude Agent SDK
- **Shared:** TypeScript, Zod validation

---

## Development

### Setup

```bash
git clone https://github.com/starsh2001/bmad-studio.git
cd bmad-studio
npm install
```

### Development Mode

```bash
npm run dev
```

- Server: http://localhost:3000
- Client: http://localhost:5173 (with HMR)

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in development mode |
| `npm run build` | Build all packages for production |
| `npm start` | Run server in production mode |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint on all packages |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |

---

## Data Storage

BMad Studio stores data in the following locations:

| Data | Location |
|------|----------|
| App config & password | `~/.bmad-studio/config.json` |
| User preferences | `~/.bmad-studio/preferences.json` |
| Queue templates | `~/.bmad-studio/queue-templates.json` |
| Session data | `~/.claude/projects/` (managed by Claude Code CLI) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | — | Set to `production` for optimized mode |
| `CHAT_TIMEOUT_MS` | `300000` | Chat response timeout (ms) |
| `TERMINAL_ENABLED` | `true` | Enable/disable terminal feature |
| `MAX_TERMINAL_SESSIONS` | `10` | Maximum concurrent terminal sessions |
| `LOG_LEVEL` | `INFO`/`DEBUG` | Logging: ERROR, WARN, INFO, DEBUG, VERBOSE |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID for notifications |

---

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic — The AI coding assistant that powers BMad Studio
- [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) by BMad Code — The agile AI-driven development methodology integrated into BMad Studio
