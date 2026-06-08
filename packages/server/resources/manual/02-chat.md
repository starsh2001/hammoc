## 2. Chat

The chat interface is the core of Hammoc. It provides a rich, real-time conversation experience with Claude.

### 2.1 Sending Messages

- Type your message in the input area at the bottom
- **Desktop**: Press `Enter` to send, `Shift+Enter` for a new line
- **Mobile**: Press `Enter` for a new line, tap the send button to send
- The input area auto-expands as you type

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

**HTML support:**
- Inline HTML tags are rendered alongside markdown (e.g., `<div>`, `<span>`, `<table>`)
- Dangerous elements (`<script>`, `<iframe>`, `<style>`, event handlers) are automatically stripped for XSS protection

**Relative path resolution:**
- File links and image references in markdown resolve relative to the source file's directory
- Parent traversal (`../`) is supported (e.g., `../../config.json` navigates up two levels)
- Clicking resolved file links opens them in the text editor; images open in the image viewer

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
- Sent images display as clickable thumbnails above the message text. Clicking a thumbnail opens the full image viewer with multi-image navigation (see §6.4)
- Image attachments work with both conversation engines (SDK and CLI). With the CLI engine the image is passed to Claude by file reference instead of being embedded inline, but you attach it exactly the same way — the model still sees it

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
- **Large file handling** — Very large files are handled with optimized rendering
- **Responsive layout** — Automatically switches between side-by-side and inline modes based on screen width (768px breakpoint)
- **Manual layout toggle** — A toggle button in the viewer header (Columns2 / Rows2 icon) lets you force side-by-side or inline. The choice is persisted per user and overrides the responsive default until reset

### 2.8 Permission Requests

Depending on your permission mode, Claude may ask for approval before modifying files:

- **Approve** — Allow the change
- **Reject** — Block the change
- View the diff before deciding
- See the list of requested permissions

### 2.9 Prompt Chaining

Queue multiple prompts for sequential execution. Chain state is managed server-side, enabling multi-browser sync and background execution.

1. Toggle **chain mode** ON via the chain button (link icon next to send) or hold `Ctrl`
2. Type your first prompt and send it — the send button label changes to **"Add to chain"**
3. While Claude is responding, type the next prompt and send — it enters the chain
4. Up to **10** prompts can be queued
5. A **violet banner** shows the chain status:
   - **Collapsed mode** — First prompt preview + "+N" count indicator
   - **Expanded mode** — Full list with individual **Remove** buttons (click to expand when 2+ items)
   - **Drag-and-drop reorder** — In the expanded list, grab the grip handle (GripVertical icon) on the left of any pending item to drag it up or down. Items that are actively sending show a spinner instead of a grip and cannot be moved
   - **Cancel all** — Clear the entire chain
6. Each prompt auto-executes when the previous one completes

**Server-side features:**
- **Multi-browser sync** — Chain state is synchronized across all browser tabs/windows
- **Background execution** — Chain continues running even if all browsers are closed
- **Auto-retry** — Failed items are automatically retried before being marked as failed

### 2.10 Context Usage

Monitor token usage in real-time:

- **Usage donut** — Visual indicator showing used/limit tokens and percentage
- **Cost display** — Estimated cost for the session
- **Cache tokens** — Cache creation and read token counts
- **Rate limit dots** — 5h/7d utilization indicators in the input area
- **Color thresholds** — Green (normal), Yellow (moderate), Red (high usage)
- **Context compaction** — Click the usage donut to trigger compaction, which summarizes the conversation to free up context space. At critical usage levels, clicking instead creates a new session
- **Auto-compact on overflow** — When message history hits the context window limit, Hammoc automatically compacts the context and retries the message instead of losing the session

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
- **Visual indicator** — Green indicator while actively listening
- **Language-aware** — Automatically matches the app's language setting (English, Korean, Chinese, Japanese, Spanish, Portuguese)
- Recognized text is added to the current input without replacing existing text
- **Auto-stop** — Voice recognition stops automatically when sending a message or when the session becomes locked
- **Error handling** — Toast notification shown if microphone access is denied or recognition fails

### 2.14 Extended Thinking

When Claude uses extended thinking, the reasoning is shown in a collapsible block:

- Click to expand/collapse
- Thinking content is visually distinct from the main response
- Useful for understanding Claude's decision-making process

### 2.15 Model Selector

The model selector button is located in the chat input toolbar. It displays the current model family name (e.g., "Opus", "Sonnet", "Haiku") directly on the button. When using the default model, it shows "Default". Click to open a dropdown for choosing a different model and adjusting thinking effort.

**1M context window** — For models that support a 1-million-token context window (Opus 4.8, Sonnet 4.6), a **"1M context"** toggle appears near the top of the dropdown:

- **Opus** — Locked on. The 1M window is included with your Max subscription at no extra cost, so it is always engaged and cannot be switched off (the toggle shows "Included with Max").
- **Sonnet** (and other non-Opus 1M-capable models) — Off by default. Sonnet's 1M window bills to usage credits rather than your subscription, so you opt in explicitly. The toggle shows a "Requires usage credits" hint that turns amber once enabled. Left off, Sonnet runs at the standard 200K context window.

