# BMad Studio User Manual

Complete guide to every feature in BMad Studio.

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
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Getting Started

### 1.1 Installation

**Option A: Run with npx (no install)**

```bash
npx bmad-studio
```

**Option B: Global install**

```bash
npm install -g bmad-studio
bmad-studio
```

**Option C: From source (development)**

```bash
git clone https://github.com/starsh2001/bmad-studio.git
cd bmad-studio
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
3. **CLI Verification**: The onboarding wizard checks that Claude Code CLI is installed and authenticated. Follow the prompts if any step fails.
4. **Project Selection**: Choose an existing Claude Code project or create a new one.

### 1.4 Mobile Access

BMad Studio is fully responsive. From any device on the same network:

```
http://<your-computer-ip>:3000
```

- Desktop: Enter sends message, Shift+Enter for new line
- Mobile: Enter adds new line, tap the send button to send

### 1.5 CLI Options

```bash
bmad-studio --port 8080          # Custom port
bmad-studio --host localhost     # Bind to localhost only
bmad-studio --reset-password     # Reset admin password
bmad-studio --version            # Show version
bmad-studio --help               # Show help
```

Environment variables also work: `PORT=8080 bmad-studio`

---

## 2. Chat

The chat interface is the core of BMad Studio. It provides a rich, real-time conversation experience with Claude.

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

- Click the image icon in the input area
- Or drag and drop images directly
- Supported formats: PNG, JPEG, GIF, WebP
- Maximum: 5 images per message, 10MB total
- Images preview in the input area before sending

### 2.5 Tool Call Visualization

When Claude uses tools (reading files, editing code, running commands), each tool call is shown as a card:

- **Tool name** — e.g., Read, Edit, Bash, Grep
- **Input parameters** — What was passed to the tool
- **Status indicator** — Running (spinner), completed (checkmark), failed (X), rejected (blocked)
- **Execution time** — How long the tool took
- **Result** — Expandable section showing tool output
- **File paths** — Toggle between short and full path display

### 2.6 Diff Viewer

When Claude modifies files, a diff viewer shows the changes:

- **Side-by-side view** — Before and after comparison
- **Syntax highlighting** — Language-aware coloring
- **Responsive layout** — Automatically adjusts for narrow/wide screens
- Powered by Monaco Editor (same engine as VS Code)

### 2.7 Permission Requests

Depending on your permission mode, Claude may ask for approval before modifying files:

- **Approve** — Allow the change
- **Reject** — Block the change
- View the diff before deciding
- See the list of requested permissions

### 2.8 Prompt Chaining

Queue multiple prompts for sequential execution:

1. Type your first prompt and send it
2. While Claude is responding, type the next prompt — it enters the chain
3. Up to 5 prompts can be queued
4. A banner shows the chain status with Next/Remove/Cancel controls
5. Each prompt auto-executes when the previous one completes

### 2.9 Context Usage

Monitor token usage in real-time:

- **Usage bar** — Shows used/limit tokens and percentage
- **Cost display** — Estimated cost for the session
- **Cache tokens** — Cache creation and read token counts
- **Warning** — Visual alert when context reaches 90%+

### 2.10 Aborting Responses

Stop Claude mid-response:

- Click the **Stop** button (appears during streaming)
- Press `ESC` key
- Press `Ctrl+C` (when no text is selected in the input)

### 2.11 Prompt History

Navigate through your previous inputs:

- Press `↑` (Up arrow) to recall the previous prompt
- Press `↓` (Down arrow) to go forward
- History is per-session

### 2.12 Extended Thinking

When Claude uses extended thinking, the reasoning is shown in a collapsible block:

- Click to expand/collapse
- Thinking content is visually distinct from the main response
- Useful for understanding Claude's decision-making process

---

## 3. Sessions

### 3.1 Session List

Access the session list via the sidebar or quick panel:

- **Preview** — First prompt of each session
- **Message count** — Number of messages in the session
- **Date** — When the session was last active
- **Streaming indicator** — Shows if a session is currently active
- Empty sessions are automatically filtered out

### 3.2 Creating a New Session

- Click the **New Session** button in the header
- If you're in an active streaming session, a confirmation dialog appears
- Each session gets a unique ID

### 3.3 Session Search

Search through your sessions:

- **By name/ID** — Quick filtering of the session list
- **By content** — Server-side search through conversation content
- Results highlight matching sessions
- "Load more" pagination for large result sets

### 3.4 Session Operations

- **Rename** — Click the edit icon next to the session name
- **Delete** — Remove a session (with confirmation)
- **Selection mode** — Select multiple sessions for batch operations

### 3.5 Quick Session Panel

Access sessions without leaving the chat:

- Open the quick panel (sidebar tab)
- Switch between sessions instantly
- See session previews and status

---

## 4. Slash Commands & Favorites

### 4.1 Command Palette

Type `/` in the chat input to open the command palette:

- Browse available commands with descriptions
- Filter by typing: `/test` shows commands containing "test"
- Commands are context-aware (project-specific and agent-specific)
- Press Enter or click to insert the selected command

### 4.2 Favorites

Pin your most-used commands for quick access:

- **Favorites bar** — Appears above the chat input
- Hold up to **20 favorites**
- Click a favorite chip to instantly insert it
- **Add**: Click the star icon on any command in the palette
- **Remove**: Long-press or right-click a favorite chip
- **Reorder**: Drag and drop chips to rearrange

### 4.3 Star Favorites

Mark up to **10 star favorites** for even quicker access:

- Star favorites appear with a special indicator
- They are prioritized at the top of the favorites bar
- Toggle star status from the favorites management popup

### 4.4 Favorite Management

Open the favorites popup to manage all your favorites:

- View all favorites in one list
- Remove favorites
- Toggle star status
- Drag to reorder

---

## 5. Projects

### 5.1 Project List

The project list page shows all your Claude Code projects:

- **Project name** — Derived from the directory name
- **Path** — Full project directory path
- **Session count** — Number of chat sessions
- **Last modified** — When the project was last active
- **BMad badge** — Indicates BMAD-METHOD enabled projects

### 5.2 Creating a New Project

1. Click **"New Project"** on the project list page
2. Enter the project directory path
3. The path is validated (must exist, must be a valid directory)
4. Optionally enable BMad Method initialization
5. Rate limited: 10 creations per minute

### 5.3 Project Dashboard

Each project has a real-time status dashboard:

- **Active chats** — Number of streaming chat sessions
- **Queue status** — Queue runner state (running/paused/idle)
- **Terminal count** — Number of open terminal sessions
- **Summary bar** — Aggregate stats across all projects

Status updates are pushed via WebSocket in real-time.

### 5.4 Project Settings

Configure per-project overrides (accessible from project context):

- **Default model** — Override the global model selection
- **Permission mode** — Override the global permission mode
- **System prompt** — Custom instructions for Claude in this project
- **Max thinking tokens** — Limit Claude's extended thinking
- **Max turns** — Limit conversation turns
- **Max budget (USD)** — Set spending limits

### 5.5 Hiding Projects

- Hide projects you don't use frequently
- Toggle "Show hidden" to reveal them
- Hiding doesn't delete any data

### 5.6 Deleting Projects

- Delete removes the project from BMad Studio's list
- The actual project directory on disk is NOT deleted
- Confirmation dialog prevents accidental deletion

---

## 6. File Explorer & Editor

### 6.1 File Explorer

Access the file explorer from the sidebar or quick panel:

**Grid View (Finder-style)**
- Icon-based display with file type indicators
- Click to open files, double-click folders to navigate
- Breadcrumb navigation at the top

**List View**
- Traditional file list with details
- Sort by name, size, date
- Compact layout for large directories

**Common Features**
- **Search** — Filter files by name
- **Hidden files** — Toggle visibility of dotfiles
- **Create** — New file or folder via dialog
- **Rename** — Inline file/folder renaming
- **Delete** — With confirmation dialog

### 6.2 Text Editor

Click any text file to open it in the editor:

- **Syntax highlighting** — Language-aware (detected from file extension)
- **Edit mode** — Full text editing with the edit button
- **Preview mode** — Rendered view (especially useful for Markdown)
- **Save** — `Ctrl+S` or the save button
- **Unsaved changes warning** — Prevents accidental data loss
- **File size limit** — Files over 1MB show a truncation warning

### 6.3 Markdown Preview

For `.md` files:

- Toggle between **Edit** and **Preview** modes via the header button
- Preview renders full markdown with styles
- Default mode configurable in settings (Edit or Preview)

### 6.4 Image Viewer

Click any image file to open the viewer:

- **Zoom in/out** — Button controls
- **Reset zoom** — Return to original size
- **Loading indicator** — Shows while image loads
- Supports PNG, JPEG, GIF, WebP, SVG

### 6.5 Quick File Panel

Access files without leaving the chat:

- Open the quick panel and switch to the Files tab
- Recently accessed files appear at the top
- Search and navigate the file tree
- Click to open in the editor overlay

---

## 7. Git

### 7.1 Git Status

The Git tab shows the current repository state:

- **Current branch** — Displayed at the top
- **Staged changes** — Files ready to commit (green)
- **Unstaged changes** — Modified files not yet staged (yellow)
- **Untracked files** — New files not tracked by Git (gray)
- Each file shows its change type: Added, Modified, Deleted, Renamed

### 7.2 Staging Files

- **Stage individual files** — Click the "+" button next to each file
- **Stage all** — Click "Stage All" to stage everything
- **Unstage** — Click the "-" button on staged files

### 7.3 Committing

1. Stage the files you want to commit
2. Write a commit message in the text input
3. Click **"Commit"** or use **"Stage All & Commit"**
4. Success notification confirms the commit

### 7.4 Branch Management

- **View branches** — See all local branches
- **Current branch** — Highlighted in the list
- **Create branch** — Enter a new branch name
- **Switch branch** — Click on a branch to switch
- **Conflict warning** — Alerts if switching would cause issues

### 7.5 Commit History

- Browse recent commits with:
  - Commit message
  - Author name
  - Relative timestamp (e.g., "2 hours ago")
- Scroll for older commits

### 7.6 Pull & Push

- **Pull** — Fetch and merge remote changes
- **Push** — Upload local commits to remote
- Status indicators show success or failure
- Error messages displayed for conflicts or authentication issues

### 7.7 Quick Git Panel

Lightweight Git access from the chat view:

- Open the quick panel and switch to the Git tab
- Stage, commit, and view status without leaving chat
- Compact layout optimized for the side panel

---

## 8. Terminal

### 8.1 Web Terminal

Full terminal access in your browser:

- **Shell emulation** — Real PTY (pseudo-terminal) connection
- **Working directory** — Opens in your project directory
- Supports all shell commands, interactive programs, and TUI apps
- Powered by xterm.js for accurate terminal rendering

### 8.2 Multiple Tabs

- Click **"+"** to open a new terminal tab
- Switch between tabs by clicking their labels
- Each tab is an independent shell session
- Close tabs individually

### 8.3 Font Size

- `Ctrl++` (or `Ctrl+=`) — Increase font size
- `Ctrl+-` — Decrease font size
- `Ctrl+0` — Reset to default size

### 8.4 Connection Status

- **Connected** — Green indicator, terminal is active
- **Disconnected** — Terminal session ended or connection lost
- **Process exit code** — Shown when a process terminates

### 8.5 Security

Terminal access is restricted for safety:

- **Local network only** — Disabled when accessed from outside the local network
- **Localhost/private IP detection** — Automatically determines if the connection is local
- **Configurable** — Enable/disable via Settings > Advanced or the `TERMINAL_ENABLED` environment variable
- **Max sessions** — Configurable limit (default: 10) via `MAX_TERMINAL_SESSIONS`

### 8.6 Quick Terminal

Launch a terminal overlay from the chat view:

- Open the quick panel and switch to the Terminal tab
- Click "New Terminal" to start a session
- Use without leaving your chat context

---

## 9. Queue Runner

The Queue Runner automates sequences of prompts for batch processing.

### 9.1 Queue Editor

Write your prompt sequence in the editor:

```
Create a new React component for user profile
@newSession
Write unit tests for the user profile component
@pause
Review and refactor the component
```

Each line is one prompt. Special commands start with `@`.

### 9.2 Special Commands

| Command | Description |
|---------|-------------|
| `@newSession` | Start a new chat session before the next prompt |
| `@save <name>` | Save the current session with a name |
| `@load <name>` | Load a previously saved session |
| `@pause` | Pause execution; resume manually |
| `@model <name>` | Switch Claude model (e.g., `@model opus`) |
| `@wait <seconds>` | Wait before the next prompt |
| `@multiline` | Next lines until `@endmultiline` are treated as one prompt |
| `@comment <text>` | Add a comment (not sent to Claude) |

### 9.3 Multiline Prompts

For prompts that span multiple lines:

```
@multiline
Please review this code and check for:
1. Security vulnerabilities
2. Performance issues
3. Code style violations
@endmultiline
```

### 9.4 Running the Queue

1. Write your prompts in the queue editor
2. Click **"Run"** to start
3. Monitor progress: **Current / Total** display
4. **Pause** — Temporarily halt execution
5. **Resume** — Continue from where you paused
6. **Abort** — Stop completely (with confirmation)

### 9.5 Session Locking

While the queue is running:

- The active session is **locked** — manual input is disabled
- A banner shows the queue status
- "Go to Queue Session" button lets you observe
- Other sessions remain accessible

### 9.6 Templates

Save and reuse queue scripts:

**Saving a Template**
1. Write your queue in the editor
2. Click **"Save as Template"**
3. Give it a name and optional description

**Loading a Template**
1. Click **"Load Template"**
2. Browse saved templates
3. Click to load into the editor

**Template Variables**
Use `{{variable}}` syntax for customizable templates:

```
Create a {{component_type}} component named {{name}}
Write tests for {{name}}
```

Variables are prompted when loading the template.

### 9.7 Story-Based Generation

For BMAD-METHOD projects:

1. Click **"Generate from PRD"** in the queue editor
2. Select epics and stories to include
3. Optionally add `@pause` between epics
4. The queue is auto-generated from your project's PRD structure

### 9.8 Queue Status Badge

A badge on the project card shows queue status:

- **Running** — Blue badge with progress
- **Paused** — Yellow badge
- **Error** — Red badge
- **Idle** — No badge shown

---

## 10. Project Board

Visual task and issue management for your projects.

### 10.1 Kanban Board

The default view is a drag-and-drop Kanban board:

- **Columns** represent statuses (e.g., Open, In Progress, Done)
- **Cards** represent issues
- Drag cards between columns to change status
- Columns are customizable

### 10.2 List View

Switch to a tabular view:

- Sort by any column (title, status, severity, type, date)
- Inline status editing
- Compact layout for many issues
- Filter by status

### 10.3 Creating Issues

Click **"New Issue"** to create:

| Field | Options |
|-------|---------|
| **Title** | Required, free text |
| **Description** | Optional, supports markdown |
| **Type** | Bug, Improvement, Quick Action |
| **Severity** | Low, Medium, High, Critical |
| **Status** | Open (default) |

### 10.4 Issue Types

- **Bug** — Something is broken and needs fixing
- **Improvement** — Enhancement to existing functionality
- **Quick Action** — Small task that can be done quickly

### 10.5 Severity Levels

- **Low** — Minor issue, no urgency
- **Medium** — Should be addressed in normal workflow
- **High** — Important, prioritize soon
- **Critical** — Urgent, needs immediate attention

### 10.6 Status Workflow

Issues follow this lifecycle:

```
Open → Draft → Approved → In Progress → Blocked → Review → Done → Closed
```

Not all statuses are required. You can drag cards directly from Open to Done if appropriate.

### 10.7 File Attachments

Attach files to issues:

- Up to **10 files** per issue
- Maximum **10MB** per file
- Supported formats: PNG, JPEG, GIF, WebP
- View attachments inline on the issue card

### 10.8 Issue Promotion

Escalate issues through the BMad workflow:

- **Promote to Story** — Convert an issue into a development story
- **Promote to Epic** — Elevate a story into an epic
- Available from the card context menu

### 10.9 Epic & Story Integration

For BMAD-METHOD projects:

- View **sub-stories** within an epic
- **Validate** stories against PRD requirements
- **Start Development** — Launch the dev workflow
- **Request QA** — Initiate QA review
- **Apply QA Fixes** — Address QA feedback

### 10.10 Board Configuration

Customize the board layout:

1. Click the **gear icon** on the board
2. Configure:
   - Column names and order
   - Status-to-column mapping
   - Column colors
   - Visible columns toggle
3. **Reset to defaults** if needed

### 10.11 Mobile Kanban

On small screens, the board adapts:

- Column-by-column navigation (swipe or tap)
- Touch-friendly card interactions
- Simplified layout for small screens

---

## 11. BMAD-METHOD Integration

BMad Studio provides first-class support for the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development).

### 11.1 What is BMAD-METHOD?

BMAD-METHOD is an open-source framework that structures AI-driven software development. It defines:

- **Agents** — Specialized AI roles (SM, PM, Architect, Developer, QA)
- **Documents** — PRD, Architecture spec, Stories, Test plans
- **Workflows** — Structured processes from requirements to deployment

### 11.2 Setting Up BMad in a Project

1. Navigate to your project's **Overview** page
2. Click **"Setup BMad"**
3. Select the BMAD-METHOD version to install
4. The `.bmad-core` folder structure is created in your project

### 11.3 BMad Agents

Use the **Agent Button** (floating action button in chat) to switch agents:

| Agent | Role |
|-------|------|
| **SM** (Scrum Master) | Orchestrates the development process |
| **PM** (Product Manager) | Defines requirements and priorities |
| **Architect** | Designs system architecture |
| **Developer** | Implements features and fixes |
| **QA** | Tests and validates quality |

Switching agents changes Claude's persona and available commands for that role.

### 11.4 Project Overview Dashboard

The BMad project overview shows:

- **Document status** — PRD completion, architecture spec status
- **Epic progress** — Visual indicators for each epic
- **Story status** — Completion tracking per story
- **Quick actions** — Jump to relevant workflows

### 11.5 Recommended Workflow

1. **Start with SM** — Set up the project structure
2. **Switch to PM** — Define the PRD with epics and stories
3. **Switch to Architect** — Design the technical architecture
4. **Switch to Developer** — Implement stories one by one
5. **Switch to QA** — Validate the implementation
6. **Use Queue Runner** — Automate story implementation in batch

### 11.6 Queue Templates from PRD

Automate development with generated queues:

1. Open the **Queue Runner**
2. Click **"Generate from PRD"**
3. Select which epics/stories to include
4. Optionally add pauses between epics
5. Run the queue to automate the entire development sequence

---

## 12. Settings

Access settings via the gear icon or the Settings page.

### 12.1 Theme

- **Light** — White background, dark text
- **Dark** — Dark background, light text
- **System** — Follows your OS/browser preference

### 12.2 Language

BMad Studio supports 6 languages:

- English
- 中文 (Chinese Simplified)
- 日本語 (Japanese)
- 한국어 (Korean)
- Español (Spanish)
- Português (Portuguese)

Language is auto-detected from your browser settings. Override it manually in settings.

### 12.3 Default Model

Choose the default Claude model:

- Claude Sonnet (fast, balanced)
- Claude Opus (most capable)
- Claude Haiku (fastest, lightweight)
- Specific version variants (3.x, 4.x)

Can be overridden per-project in project settings.

### 12.4 Default Permission Mode

Set how Claude handles file modifications:

| Mode | Behavior |
|------|----------|
| **Plan** | Claude plans but doesn't make changes |
| **Ask** | Claude asks for approval before each change (default) |
| **Auto** | Claude edits files automatically |
| **Bypass** | Full autonomy, no restrictions |

Can be overridden per-project.

### 12.5 Markdown File Open Mode

Choose how `.md` files open by default:

- **Edit** — Opens in text editing mode
- **Preview** — Opens in rendered preview mode

### 12.6 File Explorer View

Default view for the file explorer:

- **Grid** — Icon-based Finder-style layout
- **List** — Traditional file list

### 12.7 Chat Timeout

How long to wait for Claude's response:

- 1 minute
- 3 minutes
- **5 minutes** (default)
- 10 minutes
- 30 minutes

The timeout resets on every activity (messages, tool calls, heartbeats).

### 12.8 Telegram Notifications

Get notified on your phone when Claude needs attention:

**Setup:**
1. Create a Telegram bot via [@BotFather](https://t.me/BotFather)
2. Get your Chat ID
3. Enter both in Settings > Telegram

**Notification Types:**
- **Permission requests** — Claude needs approval
- **Completion** — Task finished
- **Error** — Something went wrong
- **Queue events** — Start, complete, error, input needed
- **Always notify** — Get notified for every message

**Test:** Click "Send Test" to verify your configuration.

**Access URL:** Set your BMad Studio URL so notification links open directly in your browser.

### 12.9 System Prompt

Customize Claude's behavior:

- View the default system prompt
- Edit to add custom instructions
- Per-project overrides available
- Restore to default at any time
- Template variables are shown for reference

### 12.10 Advanced Settings

- **Server Restart** — Rebuild and restart the server (production mode)
- **Check for Updates** — See if a newer version is available
- **Install Update** — Update to the latest version
- **Terminal Toggle** — Enable/disable the terminal feature
- **Reset All Settings** — Restore all preferences to defaults (with confirmation)

### 12.11 About

Auto-populated from package metadata:

- Version number
- Project description
- Author with link
- License
- Server status (healthy/unhealthy)
- Server time
- GitHub Issues link

---

## 13. Keyboard Shortcuts

### Chat

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (desktop) |
| `Shift+Enter` | New line in message |
| `ESC` | Abort generation |
| `Ctrl+C` | Abort generation (when no text selected) |
| `↑` / `↓` | Navigate prompt history |
| `/` | Open command palette |

### Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file |

### Terminal

| Shortcut | Action |
|----------|--------|
| `Ctrl++` or `Ctrl+=` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+0` | Reset font size |

