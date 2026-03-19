# Hammoc User Manual

Complete guide to every feature in Hammoc.

**Table of Contents**

1. [Getting Started](#1-getting-started)
2. [Chat](#2-chat)
3. [Sessions](#3-sessions)
4. [Slash Commands & Favorites](#4-slash-commands--favorites)
5. [Projects](#5-projects)
6. [File Explorer & Editor](#6-file-explorer--editor)
7. [Git](#7-git)
8. [Terminal](#8-terminal)
9. [Queue Runner](#9-queue-runner)
10. [Project Board](#10-project-board)
11. [BMAD-METHOD Integration](#11-bmad-method-integration)
12. [Settings](#12-settings)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Environment Variables](#14-environment-variables)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Getting Started

### 1.1 Installation

**Option A: Run with npx (no install)**

```bash
npx hammoc
```

**Option B: Global install**

```bash
npm install -g hammoc
hammoc
```

**Option C: From source (development)**

```bash
git clone https://github.com/starsh2001/hammoc.git
cd hammoc
npm install
npm run dev
```

### 1.2 System Requirements

- **Node.js** >= 18.0.0 (v22 LTS recommended)
- **Claude Code CLI** installed and authenticated
- Modern browser (Chrome, Firefox, Safari, Edge)

### 1.3 First Launch

1. Open http://localhost:3000 in your browser
2. **Password Setup**: Set an admin password on first visit. This protects your instance from unauthorized access.
3. **Login**: Enter your password to sign in. **"Stay signed in"** keeps you logged in for 30 days (checked by default). After 5 failed attempts, login is locked for 30 seconds with a countdown timer.
4. **CLI Verification**: The onboarding wizard checks that Claude Code CLI is installed and authenticated. Follow the prompts if any step fails.
5. **Project Selection**: Choose an existing Claude Code project or create a new one.

### 1.4 Mobile Access

Hammoc is fully responsive. From any device on the same network:

```
http://<your-computer-ip>:3000
```

- Desktop: Enter sends message, Shift+Enter for new line
- Mobile (touch devices): Enter adds new line, tap the send button to send
- **Pull-to-refresh**: Swipe down on the session list to refresh (80px threshold)

### 1.5 CLI Options

```bash
hammoc --port 8080          # Custom port
hammoc --host localhost     # Bind to localhost only
hammoc --trust-proxy        # Enable reverse proxy support
hammoc --cors-origin <url>  # Restrict CORS to specific origin
hammoc --rate-limit 1000    # Requests per minute per IP
hammoc --reset-password     # Reset admin password
hammoc --version            # Show version
hammoc --help               # Show help
```

All options are also available as environment variables (see [Environment Variables](#14-environment-variables)).

### 1.6 Remote Access (Reverse Proxy)

If you need to expose Hammoc through a reverse proxy (Cloudflare Tunnel, nginx, etc.), use `--trust-proxy` and `--cors-origin`:

```bash
npx hammoc --trust-proxy --cors-origin https://hammoc.yourdomain.com
```

**What `--trust-proxy` enables:**
- Reads real client IP from proxy headers (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`)
- Sets session cookies with `Secure` flag (HTTPS-only)
- Enables Express `trust proxy` for correct protocol detection

**What `--cors-origin` does:**
- Restricts cross-origin requests to the specified URL only
- Without it, any website can make authenticated requests to your Hammoc instance

**Security features (always active, no configuration needed):**
- Helmet.js security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
- Server management APIs (restart, update) restricted to loopback only (127.0.0.1)
- Terminal access restricted to local network IPs
- Rate limiting (200 req/min/IP by default, adjustable via `--rate-limit`)
- Strict IP validation with spoofing protection (rightmost XFF parsing)
- Debug endpoints disabled in production

> **Note:** For multi-hop proxy setups (CDN → Load Balancer → nginx → Hammoc), increase the rate limit with `--rate-limit 1000` since multiple users may share the same proxy IP.

### 1.7 HTTPS / TLS

Hammoc automatically enables HTTPS when TLS certificates are found:

1. Place your certificate files in the `~/.hammoc/` directory:
   - `~/.hammoc/key.pem` — Private key
   - `~/.hammoc/cert.pem` — Certificate (or full chain)
2. Restart Hammoc — it will detect the files and start an HTTPS server
3. The startup log will show `TLS: enabled (certs from ~/.hammoc/)`

If no certificates are found, the server runs over HTTP as usual.

> **Tip:** For local development, you can generate self-signed certificates with `mkcert` or `openssl`. For production, use certificates from Let's Encrypt or your domain provider.

---

## 2. Chat

The chat interface is the core of Hammoc. It provides a rich, real-time conversation experience with Claude.

### 2.1 Sending Messages

- Type your message in the input area at the bottom
- **Desktop**: Press `Enter` to send, `Shift+Enter` for a new line
- **Mobile**: Press `Enter` for a new line, tap the send button to send
- The input area auto-expands up to 5 lines, then scrolls

### 2.2 Streaming Responses

Claude's responses stream in real-time, character by character. You'll see:

- **Text content** — Rendered as markdown as it arrives
- **Tool calls** — Shown as expandable cards with tool name, inputs, and results
- **Thinking blocks** — Claude's extended reasoning displayed in collapsible sections
- **Timestamps** — Each message shows a relative timestamp (e.g., "2 hours ago")
- **Copy button** — Click the copy icon on any message to copy its content to the clipboard
- **Scroll to bottom** — When scrolled up, a down-arrow button appears to jump back to the latest message

### 2.3 Markdown & Code Blocks

Messages support full GitHub-flavored markdown:

- Headers, bold, italic, strikethrough
- Ordered and unordered lists
- Tables
- Blockquotes
- Links (open in new tab)
- Inline code and fenced code blocks

**Code blocks** have:
- Language-specific syntax highlighting
- Copy button (top-right corner)
- File reference links that open directly in the editor

### 2.4 Image Attachments

Attach images to your messages for Claude to analyze:

- Click the attachment button (paperclip icon) in the input area
- Drag and drop images directly onto the input area
- Paste from clipboard (`Ctrl+V` / `Cmd+V`)
- Supported formats: PNG, JPEG, GIF, WebP
- Maximum: 5 images per message, 10MB per image
- Images preview in the input area before sending

### 2.5 Tool Call Visualization

When Claude uses tools (reading files, editing code, running commands), each tool call is shown as a card:

- **Tool name** — e.g., Read, Edit, Bash, Grep
- **Input parameters** — What was passed to the tool
- **Status indicator** — Running (spinner), completed (checkmark), failed (X), denied (shield icon)
- **Execution time** — How long the tool took
- **Result** — Expandable section showing tool output
- **File paths** — Toggle between short and full path display

### 2.6 Task Notifications

When Claude runs background tasks (e.g., Agent sub-tasks), a notification card appears in the message stream upon completion:

- **Status indicators** — Completed (green checkmark), Failed (red alert), Stopped (bell icon)
- **Summary text** — Brief description of the task outcome
- **Clickable** — When linked to a tool call, clicking the card scrolls to the associated Agent tool card and highlights it briefly

### 2.7 Diff Viewer

When Claude modifies files, a diff viewer shows the changes:

- **Side-by-side mode** — Before and after comparison (wide screens)
- **Inline mode** — Unified diff view (narrow screens or mobile)
- **Syntax highlighting** — Language-aware coloring
- **Diff navigation** — `F7` next change, `Shift+F7` previous change
- **Large file handling** — Files over 5,000 lines are handled with optimized rendering
- **Responsive layout** — Automatically switches between side-by-side and inline modes
- Powered by CodeMirror 6 merge view

### 2.8 Permission Requests

Depending on your permission mode, Claude may ask for approval before modifying files:

- **Approve** — Allow the change
- **Reject** — Block the change
- View the diff before deciding
- See the list of requested permissions

### 2.9 Prompt Chaining

Queue multiple prompts for sequential execution. Chain state is managed **server-side**, enabling multi-browser sync and background execution.

1. Toggle **chain mode** ON via the chain button (link icon next to send) or hold `Ctrl`
2. Type your first prompt and send it — the send button label changes to **"Add to chain"**
3. While Claude is responding, type the next prompt and send — it enters the chain
4. Up to **10** prompts can be queued
5. A **violet banner** shows the chain status:
   - **Collapsed mode** — First prompt preview + "+N" count indicator
   - **Expanded mode** — Full list with individual **Remove** buttons (click to expand when 2+ items)
   - **Cancel all** — Clear the entire chain
6. Each prompt auto-executes when the previous one completes (1-second delay between items)

**Server-side features:**
- **Multi-browser sync** — Chain state is synchronized across all browser tabs/windows via WebSocket
- **Background execution** — Chain continues running even if all browsers are closed
- **Auto-retry** — Failed items are retried up to 3 times before being marked as failed
- **Failure persistence** — Failed chain items are saved to disk and survive server restarts
- **Per-item context** — Each chain item preserves its own working directory, permission mode, and model selection

### 2.10 Context Usage

Monitor token usage in real-time:

- **Usage donut** — Visual indicator showing used/limit tokens and percentage
- **Cost display** — Estimated cost for the session
- **Cache tokens** — Cache creation and read token counts
- **Rate limit dots** — 5h/7d utilization indicators in the input area
- **Color thresholds** — Green (normal), Yellow (≥50%), Red (≥80%)
- **Context compaction** — Click the usage donut to trigger compaction, which summarizes the conversation to free up context space. When usage exceeds 90% (critical), clicking instead creates a new session

### 2.11 Aborting Responses

Stop Claude mid-response:

- Click the **Stop** button (appears during streaming)
- Press `ESC` key
- Press `Ctrl+C` (when no text is selected in the input)

### 2.12 Prompt History

Navigate through your previous inputs:

- Press `↑` (Up arrow) to recall the previous prompt
- Press `↓` (Down arrow) to go forward
- History is per-session

### 2.13 Voice Input (Speech Recognition)

Dictate messages using your browser's built-in speech recognition:

- **Microphone button** — Located inside the chat input area (right side). Only shown when the browser supports the Web Speech API (Chrome, Edge, Safari)
- **Toggle** — Click the mic button to start/stop listening
- **Visual indicator** — Green pulsing ring animation while actively listening
- **Language-aware** — Automatically matches the app's language setting (English, Korean, Chinese, Japanese, Spanish, Portuguese)
- **Transcript appending** — Recognized text is appended to the current input (does not replace existing text)
- **Auto-stop** — Voice recognition stops automatically when sending a message or when the session becomes locked
- **Error handling** — Toast notification shown if microphone access is denied or recognition fails

### 2.14 Extended Thinking

When Claude uses extended thinking, the reasoning is shown in a collapsible block:

- Click to expand/collapse
- Thinking content is visually distinct from the main response
- Useful for understanding Claude's decision-making process

---

## 3. Sessions

### 3.1 Session List

Access the session list via the sidebar or quick panel:

- **Preview** — First prompt of each session
- **Session name badge** — Custom name shown as a blue badge (if renamed)
- **Agent badge** — Active BMad agent shown as a purple badge (if set)
- **Session ID** — Truncated monospace identifier
- **Message count** — Number of messages in the session
- **Date** — When the session was last active
- **Streaming indicator** — Green dot with animation when streaming
- **Queue badge** — Shown when queue runner is active on the session
- Empty sessions are hidden by default (toggle with the eye icon)

### 3.2 Creating a New Session

- Click the **New Session** button in the header
- Each session gets a unique ID

### 3.3 Session Search

Two distinct search modes:

- **By name/ID** — Quick client-side filtering of the session list by name or session ID
- **By content** — Toggle "Search content" to search through actual conversation messages (server-side, slower but thorough)
- Matching sessions are filtered and displayed in the list
- "Load more" pagination for large result sets

### 3.4 Session Operations

- **Rename** — Click the edit icon next to the session name
- **Delete** — Remove a session (with confirmation)
- **Selection mode** — Select multiple sessions for batch delete
- **Delete empty sessions** — Bulk-delete all empty sessions at once

### 3.5 Quick Session Panel

Access sessions without leaving the chat:

- Open the quick panel (sidebar tab)
- Switch between sessions instantly
- See session previews and status

---

## 4. Slash Commands & Favorites

### 4.1 Command Palette

Type `/` in the chat input to open the command palette:

- Browse available commands grouped by category (Agents, Tasks, Skills, Commands)
- Filter by typing: `/test` shows commands containing "test"
- Commands are project-specific — loaded from the project's configured agents and tasks
- Navigate with **ArrowUp/Down**, close with **Escape**
- Press **Enter** or click to insert the selected command

### 4.2 Star Command Palette

Type `*` in the chat input to open the star command palette (requires an active agent):

- Shows commands specific to the currently active agent
- Filter by typing: `*create` filters matching commands
- Navigate with **ArrowUp/Down**, close with **Escape**
- Press **Enter** or click to insert — placeholders like `{name}` are auto-selected
- Add to star favorites by clicking the star icon on any command

### 4.3 Favorites

Pin your most-used slash commands for quick access:

- **Favorites bar** — Appears above the chat input (hidden when empty)
- Hold up to **20 favorites**
- Click a favorite chip to instantly insert it
- **Add**: Click the star icon on any command in the slash command palette
- **Remove**: Open the favorites popup and click the X button
- **Reorder**: Open the favorites popup and drag to rearrange
- Disabled during queue runner execution

### 4.4 Star Favorites

Mark up to **10 star favorites** per agent for even quicker access:

- Star favorites appear with a yellow indicator and `*` prefix
- They are prioritized at the top of the favorites bar, before slash favorites
- **Add**: Click the star icon on any command in the star command palette (`*`)
- **Remove**: Open the favorites popup and click the X button

### 4.5 Favorite Management

Click the star button (★) on the favorites bar to open the management popup:

- **Two sections**: "Agent Command" (star favorites) and "Slash Command" (slash favorites), separated by a divider
- Remove favorites with the X button
- Drag to reorder within each section
- Click a command to insert it into the chat input

---

## 5. Projects

### 5.1 Project List

The project list page shows all your Claude Code projects in a responsive grid (1–4 columns):

Each project card displays:

- **Project name** — Derived from the directory name
- **Path** — Full project directory path
- **Session count** — Number of chat sessions
- **Last modified** — When the project was last active
- **BMad badge** — Indicates BMAD-METHOD enabled projects
- **Status indicators** — Active sessions (green dot), queue status badge, terminal count (real-time via WebSocket)

Each card has a **kebab menu** (⋮) with:

- **Setup BMad** — Initialize BMAD-METHOD on non-BMad projects (with version selection)
- **Hide / Unhide** — Toggle project visibility
- **Delete** — Remove the project

**Dashboard summary bar** appears at the top when projects exist, showing aggregate stats: Projects, Sessions, Active, Queue, Terminals.

### 5.2 Creating a New Project

1. Click **"New Project"** on the project list page
2. Enter the project directory path
3. The path is validated on blur (must exist, must be a valid directory)
4. If the path already belongs to an existing project, a warning with "Navigate to existing" link appears
5. Optionally enable BMad Method initialization with version selection
6. Rate limited: 10 creations per minute

### 5.3 Project Settings

Configure per-project overrides (accessible from the Settings page):

- **Default model** — Override the global model selection
- **Permission mode** — Override the global permission mode (Plan, Ask before edits, Edit automatically). Note: Bypass permissions is not available at project level
- **Hidden toggle** — Hide the project from the project list
- **Reset to Global Defaults** — Remove all overrides at once

### 5.4 Hiding Projects

- Hide projects from the kebab menu or project settings
- Hidden projects appear with reduced opacity when visible
- Toggle "Show hidden" (eye icon in header) to reveal them
- Hiding doesn't delete any data

### 5.5 Project Overview Page

Clicking a project card opens the Overview tab:

- **Stats cards** — Three cards showing Total Sessions, Total Messages, and Active Sessions
- **Recent Sessions** — Last 5 sessions with streaming indicators, session name badges, and message counts. Click to navigate directly to the session
- **Quick Start** — Buttons for New Session, Queue Runner, and File Explorer
- **Active streaming banner** — Green banner shown when sessions are actively streaming, with animated pulse indicator

For BMad projects, additional sections appear above this standard overview (see §11.4).

### 5.6 Deleting Projects

- Delete removes the project from Hammoc's list
- Optionally check **"Delete project files"** to also remove the directory on disk
- Confirmation dialog prevents accidental deletion

---

## 6. File Explorer & Editor

### 6.1 File Explorer

Access the file explorer from the sidebar tab. Toggle between views with the toolbar button:

**Grid View (Finder-style, default)**
- Icon-based card display with folder/file icons
- Click folders to navigate in, click files to open
- ".." entry to navigate to parent directory
- Breadcrumb navigation at the top

**List View (hierarchical tree)**
- Recursive tree with expand/collapse chevrons
- Lazy-loaded subdirectories
- Sorted by type (folders first) then by name
- Keyboard navigation: ArrowUp/Down/Left/Right, Enter, Home/End

**Context Menu** (right-click or ⋮ button on hover)
- **New File** / **New Folder** — Creates via inline input
- **Copy** / **Cut** / **Paste** — Copy or move files and folders within the project
- **Download** — Download individual files (files only)
- **Rename** — Inline renaming
- **Delete** — With confirmation dialog

**File Upload**
- Drag and drop files from your OS into the Grid view to upload them
- Paste files from clipboard (`Ctrl+V`) while the file explorer is focused

**Toolbar**
- **Search** — Server-side file search with debounce (300ms)
- **Hidden files** — Toggle visibility of ignored patterns (`.git`, `node_modules`, `.env`, `dist`, etc.)
- **View toggle** — Switch between Grid and List views
- Default view mode configurable in settings

### 6.2 Text Editor

Click any text file to open it in a fullscreen overlay editor (CodeMirror):

- **Syntax highlighting** — Language-aware (detected from file extension)
- **Line numbers** and **active line highlighting**
- **Save** — `Ctrl+S` / `Cmd+S` or the save button
- **Close** — `Escape` key or the X button
- **Unsaved changes warning** — Confirmation dialog prevents accidental data loss
- **File size limit** — Files over 1MB are truncated and read-only

### 6.3 Markdown Preview

For `.md` files:

- Toggle between **Edit** and **Preview** modes via the header button
- Preview renders full markdown with styles
- Default mode (Edit or Preview) configurable in settings

### 6.4 Image Viewer

Click any image file to open the viewer in a fullscreen overlay:

- **Zoom in/out** — Button controls or mouse wheel scroll
- **Drag to pan** — Click and drag to move the image
- **Zoom percentage** — Displayed between zoom buttons
- **Reset view** — Return to original size and position
- **Close** — `Escape` key or the X button
- Supports PNG, JPEG, GIF, WebP, SVG, BMP, ICO

### 6.5 Quick File Panel

Access files without leaving the chat:

- Open the quick panel and switch to the Files tab
- **Recently opened** files appear at the top (max 5 per session)
- Search and navigate the file tree
- Click to open in the editor overlay

---

## 7. Git

### 7.1 Git Status

The Git tab shows the current repository state with auto-polling every 30 seconds:

- **Top bar** — Branch selector dropdown + Pull/Push buttons
- **File groups** — Three collapsible sections (chevron toggle), each with file count badge:
  - **Staged Changes** — Files ready to commit (status indicators: M green, A green, D red, R blue)
  - **Unstaged Changes** — Modified files not yet staged (status indicators: M yellow, D red)
  - **Untracked Files** — New files not tracked by Git (status indicator: ?)
- **File click** — Clicking a file name opens the Diff viewer slide panel (see 7.8)
- **Error banner** — Git errors appear at the top and auto-clear after 5 seconds; dismiss manually with X
- **Clean state** — When no changes exist, a green checkmark with "No changes" message is shown

### 7.2 Staging Files

- **Stage individual files** — Click the "+" button next to each file (appears on hover)
- **Stage all** — Click "+ All" in the group header to stage all files in that group
- **Unstage individual** — Click the "-" button on staged files (appears on hover)
- **Unstage all** — Click "- All" in the Staged Changes group header

### 7.3 Committing

1. Stage the files you want to commit
2. Write a commit message in the textarea
3. Click **"Commit"** (enabled only when staged files exist and message is non-empty)
4. The commit history refreshes automatically after a successful commit

> **Note:** "Stage All & Commit" is available only in the Quick Git Panel (see 7.7). The full Git tab requires staging first, then committing separately.

### 7.4 Branch Management

- **Branch selector** — Dropdown button in the top bar showing the current branch
- **Branch list** — All local branches displayed; current branch highlighted with a blue checkmark
- **Create branch** — Input field at the bottom of the dropdown; press Enter to create
- **Switch branch** — Click on a branch name to switch
- **Uncommitted changes warning** — If there are staged, unstaged, or untracked files, a ConfirmModal asks for confirmation before switching
- **Keyboard navigation** — ArrowUp/Down to navigate, Enter to select, Escape to close dropdown

### 7.5 Commit History

- Browse recent commits (up to 20 in the full tab):
  - Short commit hash (7 characters, monospace, blue)
  - Commit message
  - Author name
  - Relative timestamp (e.g., "2 hours ago", "3 days ago")

### 7.6 Pull & Push

- **Pull** — Fetch and merge remote changes (↓ arrow button)
- **Push** — Upload local commits to remote (↑ arrow button)
- **Ahead/Behind counts** — Each button shows the number of commits ahead or behind the remote
- Errors displayed in the error banner (auto-clears after 5 seconds)

### 7.7 Quick Git Panel

Lightweight Git access from the quick panel side bar:

- **Branch name** with changed file count badge (e.g., "3 changes")
- **Commit input** — Textarea for commit message
- **"Stage All & Commit"** — Single green button that automatically stages all unstaged/untracked files and commits in one action
- **Success message** — Displayed for 3 seconds after a successful commit
- **Recent commits** — Shows only the 3 most recent commits (hash, timestamp, message)
- **"View in Git Tab"** link — Navigates to the full Git tab for advanced operations
- **Git init support** — If the project is not a Git repository, shows an init button

### 7.8 Diff Viewer

- Clicking a file in the Git tab opens a **slide panel** from the right side (600px wide, max 80vw)
- Shows the unified diff for the selected file using CodeMirror
- **Close** — Click X button, click the backdrop, or press Escape
- Animated slide-in/out transition (300ms)

### 7.9 Git Repository Initialization

If the project directory is not a Git repository:

- **Git tab** — Shows a centered "Initialize Repository" view with a purple Git icon and init button
- **Quick Git panel** — Shows a message and init button
- After initialization, the Git status refreshes automatically

---

## 8. Terminal

### 8.1 Web Terminal

Full terminal access in your browser:

- **Shell emulation** — Real PTY (pseudo-terminal) connection via Socket.io
- **Working directory** — Opens in your project directory
- Supports all shell commands, interactive programs, and TUI apps
- Powered by **xterm.js** with FitAddon for auto-resize (ResizeObserver)
- **Theme** — Automatically matches app theme (dark/light), Tokyo Night color palette
- **Font** — JetBrains Mono, Fira Code, Cascadia Code (fallback chain)
- **Scrollback** — 1000 lines

### 8.2 Multiple Tabs

- Click **"New Terminal"** button (+ icon) in the header to open a new terminal tab
- **Maximum 5 terminals** per project (client-side limit); button disabled at limit
- **Tab labels** — Named after shell (e.g., "bash", "zsh"); numbered when multiple share the same shell ("bash 1", "bash 2")
- **Switch tabs** — Click on a tab label or use **ArrowLeft/ArrowRight** keyboard navigation
- **Close tabs** — Click the X button on each tab, or press **Delete** to close the active tab
- **Empty state** — When no terminals exist, a centered prompt with "New Terminal" button is shown

### 8.3 Font Size

Font size controls are available both via keyboard shortcuts and GUI buttons in the header:

- **GUI controls** — Minus (-), current size display (click to reset), Plus (+) buttons in the header
- `Ctrl+=` / `Ctrl++` — Increase font size
- `Ctrl+-` — Decrease font size
- `Ctrl+0` — Reset to default size (14)
- Range: 8 to 24

### 8.4 Connection Status

The header shows the current terminal status:

- **Connecting** — Spinner with "Connecting..." text
- **Connected** — Green dot indicator with "Connected" text
- **Disconnected** — Red dot badge; fullscreen overlay with "Disconnected" message
- **Exited** — Gray dot badge with exit code; fullscreen overlay with exit code display

### 8.5 Security

Terminal access is restricted for safety:

- **Local network only** — Blocked when accessed from outside the local/private network (RFC1918 IP detection). When behind a reverse proxy with `TRUST_PROXY=true`, real client IPs are extracted from proxy headers
- **Server management restricted to loopback** — Server restart/update APIs only accept connections from `127.0.0.1` / `::1` (stricter than terminal access)
- **Shield warning** — When access is denied, a ShieldAlert icon with explanation is shown (both in full tab and quick panel)
- **Configurable** — Enable/disable via the `TERMINAL_ENABLED` environment variable (set `false` to disable)
- **Max sessions** — Server-side limit (default: 10) via `MAX_TERMINAL_SESSIONS`; client limits to 5 per project
- **Session persistence** — Terminal sessions survive browser refreshes and temporary network interruptions. Sessions persist until explicitly closed by the user, the PTY process exits, or the server shuts down

### 8.6 Quick Terminal

Lightweight terminal access from the quick panel side bar:

- **Multi-terminal support** — Same tab management as the full Terminal tab (create, switch, close, max 5)
- **Font size controls** — Minus, size display (click to reset), Plus buttons in the header
- **"Open in Tab"** link — Navigate to the full Terminal tab
- **Tab keyboard navigation** — ArrowLeft/Right to switch, Delete to close
- **Security warning** — Same ShieldAlert display when terminal access is denied

---

## 9. Queue Runner

The Queue Runner automates sequences of prompts for batch processing.

### 9.1 Queue Editor

The editor provides a monospace code area with **syntax highlighting**:

- **Directives** (`@new`, `@pause`, etc.) — purple
- **Directive arguments** — teal
- **Multiline markers** (`@(`, `@)`) — blue
- **Comments** (`#`) — gray
- **Regular prompts** — default text color

**Toolbar buttons:**
- **Run** (Play icon) — Start queue execution; also available via `Ctrl+Enter` / `Cmd+Enter`
- **Load File** (Upload icon) — Import a `.txt` or `.qlaude-queue` file (max 1MB)
- **Template** (FileText icon) — Open the template dialog (see 9.7)
- **Word Wrap** (WrapText icon) — Toggle line wrapping (persisted across sessions)

**Editor behavior:**
- Auto-parses script on edit with 300ms debounce
- **Validation warnings** displayed below the editor (e.g., missing arguments, unclosed multiline blocks, unknown directives)
- **Empty state** shows a visual command reference overlay listing all available directives
- Editor is hidden during queue execution, replaced by the runner panel

Each line is one prompt. Special commands start with `@`. Empty lines are ignored.

### 9.2 Special Commands

| Command | Description |
|---------|-------------|
| `@new` | Start a new chat session before the next prompt |
| `@save <name>` | Save the current session with a name |
| `@load <name>` | Load a previously saved session |
| `@pause [reason]` | Pause execution; optional reason text shown in the pause banner |
| `@model <name>` | Switch Claude model (e.g., `@model opus`) |
| `@delay <ms>` | Wait before the next prompt (positive integer in ms, e.g., `@delay 5000`) |
| `@(` | Start a multiline prompt (all lines until `@)` are treated as one prompt) |
| `@)` | End a multiline prompt |
| `# comment` | Comment line (not sent to Claude) |
| `\@` | Escape: send literal `@` as a prompt (not treated as directive) |

- Missing required arguments (e.g., `@save` without a name) produce a validation warning
- Unknown directives (e.g., `@unknown`) produce a warning and are sent as regular prompts

### 9.3 Multiline Prompts

For prompts that span multiple lines, use `@(` and `@)`:

```
@(
Please review this code and check for:
1. Security vulnerabilities
2. Performance issues
3. Code style violations
@)
```

An unclosed multiline block (missing `@)`) produces a warning and is still sent as a single prompt.

### 9.4 Response Markers

Claude's responses can contain special markers to control queue execution:

- **`QUEUE_STOP`** — Queue execution pauses automatically. Useful when Claude detects an issue that needs human review.
- **`QUEUE_PASS`** — Advances the queue silently without waiting for user interaction.

### 9.5 Running the Queue

1. Write your prompts in the queue editor
2. Click **"Run"** or press `Ctrl+Enter` to start
3. The editor switches to the **Runner Panel** showing:
   - **Progress bar** — With percentage and count (completed / total)
   - **Color coding** — Blue (running), amber (paused), green (completed), red (error)
   - **Item list** with per-item status icons:
     - Spinner (blue) — currently executing
     - Pause icon (amber) — paused at this item
     - Checkmark (green) — completed (shown with strikethrough text)
     - X circle (red) — error
     - Clock (gray) — pending
   - **Auto-scroll** to the current item
4. **Controls:**
   - **Pause** — Temporarily halt execution (shown during running)
   - **Resume** / **Abort** — Shown during paused state
   - **Abort** requires `window.confirm` confirmation
   - **"Go to Session"** link — Navigate to the active chat session
5. **Session links** — Completed items show a link icon to navigate to their associated session
6. **"Back to Editor"** button — Dismiss the runner panel after completion or error

**During execution (pending items only):**
- **Drag-and-drop reorder** — Drag pending items by the grip handle to reorder
- **Delete** — Click the trash icon to remove a pending item
- **Add** — Inline input at the bottom to add new items to the queue

### 9.6 Session Locking

While the queue is running, a **sticky banner** appears at the top of chat sessions:

- **Running** (blue) — Spinner + progress (current/total) + current prompt preview (desktop)
- **Paused** (amber) — Pause icon + progress; pause reason shown below if provided
- **Error-paused** (red) — Alert icon + error details
- **Completed** (green) — Checkmark + total count; dismissible with X button
- **Error-stopped** (red) — Error message + link to queue editor; dismissible

**Banner controls:**
- **Pause / Resume / Abort** buttons directly in the banner (icon-only on mobile, icon+text on desktop)
- **"Queue Editor"** link — Navigate to the full queue editor (desktop only)
- **"Go to Session"** link — Navigate to the active queue session

**On other sessions:**
- A banner shows "Queue running in another session" with a link to navigate to it
- Other sessions remain fully accessible

### 9.7 Templates

Templates generate queue scripts by combining a template pattern with story selections from your project's PRD.

**Template Dialog** (opened via FileText icon in toolbar):

The dialog has two main sections:

**1. Template Source** — Three tabs:
- **Input** — Type template text directly in a monospace textarea with word wrap toggle; variable hint shown: `{story_num}, {epic_num}, {story_index}, {story_title}, {date}`
- **File** — Upload a `.txt` or `.qlaude-queue` file (max 100KB) via drag area
- **Saved** — Browse, select, edit, or delete previously saved templates

**2. Story Selection** — Stories extracted from your PRD:
- Grouped by epic with collapsible sections and checkbox selection
- **Select All / Deselect All** toggle
- **"Pause between epics"** checkbox — Inserts `@pause` between different epic groups
- Each epic header shows selected/total count with indeterminate checkbox state

**Template Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `{story_num}` | Full story number | `3.1` |
| `{epic_num}` | Epic number | `3` |
| `{story_index}` | Story index within epic | `1` |
| `{story_title}` | Story title (empty if not found) | `Login Page UI` |
| `{date}` | Execution date (YYYY-MM-DD) | `2026-03-18` |

```
@load epic-{epic_num}-base
Implement Story {story_num}: {story_title}
@save {date}/epic-{epic_num}/story-{story_index}-done
```

**Live Preview** — Shows the generated script with syntax highlighting below the template and story selection.

**Template Management:**
- **Save** — Save the current template with a name (inline form)
- **Update** — Overwrite a previously saved template
- **Delete** — Remove a saved template (with confirmation)
- Templates are stored per-project on the server

### 9.8 Queue Status Badge

A badge on the project card shows queue status:

- **Running** — Blue badge with progress
- **Paused** — Yellow badge
- **Error** — Red badge
- **Idle** — No badge shown

---

## 10. Project Board

Visual task and issue management for your projects. The board displays three card types: Issues, Stories, and Epics.

### 10.1 Kanban Board

The default view is a scrollable Kanban board:

- **Columns** represent statuses — each with a colored top border, label, and item count badge
- **Cards** display issues, stories, and epics with type badges: **[I]** (amber), **[S]** (blue), **[E]** (purple)
- **Horizontal scroll** — overflow columns peek from the edge with gradient fade overlays (no drag-and-drop between columns)
- Status changes are made via the card **context menu** (⋮), not by dragging
- Columns are fully customizable (see §10.11)

### 10.2 List View

Switch to an accordion-style list view:

- Items grouped by status column with chevron toggle
- **Item count** displayed next to each group header
- Only **non-empty columns** are shown (empty ones are hidden)
- On mobile, the last column auto-collapses to save space
- Compact card layout for browsing many items at once

### 10.3 Creating Issues

Click **"New Issue"** to create:

| Field | Details |
|-------|---------|
| **Title** | Required, max 200 characters |
| **Description** | Optional, supports markdown |
| **Type** | Bug, Improvement |
| **Severity** | Low, Medium, High, Critical |
| **Attachments** | Optional — drag-and-drop, click to browse, or paste from clipboard |

Status is automatically set to **Open** (not a user-editable field).

### 10.4 Editing Issues

Click the context menu (⋮) → **Edit** on any issue card:

- Same fields as the create dialog (title, description, type, severity)
- **Existing attachments** are shown with a delete button to remove each one
- **Add new attachments** via drag-and-drop, click, or paste

### 10.5 Issue Types

- **Bug** — Something is broken and needs fixing
- **Improvement** — Enhancement to existing functionality

### 10.6 Severity Levels

Severity badges are color-coded on cards:

- **Critical** — Red badge, urgent, needs immediate attention
- **High** — Orange badge, important, prioritize soon
- **Medium** — Yellow badge, should be addressed in normal workflow
- **Low** — Gray badge, minor issue, no urgency

### 10.7 Status Workflow

Items follow this lifecycle with 9 possible statuses:

```
Open → Draft → Approved → In Progress → Blocked → Review → Done → Closed
                                                              ↓
                                                          Promoted
```

Not all statuses are required. Use the context menu to change status directly. **Promoted** indicates an issue that has been escalated to a story or epic.

### 10.8 File Attachments

Attach image files to issues:

- Up to **10 files** per issue
- Maximum **10MB** per file
- Supported formats: PNG, JPEG, GIF, WebP
- Upload methods: **drag-and-drop** onto the attachment zone, **click** to browse, or **paste** from clipboard
- Attachments are managed in the issue create/edit dialogs — they are not shown inline on board cards
- Preview thumbnails are shown in a grid with a remove button (×) for each

### 10.9 Card Context Menu

Click the **⋮** button on any card to open the context menu. Actions vary by card type:

**Issue actions:**
- **Quick Fix** — Marks the issue as Done and opens a dev session with the issue context (only available for Open issues)
- **Promote to Story** — Convert an issue into a development story (disabled if already linked)
- **Promote to Epic** — Elevate an issue into an epic (disabled if already linked)
- **Edit** — Open the issue edit dialog
- **Close** / **Reopen** — Toggle between Closed/Done/Promoted and Open
- **Delete** — Permanently remove the issue

**Story actions:**
- **Normalize Status** — Sync the story status with its source file
- **Workflow actions** — Context-dependent: Draft → Validate, Approved → Start Dev, In Progress → Request QA, Review → Apply QA Fix

**Epic actions:**
- **View Sub-Stories** — Open a dialog showing all stories under the epic

The menu supports keyboard navigation (Arrow Up/Down, Enter, Escape).

### 10.10 Card Behavior

Cards display information based on their type:

- **Type badge** — [I], [S], or [E] with color coding
- **Severity badge** — For issues only, color-coded by level
- **Status badge** — Color-coded status indicator
- **Epic progress bar** — On epic cards, shows completion percentage with done/total count
- **Story epic number** — Shows the parent epic reference
- **Unmapped status warning** — ⚠ triangle icon when a card's status doesn't map to any column

**Click behavior:** Clicking a card navigates to its associated file in the development session (issues, stories, and epics with a `filePath`).

### 10.11 Board Configuration

Customize the board layout via the gear icon:

**Columns:**
- Add, remove, and **reorder** columns (Arrow Up/Down buttons)
- Maximum **10 columns** allowed
- **Required columns** (mapped to essential statuses) cannot be deleted
- Each column has a name and an optional color

**Colors:**
- Pick from a preset **color palette** (swatches) or leave as default
- Colors appear as the column's top border

**Status Mapping:**
- Map each of the 9 statuses (Open, Draft, Approved, In Progress, Blocked, Review, Done, Closed, Promoted) to a column
- **Custom status mapping** — Define additional custom status strings and assign them to columns

**Reset:**
- **Reset to defaults** button restores the original column layout (with confirmation dialog)

### 10.12 Mobile Kanban

On small screens, the board uses a swipe carousel:

- **Swipe left/right** to navigate between columns (threshold: 50px)
- **Rubber-band resistance** at the first and last columns (cannot swipe past edges)
- **Indicator dots** at the bottom show current position
- Smooth **300ms transition** animation between columns
- Touch-optimized card layout

---

## 11. BMAD-METHOD Integration

Hammoc provides first-class support for the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development).

### 11.1 What is BMAD-METHOD?

BMAD-METHOD is an open-source framework that structures AI-driven software development. It defines:

- **Agents** — Specialized AI roles organized by workflow phase
- **Documents** — PRD, Architecture spec, Frontend spec, Stories, QA plans, and supplementary docs (brainstorming, market research, competitor analysis, project brief)
- **Workflows** — Phase-based processes from research through implementation to completion

### 11.2 Setting Up BMad in a Project

BMad can be set up in two ways:

**During project creation:**
1. In the **New Project** dialog, the **"Setup BMad"** checkbox is enabled by default
2. Select the BMAD-METHOD version from the dropdown (defaults to latest)
3. The `.bmad-core` folder is automatically created when the project is registered

**For existing projects:**
1. Open the project card's **kebab menu** (⋮) on the project list page
2. Click **"Setup BMad"** (only shown for non-BMad projects)
3. Confirm the version to install
4. The `.bmad-core` folder structure is copied from the bundled template

The `.bmad-core` folder contains agents, tasks, templates, workflows, and configuration files including `core-config.yaml`.

### 11.3 BMad Agents

Click the **Agent Button** (Users icon, in the chat bottom bar right of the model selector) to open the agent dropdown:

**Planning group:**

| Agent | Role |
|-------|------|
| **Analyst** | Brainstorming, market research, competitor analysis, project brief |
| **PM** (Product Manager) | Defines PRD with epics and stories |
| **UX Expert** | Creates frontend specifications |
| **Architect** | Designs system architecture (backend, frontend, full-stack) |

**Implementation group:**

| Agent | Role |
|-------|------|
| **SM** (Scrum Master) | Drafts stories, orchestrates development |
| **PO** (Product Owner) | Validates story drafts against PRD |
| **Dev** (Developer) | Implements features, applies QA fixes |
| **QA** | Reviews and validates implementation quality |

**Agent dropdown features:**
- **Categorized groups** — Planning, Implementation, Other (with section labels)
- **Active agent checkmark** — Blue check icon next to the currently active agent
- **Agent icon & description** — Emoji icon and hover tooltip with role description
- **Keyboard navigation** — Arrow Up/Down to move, Enter to select, Escape to close
- Selecting an agent sends the agent command (e.g., `/BMad:agents:pm`) as the first prompt in the session

### 11.4 Project Overview Dashboard

For BMad projects, the overview page displays additional sections above the standard project overview (see §5.5):

**BMad Summary Card:**
- Overall **completion percentage** with a progress bar
- **Done/total epics** and **done/total stories** counts
- Background refresh indicator

**Next Step Recommender:**
- Detects the current **workflow phase** (Pre-PRD, Pre-Architecture, Implementation, Completed)
- Shows context-aware **action buttons** (primary/secondary) that navigate to the right agent + task command
- Quick links: New Session, Queue Runner, File Explorer
- See §11.5 for phase details

**Document Status Card:**
- Core documents: **PRD** and **Architecture** with exists/missing indicators
- Supplementary documents: Brainstorming, Market Research, Competitor Analysis, Project Brief, Frontend Spec, UI Architecture
- **"작성 필요"** (Required) badge for missing core documents; **"작성 권장"** (Recommended) for optional documents
- **Agent shortcut buttons** (→) to create missing documents with the appropriate agent
- **Sharded document support** — PRD and Architecture can be split into multiple files; expandable file tree view
- **Auxiliary documents** section — Stories and QA files with counts and expandable file trees

**Epic Progress Card:**
- Each epic shows a **color-coded progress bar** (gray 0%, amber <50%, blue ≥50%, green 100%)
- **Done/planned** story count per epic
- Click to **expand** and see individual story statuses with color-coded badges
- Story file links to navigate directly to the story file
- Unwritten story count shown when planned > written

**Recent Issues Card** (replaces Quick Start for BMad projects):
- Last 5 issues with severity dot, title, and status badge
- Click to navigate to the project board
- Link to "View Board"

### 11.5 Workflow Phases & Recommendations

The Next Step Recommender analyzes the project state and suggests actions based on four phases:

**Phase 1: Pre-PRD** (PRD does not exist)
- **Primary:** Create PRD → PM agent
- **Secondary:** Brainstorming, Market Research, Competitor Analysis, Project Brief → Analyst agent

**Phase 2: Pre-Architecture** (PRD exists, Architecture does not)
- **Primary:** Create Backend / Frontend / Full-stack Architecture → Architect agent
- **Secondary:** Create Frontend Spec → UX Expert agent (if not exists)

**Phase 3: Implementation** (both PRD and Architecture exist)
- **Priority 1:** Continue developing In Progress stories → Dev agent
- QA review for In Progress stories → QA agent
- Apply QA fixes → Dev agent
- **Priority 2:** Validate Draft stories → PO agent
- **Priority 3:** Start developing Approved stories → Dev agent
- **Priority 4:** Create next story → SM agent (when no actionable stories)

**Phase 4: Completed** (all planned stories are Done)
- Brainstorm new features → Analyst agent
- Add new epic → PM agent
- Add story to existing epic → SM agent

### 11.6 Queue Templates from PRD

Queue templates automate story development in batch. For details, see §9.7 (Queue Templates).

---

## 12. Settings

Access settings via the gear icon or the Settings page. The page has **6 tabs**: Global, Project, Notifications, Advanced, Help, and About. On desktop, tabs appear as a sidebar; on mobile, they use an accordion layout.

### 12.1 Theme

- **Dark** — Dark background, light text (default)
- **Light** — White background, dark text
- **System** — Follows your OS/browser preference

### 12.2 Language

Hammoc supports 6 languages:

- English
- 中文(简体) (Chinese Simplified)
- 日本語 (Japanese)
- 한국어 (Korean)
- Español (Spanish)
- Português (Portuguese)

Language is auto-detected from your browser settings. Override it manually in settings.

### 12.3 Default Model

Choose the default Claude model:

**Default:**
- **Default** — Uses the SDK/system default model

**Aliases (always latest version):**
- **Sonnet** — Latest Sonnet
- **Opus** — Latest Opus
- **Haiku** — Latest Haiku

**Claude 4.x:**
- Opus 4.6, 4.5, 4.1, 4
- Sonnet 4.5, 4
- Haiku 4.5

**Claude 3.x:**
- Sonnet 3.7, 3.5
- Haiku 3.5
- Opus 3, Sonnet 3, Haiku 3

Can be overridden per-project (see §12.8).

### 12.4 Default Permission Mode

Set how Claude handles file modifications:

| Mode | Behavior |
|------|----------|
| **Last Used** | Keeps the permission mode from the previous session |
| **Plan** | Claude plans but doesn't make changes |
| **Ask before edits** | Claude asks for approval before each change (default) |
| **Edit automatically** | Claude edits files automatically |
| **Bypass permissions** | Full autonomy, no restrictions |

Can be overridden per-project (see §12.8). Quick-cycle with `Shift+Tab` when the chat input is focused.

### 12.5 Markdown File Open Mode

Choose how `.md` files open by default:

- **Edit** — Opens in text editing mode
- **Preview** — Opens in rendered preview mode

### 12.6 File Explorer View

Default view for the file explorer:

- **Grid** — Icon-based Finder-style layout (default)
- **List** — Traditional file list

### 12.7 Layout Mode

Control the overall page width:

- **Narrow** — Content capped at 1280px, centered
- **Wide** — Full-width layout using all available screen space

Toggle via the layout button in the header.

### 12.8 Project Settings

Override global settings on a per-project basis:

1. Select a project from the **dropdown** (defaults to the currently active project)
2. Configure overrides:
   - **Model override** — Choose a specific model or "Use global default"
   - **Permission mode override** — Plan, Ask before edits, or Edit automatically (or use global default). Note: Bypass permissions is not available at project level
   - **Hide in sidebar** — Toggle to hide the project from the sidebar navigation
3. **Reset to Global Defaults** — Clears all project-level overrides (with confirmation). Only enabled when overrides exist

Active overrides are indicated with a blue "Project override" label next to each setting.

### 12.9 Chat Timeout

How long to wait for Claude's response:

- 1 minute
- 3 minutes
- **5 minutes** (default)
- 10 minutes
- 30 minutes

The timeout resets on every activity (messages, tool calls, heartbeats). If overridden by an environment variable, the field is disabled with an amber warning.

### 12.10 Notifications

The Notifications tab contains two sections: Web Push and Telegram.

#### 12.10.1 Web Push Notifications

Receive browser push notifications when Claude needs attention. Requires HTTPS and a browser that supports the Push API (Chrome, Firefox, Edge, Safari 16+).

- **Subscribe** — Register the current browser to receive push notifications (requests browser notification permission)
- **Unsubscribe** — Remove the current browser's push subscription
- **Enable toggle** — Master switch to enable or disable web push delivery
- **Subscribed devices** — Shows the number of browsers currently registered
- **Test** — Send a test push notification (5-second cooldown between tests)

> iOS: Add Hammoc to Home Screen first, then subscribe from within the PWA.

#### 12.10.2 Telegram Notifications

Get notified on your phone when Claude needs attention:

**Setup:**
1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) — enter the Bot Token
2. Get your Chat ID via [@userinfobot](https://t.me/userinfobot) — enter the Chat ID
3. Both fields support **change** and **delete** operations; bot tokens are shown **masked** for security

**Enable/Disable:**
- Master **enable checkbox** — requires both Bot Token and Chat ID to be configured before it can be toggled on

**Chat Notification Types:**
- **Permission requests** — Claude needs approval for file changes
- **Completion** — Chat task finished
- **Error** — Something went wrong during chat

**Queue Notification Types:**
- **Queue start** — Queue execution began
- **Queue complete** — Queue finished all items
- **Queue error** — Queue encountered an error
- **Queue input needed** — Queue paused, waiting for user input

**Other Options:**
- **Always notify** — Get notified for every message (suppressed when the session is visible in the browser)

**Test:** Click "Send Test" to verify your configuration. There is a **5-second cooldown** between tests.

**Access URL:** Set your Hammoc base URL (e.g., `http://192.168.1.100:3000`) so notification links open directly in your browser.

**Environment Variables:** Bot Token and Chat ID can be set via environment variables, which take priority over saved values (shown with an amber "Env" indicator).

### 12.11 System Prompt

Customize Claude's behavior with a fully editable system prompt template:

- **Warning banner** — Displayed at the top, cautioning about the impact of modifications
- **Editable textarea** — Edit the system prompt with **auto-save** (1-second debounce)
- **Character count** — Shown below the editor
- **"Customized" indicator** — Blue banner when a custom prompt is active
- **Restore to Default** button — Appears when the prompt has been modified
- **Template variables** — Listed below the editor with descriptions (e.g., `{gitBranch}`, `{gitMainBranch}`, `{gitStatus}`); variables are resolved at runtime by the server
- **Resolved preview** — Toggle to see the fully rendered prompt with variables replaced for the current project

### 12.12 Advanced Settings

**Server Management (mode-dependent):**

- **Development mode:** "Server Rebuild" button — rebuilds and restarts the server. Shows elapsed time during the build process (polls every 3 seconds)
- **Production mode:** Shows current version number, "Check for Updates" button, and "Install Update" button (appears only when an update is available). Includes build progress with elapsed timer

**SDK Parameters:**
- **Max Thinking Tokens** — Limit Claude's extended thinking tokens (1,024–128,000, step: 1,024)
- **Max Turns** — Limit conversation turns per query (1–100)
- **Max Budget (USD)** — Set cost limit per query ($0.01–$100)

### 12.13 Help

In-app usage guide within the Settings page:

- **Basic chat usage** — How to use the chat interface
- **Slash commands** — Available command reference
- **Permission mode guide** — Plan, Ask Before Edits, Edit Automatically explained
- **BMad Method** — Quick guide to the BMad workflow
- **Keyboard shortcuts** — Key bindings table (Enter, Shift+Enter, Escape, Ctrl+C, F7/Shift+F7, /)

### 12.14 About

Auto-populated from package metadata:

- App name and version number
- Project description
- Author with link
- License type
- **GitHub Issues** link (derived from repository URL)
- **Server status** — Healthy/unhealthy with color indicator dot
- **Server version**
- **Server time** — Localized timestamp

---

## 13. Keyboard Shortcuts

### Chat

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (desktop only) |
| `Shift+Enter` | New line in message |
| `ESC` | Abort generation / close command palette |
| `Ctrl+C` | Abort generation (only when no text is selected; otherwise copies) |
| `↑` / `↓` | Navigate prompt history (when cursor is at start/end of input) |
| `/` | Open slash command palette (auto-triggered when input starts with `/`) |
| `*` | Open star command palette (auto-triggered when input starts with `*`, requires active agent) |
| `Tab` | Select highlighted command from palette |
| `Shift+Tab` | Cycle permission mode (plan → default → acceptEdits → bypass) |
| `Ctrl` (hold) | Temporary chain mode while held |

### Quick Panel

| Shortcut | Action |
|----------|--------|
| `Alt+1` | Toggle Sessions panel |
| `Alt+2` | Toggle Files panel |
| `Alt+3` | Toggle Git panel |
| `Alt+4` | Toggle Terminal panel |

Note: Quick panel shortcuts are disabled when an input or textarea is focused.

### Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save file |
| `ESC` | Close editor |

### Diff Viewer

| Shortcut | Action |
|----------|--------|
| `F7` | Next change |
| `Shift+F7` | Previous change |
| `ESC` | Close diff viewer (fullscreen mode) |

### Terminal

| Shortcut | Action |
|----------|--------|
| `Ctrl++` or `Ctrl+=` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+0` | Reset font size |
| `←` / `→` | Switch between terminal tabs |
| `Delete` | Close active terminal tab |

---

## 14. Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address (all interfaces) |
| `NODE_ENV` | — | Set to `production` for optimized mode |
| `TRUST_PROXY` | `false` | Enable reverse proxy support. Set to `true` when behind Cloudflare Tunnel, nginx, etc. Enables proxy header reading, secure cookies, and Express trust proxy |
| `CORS_ORIGIN` | `true` | CORS origin policy. `true` allows any origin (local/VPN use). Set a specific URL (e.g., `https://hammoc.example.com`) to restrict |
| `RATE_LIMIT` | `200` | Max requests per minute per IP. Increase for multi-hop proxy setups where users share a proxy IP |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required for Claude Code to function) |
| `CHAT_TIMEOUT_MS` | `300000` | Chat response timeout in milliseconds (5 minutes). Overrides the Settings UI value |
| `LOG_LEVEL` | `INFO` (prod) / `DEBUG` (dev) | Logging level: ERROR, WARN, INFO, DEBUG, VERBOSE |
| `TERMINAL_ENABLED` | `true` | Enable/disable terminal feature (set `false` to disable). Overrides the Settings UI value |
| `SHELL_TIMEOUT` | `30000` | Terminal session cleanup grace period in milliseconds |
| `MAX_TERMINAL_SESSIONS` | `10` | Maximum concurrent terminal sessions |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (takes priority over Settings UI value) |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID (takes priority over Settings UI value) |
| `BASE_URL` | — | Fallback base URL for Telegram notification links (e.g., `http://192.168.1.100:3000`) |

### Client (Vite)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_PORT` | `3000` | Server port the client connects to (useful for multi-instance setups) |
| `VITE_LOG_LEVEL` | — | Client-side debug log level: ERROR, WARN, INFO, DEBUG, VERBOSE |

---

## 15. Troubleshooting

### 15.1 "Claude Code CLI not found"

Claude Code CLI must be installed and in your PATH:

```bash
claude --version
```

If not installed, follow the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code). The Onboarding page shows CLI installation, authentication, and API key status at a glance.

### 15.2 "Authentication required" / `claude login`

If the chat displays an authentication error, Claude Code CLI needs to be logged in:

```bash
claude login
```

The Onboarding page (shown when CLI is not authenticated) displays the current auth status and provides setup commands.

### 15.3 API rate limit exceeded

When Anthropic API rate limits are reached, the chat shows a rate limit error with a retry delay. Solutions:

1. Wait for the indicated retry period and try again
2. Reduce concurrent sessions or shorten prompts
3. Check your API usage / plan limits on the Anthropic console
4. The header status indicator shows API health (yellow triangle = API unavailable)

### 15.4 "Connection lost" / Reconnecting

Hammoc automatically reconnects with exponential backoff (1 s → 5 s max delay, unlimited retries). The header shows a status indicator: green (connected), yellow spinning (reconnecting with attempt counter), or red (disconnected with manual Reconnect button).

On mobile, the app automatically recovers when returning from background: if hidden for more than 3 seconds the socket is force-reconnected, and if hidden for more than 5 minutes authentication is re-validated.

If the connection doesn't recover:

1. Check that the server is still running
2. Click the Reconnect button in the header (appears when disconnected)
3. Refresh the browser
4. Restart the server: `hammoc` or `npm start`

### 15.5 Port already in use

The server automatically retries up to 5 times (1 s intervals) when the port is in use. If it still fails:

```bash
hammoc --port 3001
```

Or set the environment variable: `PORT=3001 hammoc`

### 15.6 Terminal not available

Terminal may be disabled when:

- Accessing from an external network (security restriction — only local IPs are allowed)
- `TERMINAL_ENABLED=false` is set in environment
- Maximum terminal sessions reached (default 10, configurable via `MAX_TERMINAL_SESSIONS`)

### 15.7 Reset password

If you forgot your password:

```bash
hammoc --reset-password
```

This prompts you to set a new password. Alternatively, delete `~/.hammoc/config.json` and restart the server to re-trigger the password setup flow in the browser.

### 15.8 Chat timeout

If Claude's responses are timing out:

1. Go to **Settings > Global** and adjust the **Chat Timeout** dropdown
2. Available values: 1 min, 3 min, 5 min (default), 10 min, 30 min
3. Complex tasks (large codebases, multi-file edits) may need longer timeouts
4. If the `CHAT_TIMEOUT_MS` environment variable is set, it overrides the UI setting (shown with an indicator)

### 15.9 Large file warning

Files over 1 MB display a truncation warning. Consider:

- Using the terminal to view large files
- Opening in an external editor
- Breaking large files into smaller ones

### 15.10 Data locations

If you need to find or back up your data:

| Data | Path |
|------|------|
| App config & password | `~/.hammoc/config.json` |
| User preferences | `~/.hammoc/preferences.json` |
| Queue templates | `<project-root>/.hammoc/queue-templates.json` (per project) |
| Chain failures | `~/.hammoc/chain-failures/<sessionId>.json` (per session) |
| Session data | `~/.claude/projects/` |
| Web Push VAPID keys | `~/.hammoc/vapid-keys.json` |
| Web Push subscriptions | `~/.hammoc/push-subscriptions.json` |
| TLS certificates | `~/.hammoc/key.pem`, `~/.hammoc/cert.pem` |
| Server logs | `./logs/server-YYYY-MM-DD.log` (relative to working directory, date-partitioned) |
