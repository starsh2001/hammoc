## 9. Queue Runner

The Queue Runner automates sequences of prompts for batch processing.

### 9.1 Queue Editor

The editor provides **syntax highlighting**:

- **Directives** (`@new`, `@pause`, etc.) — purple
- **Directive arguments** — teal
- **Multiline markers** (`@(`, `@)`) — blue
- **Comments** (`#`) — gray
- **Regular prompts** — default text color

A non-selectable **line-number gutter** runs down the left side, sticky during both vertical and horizontal scroll, so error messages like "parse error at line 47" become directly clickable without manual counting.

**Toolbar buttons:**
- **Run** (Play icon) — Start queue execution; also available via `Ctrl+Enter` / `Cmd+Enter`
- **Load File** (Upload icon) — Import a `.txt`, `.qlaude-queue`, or similar script file (max 1 MB). Useful for loading shipped sample templates such as the BMad story workflow (see §9.9)
- **Template** (FileText icon) — Open the template dialog (see §9.9)
- **Word Wrap** (WrapText icon) — Toggle line wrapping (persisted across sessions)

**Editor behavior:**
- **Validation warnings** displayed above the editor (e.g., missing arguments, unclosed multiline blocks, unknown directives). When more than one warning exists, only the **most recent** is shown with a `(+N)` count badge for the others — keeps the warning area from pushing the editor down on scripts with many issues
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
| `@pauseword "<keyword>"` | Set a keyword that auto-pauses the queue when found in Claude's response. Use `@pauseword ""` to clear |
| `@loop max=N [until="TOKEN"] [on_exceed="pause\|continue"]` | Start a loop block that repeats up to N times (see §9.5) |
| `@end` | End a loop block |
| `@label <name>` | Define a forward jump target (see §9.6) |
| `@jumpif "<token>" <label>` | Jump to `<label>` if the previous prompt response contains `<token>` (see §9.6) |
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

### 9.4 Pauseword

The `@pauseword` directive lets you set a keyword that automatically pauses queue execution when found in Claude's response.

```
@pauseword "DONE"
Implement the login feature
Fix any remaining issues
@pauseword ""
This prompt runs without pauseword
```

- **Set** — `@pauseword "KEYWORD"` activates the keyword for all subsequent items
- **Clear** — `@pauseword ""` (empty string) removes the active pauseword
- When Claude's response contains the keyword, the queue pauses for review
- The pauseword is snapshotted at the start of each prompt execution
- Quotes are required around the keyword; mismatched or empty quotes produce a validation warning

### 9.5 Loop Blocks

The `@loop`/`@end` directives create iterative workflows that repeat a block of prompts.

```
@loop max=5 until="SUCCESS" on_exceed="pause"
  Review the code for issues
  Fix any problems found
@end
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `max=N` | Yes | Maximum number of iterations (positive integer) |
| `until="TOKEN"` | No | Stop looping when this token appears in Claude's response |
| `on_exceed="pause\|continue"` | No | Action when max iterations reached without the until token (default: `pause`) |

**Behavior:**
- Each iteration executes all prompts inside the block sequentially
- If `until` token is detected in a response, the loop exits early
- When `max` is reached without the `until` token: `pause` halts for review, `continue` moves to the next queue item
- During execution, the banner shows loop progress (e.g., "Loop 2/5") with inner item tracking

### 9.6 Conditional Jump

The `@label` and `@jumpif` directives let you skip a range of queue items based on the previous prompt response. They are designed for fast-paths such as "if the QA gate already passed, skip the fix loop".

```
%qa-review {story_num}
@(
If the QA gate is PASS, write exactly QA_GATE_PASS as the last line.
@)
@jumpif "QA_GATE_PASS" qa_done

@loop max=5 until="QA_GATE_PASS" on_exceed="pause"
  %apply-qa-fixes {story_num}
  %qa-review {story_num}
  @(...QA_GATE_PASS check...@)
@end

@label qa_done

