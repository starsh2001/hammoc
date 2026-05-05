## 8. Terminal

### 8.1 Web Terminal

Full terminal access in your browser:

- **Shell emulation** — Real terminal connection to your system shell
- **Working directory** — Opens in your project directory
- Supports all shell commands, interactive programs, and TUI apps
- **Theme** — Automatically matches app theme (dark/light)
- **Font** — Monospace font (JetBrains Mono, Fira Code, Cascadia Code)

### 8.2 Multiple Tabs

- Click **"New Terminal"** button (+ icon) in the header to open a new terminal tab
- **Maximum 5 terminals** per project; button disabled at limit
- **Tab labels** — Named after shell (e.g., "bash", "zsh"); numbered when multiple share the same shell ("bash 1", "bash 2")
- **Switch tabs** — Click on a tab label or use **ArrowLeft/ArrowRight** keyboard navigation
- **Close tabs** — Click the X button on each tab, or press **Delete** to close the active tab
- **Empty state** — When no terminals exist, a centered prompt with "New Terminal" button is shown

### 8.3 Font Size

Font size controls are available both via keyboard shortcuts and GUI buttons in the header:

- **GUI controls** — Minus (-), current size display (click to reset), Plus (+) buttons in the header
- `Ctrl+=` / `Ctrl++` — Increase font size
- `Ctrl+-` — Decrease font size
- `Ctrl+0` — Reset to default size

### 8.4 Connection Status

The header shows the current terminal status:

- **Connecting** — Spinner with "Connecting..." text
- **Connected** — Green dot indicator with "Connected" text
- **Disconnected** — Red dot; "Disconnected" message shown over the terminal
- **Exited** — Gray dot with exit code displayed

### 8.5 Security

Terminal access is restricted for safety:

- **Local network only** — Blocked when accessed from outside the local/private network. When behind a reverse proxy with `TRUST_PROXY=true`, real client IPs are used for access control
- **Access denied warning** — When access is denied, a shield icon with explanation is shown
- **Configurable** — Enable/disable via the `TERMINAL_ENABLED` environment variable (set `false` to disable)
- **Max sessions** — Server-side limit of 10 (configurable via `MAX_TERMINAL_SESSIONS`); client limits to 5 per project
- **Session persistence** — Terminal sessions survive browser refreshes and temporary network interruptions

### 8.6 Quick Terminal

Lightweight terminal access from the quick panel side bar:

- **Multi-terminal support** — Same tab management as the full Terminal tab (create, switch, close, max 5)
- **Font size controls** — Minus, size display (click to reset), Plus buttons in the header
- **"Open in Tab"** link — Navigate to the full Terminal tab
- **Tab keyboard navigation** — ArrowLeft/Right to switch, Delete to close
- **Security warning** — Same access denied warning when terminal access is restricted