---

## 14. Troubleshooting

### "Claude Code CLI not found"

Claude Code CLI must be installed and in your PATH:

```bash
claude --version
```

If not installed, follow the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code).

### "Connection lost" / Reconnecting

BMad Studio automatically reconnects with exponential backoff (up to 5 attempts). If the connection doesn't recover:

1. Check that the server is still running
2. Refresh the browser
3. Restart the server: `bmad-studio` or `npm start`

### Port already in use

```bash
bmad-studio --port 3001
```

Or set the environment variable: `PORT=3001 bmad-studio`

### Terminal not available

Terminal may be disabled when:

- Accessing from an external network (security restriction)
- `TERMINAL_ENABLED=false` is set
- Enable it in Settings > Advanced > Terminal

### Reset password

If you forgot your password:

```bash
bmad-studio --reset-password
```

This prompts you to set a new password.

### Chat timeout

If Claude's responses are timing out:

1. Go to Settings > Chat Timeout
2. Increase the timeout (up to 30 minutes)
3. Complex tasks may need longer timeouts

### Large file warning

Files over 1MB display a truncation warning. Consider:

- Using the terminal to view large files
- Opening in an external editor
- Breaking large files into smaller ones

### Data locations

If you need to find or back up your data:

| Data | Path |
|------|------|
| App config & password | `~/.bmad-studio/config.json` |
| User preferences | `~/.bmad-studio/preferences.json` |
| Queue templates | `~/.bmad-studio/queue-templates.json` |
| Session data | `~/.claude/projects/` |
| Server logs | `./logs/` (relative to working directory) |