@new
%commit-and-done {story_num}
```

**`@label <name>`** — declares a jump target. The name must start with a letter or underscore and contain only letters, digits, underscore, or hyphen.

**`@jumpif "<token>" <label>`** — when reached, looks for `<token>` (substring match) in the response of the immediately preceding prompt. If found, the executor jumps directly to the matching `@label`, skipping every item in between. If not found, execution falls through to the next item.

**Rules:**
- **Forward only** — the target `@label` must appear later in the script than the `@jumpif`. Backward jumps are rejected with a parse warning.
- **Not allowed inside `@loop`** — both `@label` and `@jumpif` are rejected with a parse warning when nested inside a loop block. Use `until` for loop exit conditions instead.
- **Quoted token** — the token must be wrapped in double quotes and cannot contain spaces or be empty. Mismatched or missing quotes produce a parse warning.
- **Unique label names** — duplicate `@label` definitions emit a warning; only the first one is registered.
- **Missing target at parse time** — if the target label is never defined later in the script, a parse warning is emitted.
- **Missing target at runtime** — if the script is edited mid-run and the label disappears, the jump is silently skipped and execution falls through.

The token search uses a plain substring match against the previous prompt's complete response text, so prefer artificial single-word tokens like `QA_GATE_PASS` over natural phrases.

**Runner panel display** — In the queue runner item list, `@label` items show as `Label: <name>` and `@jumpif` items show as `Jump if: "<token>" → <target>`, so the control flow is easy to follow at a glance while the queue runs.

**`@new` boundary** — the "previous prompt response" buffer is **not** cleared by `@new`. It only updates when the next prompt actually runs. So a `@jumpif` placed immediately after `@new` (with no prompt in between) will still see the *previous* session's last prompt response. Place a real prompt between `@new` and `@jumpif` if you need a fresh evaluation.

**UI display of skipped items** — when a jump fires, the items between the `@jumpif` and its `@label` are not executed, but the runner panel currently shows them with the same green check icon as completed items. This is a cosmetic limitation; the items did not run and their session-link slots remain empty. The progress bar still advances correctly to the post-label position.

### 9.7 Running the Queue

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
   - **Pause** — Schedule a pause after the current item finishes. While an item is executing, this sets a "pause reservation" rather than pausing immediately. A **Cancel Pause** button appears to revoke the reservation before the item completes.
   - **Resume** — Shown during paused state; resumes execution from the next pending item
   - **Edit Script** — Shown during paused state; switches to the text editor with remaining items serialized as script text. Edit freely, then click **Apply** to replace pending items or **Cancel** to discard changes.
   - **Abort** — Always available (running or paused); requires confirmation
   - **"Go to Session"** link — Navigate to the active chat session
5. **Session links** — Completed items show a link icon to navigate to their associated session
6. **"Back to Editor"** button — Dismiss the runner panel after completion or error

**During execution (pending items only):**
- **Drag-and-drop reorder** — Drag pending items by the grip handle to reorder
- **Delete** — Click the trash icon to remove a pending item
- **Add** — Inline input at the bottom to add new items to the queue

### 9.8 Session Locking

While the queue is running, a **sticky banner** appears at the top of chat sessions:

- **Running** (blue) — Spinner + progress (current/total) + current prompt preview (desktop). Inside a `@loop` block, a loop badge shows iteration progress (e.g., "Loop 2/5")
- **Pause requested** (amber pulse) — Pause scheduled after current item finishes; cancel pause button shown
- **Waiting for input** (purple pulse) — Queue paused for permission approval or user question; respond in the session to continue
- **Paused** (amber) — Pause icon + progress; pause reason shown below if provided
- **Error-paused** (red) — Alert icon + error details
- **Completed** (green) — Checkmark + total count; dismissible with X button
- **Error-stopped** (red) — Error message + link to queue editor; dismissible

**Expandable item list:**
- When 2+ items exist, click the chevron to expand a scrollable list of all queue items with status indicators
- Currently executing items are highlighted; completed items appear with strikethrough text

**Banner controls:**
- **Pause / Cancel Pause / Resume / Abort** buttons directly in the banner (icon-only on mobile, icon+text on desktop)
- **"Queue Editor"** link — Navigate to the full queue editor (desktop only)
- **"Go to Session"** link — Navigate to the active queue session

**On other sessions:**
- A banner shows "Queue running in another session" with a link to navigate to it
- Other sessions remain fully accessible

### 9.9 Templates

Templates generate queue scripts by combining a template pattern with story selections from your project's PRD.

**Template Dialog** (opened via FileText icon in toolbar):

The dialog has two main sections:

**1. Template Source** — Three tabs:
- **Input** — Type template text directly in the editor with word wrap toggle; variable hint shown: `{story_num}, {epic_num}, {story_index}, {story_title}, {date}`
- **File** — Upload a `.txt` or `.qlaude-queue` file (max 100KB) via drag area
- **Saved** — Browse, select, edit, or delete previously saved templates

**2. Story Selection** — Stories extracted from your PRD:
- Grouped by epic with collapsible sections and checkbox selection
- **Select All / Deselect All** toggle
- **"Pause between epics"** checkbox — Inserts `@pause` between different epic groups
- Each epic header shows selected/total count

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
- Templates are saved per-project

**Bundled sample template:**

The Hammoc git repository ships a ready-to-use BMad story workflow template at `docs/queue-templates/bmad-story-workflow.qlaude-queue`. It drives a single story through Draft → Validate → Develop → QA Review → Commit and uses `@label` / `@jumpif` (see §9.6) so a first-pass QA PASS skips the fix loop entirely. To use it, download the file from the GitHub repository and import it via the **Load File** toolbar button, or paste its contents into the editor. The `{story_num}` placeholder must be replaced before running.

### 9.10 Queue Status Badge

A badge on the project card and session list shows queue status:

- **Running** — Blue badge with play icon
- **Paused** — Amber badge with pause icon
- **Error** — Red badge with alert icon
- **Idle** — No badge shown

