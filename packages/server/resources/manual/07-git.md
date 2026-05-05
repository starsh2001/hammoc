## 7. Git

### 7.1 Git Status

The Git tab shows the current repository state with automatic refresh:

- **Top bar** — Branch selector dropdown + Pull/Push buttons
- **File groups** — Three collapsible sections (chevron toggle), each with file count badge:
  - **Staged Changes** — Files ready to commit (status indicators: M green, A green, D red, R blue)
  - **Unstaged Changes** — Modified files not yet staged (status indicators: M yellow, D red)
  - **Untracked Files** — New files not tracked by Git (status indicator: ?)
- **File click** — Clicking a file name opens the Diff viewer slide panel (see 7.8)
- **Error banner** — Git errors appear at the top and auto-clear; dismiss manually with X
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
- **Uncommitted changes warning** — If there are staged, unstaged, or untracked files, a confirmation dialog appears before switching
- **Keyboard navigation** — ArrowUp/Down to navigate, Enter to select, Escape to close dropdown

### 7.5 Commit History

- Browse recent commits (up to 20 in the full tab):
  - Short commit hash
  - Commit message
  - Author name
  - Relative timestamp (e.g., "2 hours ago", "3 days ago")

### 7.6 Pull & Push

- **Pull** — Fetch and merge remote changes (↓ arrow button)
- **Push** — Upload local commits to remote (↑ arrow button)
- **Ahead/Behind counts** — Each button shows the number of commits ahead or behind the remote
- Errors displayed in the error banner

### 7.7 Quick Git Panel

Lightweight Git access from the quick panel side bar:

- **Branch name** with changed file count badge (e.g., "3 changes")
- **Commit input** — Textarea for commit message
- **"Stage All & Commit"** — Single green button that automatically stages all unstaged/untracked files and commits in one action
- **Success message** — Displayed briefly after a successful commit
- **Recent commits** — Shows only the 3 most recent commits (hash, timestamp, message)
- **"View in Git Tab"** link — Navigates to the full Git tab for advanced operations
- **Git init support** — If the project is not a Git repository, shows an init button

### 7.8 Diff Viewer

- Clicking a file in the Git tab opens a **slide panel** from the right side
- Shows the diff for the selected file, using side-by-side or inline layout based on screen width
- **Layout toggle** — A button in the viewer header switches between side-by-side and inline layout. The choice is persisted per user (see §2.7)
- **Close** — Click X button, click the backdrop, or press Escape

### 7.9 Git Repository Initialization

If the project directory is not a Git repository:

- **Git tab** — Shows an "Initialize Repository" button
- **Quick Git panel** — Shows a message and init button
- After initialization, the Git status refreshes automatically

