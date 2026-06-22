## 5. Projects

### 5.1 Project List

The project list page shows all your Claude Code projects in a responsive grid:

Each project card displays:

- **Project name** — Derived from the directory name
- **Path** — Full project directory path
- **Session count** — Number of chat sessions
- **Last modified** — When the project was last active
- **BMad badge** — Indicates BMAD-METHOD enabled projects
- **Status indicators** — Active sessions (green dot), pending question count (cyan dot), queue status badge, terminal count (updates in real-time)

Each card has a **kebab menu** (⋮) with:

- **Setup BMad** — Initialize BMAD-METHOD on non-BMad projects (with version selection)
- **Hide / Unhide** — Toggle project visibility
- **Delete** — Remove the project

**Dashboard summary bar** appears at the top when projects exist, showing aggregate stats: Projects, Sessions, Active, Queue, Terminals.

**Header brand logo (Hammoc)** — The Hammoc logo on the left of every header is clickable and always returns you to the project list from any page (project Overview, Board, Sessions, Queue, Files, Git, Terminal, project Settings, chat session). Use it as a one-tap "Home" without going through the back button.

### 5.2 Creating a New Project

1. Click **"New Project"** on the project list page
2. Enter the project directory path, or click **Browse** to pick a folder visually (see below)
3. The path is validated automatically with a short debounce while you type (`"Validating path..."` helper text is shown). Blurring the field validates immediately
4. Path collision detection — if the path already belongs to an existing project, an amber warning appears with a **"Navigate to existing"** link and the **Create** button is disabled until you pick a different path
5. Invalid paths show the server's validation message in red below the input, and also disable **Create**
6. Optionally enable BMad Method initialization with version selection

**Browse for a directory** — Instead of typing the path, click **Browse** to open a visual directory picker:

- It opens expanded at your home directory. Click **My PC** to jump up to the drive roots (Windows) or filesystem root, then drill back down
- A breadcrumb across the top shows your current location; click any segment to jump straight to that level
- The folder tree lazy-loads subfolders as you expand them — only folders are shown, never files
- Create a folder in place with **New folder**, or rename one with **Rename** (there is no delete here, by design)
- Click **Select this path** to drop the highlighted folder into the path field. Browsing only fills the input; the normal validation and **Create** step still apply

This is most useful on mobile or tablet, where typing a long absolute path by hand is awkward.

### 5.3 Project Settings

Per-project settings live in their own tab inside each project (Overview / Queue / Git / Files / Terminal / Board / **Settings**), no longer under the global Settings page. Opening the tab takes you directly to that project's configuration — there is no project dropdown to disambiguate.

The Settings tab has a two-pane layout:

- **Left nav** — Top-level groups: **General**, **Harness Workbench** (see §12), **Context Builder** (§12.17), **Observability** (§12.18), and **Marketplace** (§12.19). BMad projects also get a **BMad Settings** group (§12.16)
- **Right panel** — Form contents for the selected group

**General group** (per-project override fields):

- **Default model** — Override the global model selection
- **Permission mode** — Override the global permission mode (Plan, Ask before edits, Edit automatically). Note: Bypass permissions is not available at project level
- **Conversation engine** — Override which engine this project runs on: **Use Global default**, **SDK**, or **CLI** (see §13.17). When set to anything other than Global default, a "Project override" badge appears next to the field. The effective engine is resolved as project override → global setting → SDK
- **Hidden toggle** — Hide the project from the project list
- **Reset to Global Defaults** — Remove all overrides at once

On narrow screens, the left nav collapses into a row of buttons above the right panel (the inner Harness Workbench navigator beneath it becomes the horizontally-scrolling pill row — see §12.1).

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
- **Active streaming banner** — Green banner shown when sessions are actively streaming

For BMad projects, additional sections appear above this standard overview (see §11.4).

### 5.6 Deleting Projects

- Delete removes the project from Hammoc's list
- Optionally check **"Delete project files"** to also remove the directory on disk
- Confirmation dialog prevents accidental deletion