The toggle only appears for 1M-capable models; every other model uses its native context window and shows no toggle.

### 2.16 Thinking Effort

Control how much Claude "thinks" before responding. The intensity bar appears inside the model selector dropdown. The number of bars depends on the selected model:

- **Low / Medium / High** — 3 levels, available for all models
- **Max** — 4th level, added for Opus 4.6 / Sonnet 4.6
- **XHigh** — 5th level, added for **Opus 4.7+** (the default effort for these models is XHigh)

Behavior:

- Click the currently active level again to reset to default
- Cannot be changed while Claude is responding
- If you switch to a model that doesn't support the current level (e.g., XHigh → model without XHigh, or Max → model without Max), the effort automatically resets to the highest supported level
- When the active model is temporarily unknown (e.g., right after switching projects before the resolved model arrives), the dropdown keeps your saved choice instead of resetting it. As soon as the model is known, the effort is reclamped if necessary

The default thinking effort for new sessions can be configured in Settings > Global.

### 2.17 Message Actions

Each message has an action bar that appears at its bottom-right corner. Available actions depend on the message type:

**On all messages:**
- **Copy** — Copy the message text to clipboard

**On user messages:**
- **Edit** — Open an inline editor to modify the message (see §2.18)
- **Summarize & Continue** — Generate an AI summary of the conversation up to that point (see §2.19)
- **Rewind Code** — Restore the codebase to the state it was in when this message was sent (see §2.20)

**On assistant messages:**
- **Fork** — Create a new session branching from this response (see §2.21)

All action buttons are disabled during streaming, and while another action (edit, rewind, summarize) is in progress. Actions are also disabled when viewing an old branch or in branch viewer mode (see §2.23).

### 2.18 Message Edit

Edit a previously sent user message to explore a different conversation path:

1. Click the **Edit** button (pencil icon) on a user message
2. The message transforms into an editable textarea with the original text
3. Modify the text, then:
   - **Accept** (checkmark button or `Ctrl+Enter`) — Send the edited message. Claude responds to the new version, creating a new conversation branch
   - **Cancel** (X button or `Escape`) — Discard changes
4. Empty messages cannot be submitted

After editing, you can navigate between the original and edited branches using branch pagination (see §2.22).

### 2.19 Summarize & Continue

Compress a long conversation into a summary to free up context space while continuing the session:

1. Click the **Summarize & Continue** button (sparkles icon) on a user message
2. AI generates a summary of the conversation up to that point (spinner shown during generation)
3. To cancel mid-generation, click the button again (shows X on hover)
4. When complete, the inline edit form opens with the generated summary pre-filled
5. Review, edit if needed, then **Accept** to continue with the summary or **Cancel** to discard

### 2.20 Code Rewind

Revert project files to a previous state in the conversation:

1. Click the **Rewind Code** button (undo icon) on a user message
2. A dry-run preview shows how many files will change (insertions/deletions count)
3. Review the file list and click **Rewind** to confirm, or **Cancel** to abort
4. On success, a toast confirms the number of files restored

If no checkpoint is available for that message, or the code is already at that state, an error message is shown.

### 2.21 Session Fork

Branch into a completely new session from any assistant response:

1. Click the **Fork** button (git-fork icon) on an assistant message
2. A dialog appears with an optional message field (defaults to "Continue from here")
3. Click **Fork** to create the new session
4. The new session starts with the full conversation history up to that point, plus your fork message
5. You are automatically navigated to the new session

The original session remains unchanged.

### 2.22 Conversation Branching

When you edit a message, the conversation splits into branches. Branch pagination controls appear at the bottom-left of user messages that have multiple branches:

- **← / →** arrows to navigate between branches
- **"X / Y"** indicator showing current branch number and total count
- Keyboard: **Left/Right arrow keys** to navigate (when the pagination is focused)
- Navigation is disabled during streaming

Switching branches replaces all messages from that point forward with the selected branch's history.

### 2.23 Branch Viewer

Browse all conversation branches in a read-only mode:

1. Click the **branch history button** (git-branch icon) in the chat header — only visible when the session has branches
2. The chat enters read-only mode:
   - Branch pagination controls become active at every branch point
   - Navigate freely between branches using ← / → arrows
   - The input area shows "Branch viewer mode (read-only)"
   - All message actions (edit, rewind, summarize, fork) are disabled
3. Click **"Exit branch viewer"** in the header to return to the active conversation

### 2.24 Max Budget Warning Banner

When the **Max Budget (USD)** advanced setting (see §13.17) is configured, a sticky banner appears at the top of the chat area once the session cost approaches the limit:

- **Yellow warning** (80% threshold) — "Budget warning: $X.XXXX / $Y.YYYY used (ZZ%) — approaching Max Budget limit."
- **Red critical warning** (95% threshold) — "Budget critical: $X.XXXX / $Y.YYYY used (ZZ%) — stream will auto-stop when limit is exceeded."
- Cost is shown to 4 decimal places
- The banner is informational; the SDK auto-stops the stream once the limit is actually crossed

The banner disappears automatically once the running cost falls back below the warning threshold (for example, after starting a new session).

