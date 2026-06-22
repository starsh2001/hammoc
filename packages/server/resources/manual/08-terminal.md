## 8. Terminal

### 8.1 Web Terminal

Full terminal access in your browser, designed for both desktop and touch devices:

- **Shell emulation** — Real terminal connection to your system shell
- **Working directory** — Opens in your project directory
- Supports all shell commands, interactive programs, and TUI apps
- **Read-only viewport + input bar** — The terminal display is read-only; all typing goes through a dedicated input bar at the bottom. Printable characters and special keys (Enter, Tab, Escape, Ctrl combos) are relayed to the shell immediately, so the input bar stays empty most of the time. During CJK/IME composition, the composed text appears temporarily in the input bar until committed
- **Quick-key buttons** — A toolbar above the input bar provides one-tap access to keys that are hard to reach on touch keyboards: arrow keys (Up/Down/Left/Right), Tab, Esc, Backspace, Ctrl+C, Ctrl+D, Ctrl+Z, and a Copy button
- **Shift toggle** — A dedicated Shift button in the quick-key bar. While active (highlighted), the next arrow key press sends a Shift+Arrow sequence to the shell (for text selection). The toggle deactivates automatically after one use
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

### 8.7 Touch Selection & Clipboard

Mobile-optimized text selection for the terminal viewport:

- **Long-press to select** — Press and hold (~400 ms) on terminal content to select the word at that position. Drag while holding to extend the selection
- **Selection handles** — Two draggable blue handles appear at the start and end of the selection. Drag either handle to adjust the selection boundary
- **CJK word selection** — Chinese, Japanese, and Korean wide characters are treated as word characters, so double-tap or long-press selects the full CJK word
- **Floating copy button** — A "Copy" popup appears above the selection. Tap to copy and dismiss
- **Custom right-click menu** — Right-clicking with a selection shows a custom context menu with a "Copy" option. With no selection, the browser's default context menu appears
- **Clipboard fallback** — When the Clipboard API is unavailable (e.g., HTTP over LAN without HTTPS), a `document.execCommand('copy')` fallback is used
- **Copy toolbar button** — The quick-key bar includes a Copy button that copies the current selection, or the entire terminal buffer if nothing is selected

### 8.8 CJK / IME Input

For users of Korean, Japanese, Chinese, and other languages that require an Input Method Editor:

- **Composition preview** — While composing (e.g., assembling Korean jamo), the in-progress text appears in the input bar without being sent to the shell
- **Commit on completion** — When the composition is finalized (pressing space, selecting a candidate, etc.), the composed text is sent to the shell and the input bar clears
- **Consecutive compositions** — Starting a new composition immediately after completing one preserves the initial characters of the new composition (no flash or loss)

