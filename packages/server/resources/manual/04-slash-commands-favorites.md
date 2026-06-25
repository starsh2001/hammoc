## 4. Slash Commands & Favorites

### 4.1 Command Palette

Type `/` in the chat input to open the command palette:

- Browse available commands grouped by category — **Agents**, **Tasks**, **Skills**, **Slash Commands** (project / global / plugin `.claude/commands/*.md` files), and **Commands** (everything else)
- Filter by typing: `/test` shows commands containing "test"
- Commands are project-specific — loaded from the project's configured agents and tasks
- **Real-time refresh** — The command and skill list is fetched from the server each time the palette opens, reflecting newly added or removed commands
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

### 4.6 Prompt Snippets

Prompt snippets are reusable prompt templates stored as files. Invoke them with the `%` prefix in the chat input.

**Snippet storage (3-tier hierarchy, highest priority first):**

1. **Project snippets** — `.hammoc/snippets/` in the project directory
2. **Global snippets** — `~/.hammoc/snippets/`
3. **Bundled snippets** — Built-in snippets shipped with Hammoc (~22 standard snippets)

If the same snippet name exists in multiple tiers, the highest-priority source is used. You can override bundled snippets by placing a file with the same name in your project or global snippets directory.

**Snippet files:**
- Plain text files (optionally with `.md` extension)
- File name becomes the snippet name (e.g., `commit-and-done` or `commit-and-done.md`)
- Maximum file size: 100KB

**Bundled standard snippets include:**
- Workflow: `commit-and-done`, `mark-done`, `apply-qa-fixes`, `validate-and-approve`, `validate-and-fix`
- Issues: `quick-fix-issue`, `promote-issue`, `promote-to-story`, `promote-to-epic`
- Research: `brainstorm`, `competitor-analysis`, `market-research`, `create-prd`, `create-project-brief`
- Architecture: `create-backend-arch`, `create-frontend-arch`, `create-fullstack-arch`, `create-frontend-spec`
- Stories: `develop-story`, `draft-story`, `brownfield-create-story`, `brownfield-create-epic`
- QA: `qa-review`, `validate-story`

### 4.7 Snippet Autocomplete

Type `%` in the chat input to open the snippet autocomplete popup:

- **Grouped by source** — Sections labeled "Project", "Global", and "Bundled"
- **Preview** — Shows the first line of each snippet's content (up to 80 characters)
- **Expand full content** — Each row has a chevron (▸) toggle on the right; click it to reveal an inline, scrollable preview of the snippet's entire body in monospace, so you can confirm what you're inserting before committing to it. Only one snippet stays expanded at a time, and arrow-key navigation does not auto-expand — you expand on demand. Content is cached after the first load for instant reopen
- **Real-time filtering** — Type after `%` to filter by name or preview text (case-insensitive)
- **Keyboard navigation** — ArrowUp/Down to navigate, Enter or Tab to select, Escape to close
- **Click** to select a snippet
- **Real-time refresh** — The snippet list is fetched from the server each time the popup opens, reflecting any file changes

Selecting a snippet inserts `%snippet-name ` (with trailing space) into the input. Deduplication ensures only the highest-priority version of each snippet name appears.

### 4.8 Snippet Arguments & Context

Snippets support placeholder substitution for dynamic content.

**Positional arguments** (`{arg1}`, `{arg2}`, ...):

Arguments are space-separated after the snippet name:

```
%commit-and-done BS-2
```

If the snippet file contains `Commit changes for story {arg1}`, this resolves to `Commit changes for story BS-2`.

**Quoted arguments** — Use double quotes for multi-word arguments:

```
%promote-issue "Fix login button" critical bug
```

Here `{arg1}` = `Fix login button`, `{arg2}` = `critical`, `{arg3}` = `bug`. Inside quotes, use `\"` for literal quotes and `\\` for literal backslashes.

**Context blocks** (`{context}` + `---context`):

For injecting longer text into a snippet, add `---context` after the arguments followed by the content:

```
%quick-fix-issue docs/issues/ISSUE-1.md critical bug
---context
# Button fails on mobile
The login button doesn't render on iOS devices.
```

The text after `---context` replaces all `{context}` placeholders in the snippet.

**Unreferenced arguments** are ignored. Unreplaced placeholders remain as literal text.

### 4.9 Multi-Prompt Snippets

Snippets can contain multiple prompts separated by `---` on its own line:

```
*validate-story-draft {arg1}
---
Please fix all identified issues.
---
Mark as approved.
```

When invoked as `%validate-and-fix BS-2`:

1. The first prompt executes immediately as the chat message
2. Remaining prompts are added to the prompt chain queue (see §2.9) for sequential execution

The total number of chain items is subject to the 10-item chain limit.

**Usage in different contexts:**
- **Chat messages** — First prompt sent immediately, remaining prompts queued as chain items
- **Prompt chain** — All resolved prompts added as chain items
- **Queue scripts** — Snippet is expanded inline, with additional prompts spliced into the queue

