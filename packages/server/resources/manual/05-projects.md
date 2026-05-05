## 5. Projects

### 5.1 Project List

The project list page shows all your Claude Code projects in a responsive grid:

Each project card displays:

- **Project name** — Derived from the directory name
- **Path** — Full project directory path
- **Session count** — Number of chat sessions
- **Last modified** — When the project was last active
- **BMad badge** — Indicates BMAD-METHOD enabled projects
- **Status indicators** — Active sessions (green dot), queue status badge, terminal count (updates in real-time)

Each card has a **kebab menu** (⋮) with:

- **Setup BMad** — Initialize BMAD-METHOD on non-BMad projects (with version selection)
- **Hide / Unhide** — Toggle project visibility
- **Delete** — Remove the project

**Dashboard summary bar** appears at the top when projects exist, showing aggregate stats: Projects, Sessions, Active, Queue, Terminals.

### 5.2 Creating a New Project

1. Click **"New Project"** on the project list page
2. Enter the project directory path
3. The path is validated automatically with a short debounce while you type (`"Validating path..."` helper text is shown). Blurring the field validates immediately
4. Path collision detection — if the path already belongs to an existing project, an amber warning appears with a **"Navigate to existing"** link and the **Create** button is disabled until you pick a different path
5. Invalid paths show the server's validation message in red below the input, and also disable **Create**
6. Optionally enable BMad Method initialization with version selection
7. Rate limited to prevent abuse

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
- **Active streaming banner** — Green banner shown when sessions are actively streaming

For BMad projects, additional sections appear above this standard overview (see §11.4).

### 5.6 Deleting Projects

- Delete removes the project from Hammoc's list
- Optionally check **"Delete project files"** to also remove the directory on disk
- Confirmation dialog prevents accidental deletion

