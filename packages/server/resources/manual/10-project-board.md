## 10. Project Board

Visual task and issue management for your projects. The board displays three card types: Issues, Stories, and Epics.

### 10.1 Kanban Board

The default view is a scrollable Kanban board:

- **Columns** represent statuses — each with a colored top border, label, and item count badge
- **Cards** display issues, stories, and epics with type badges: **[I]** (amber), **[S]** (blue), **[E]** (purple)
- **Horizontal scroll** — overflow columns peek from the edge (no drag-and-drop between columns). On desktop, vertical mouse wheel scrolling in empty column areas is automatically converted to horizontal scroll
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

Status is automatically set to **Open** (not a user-editable field). Each issue is assigned a sequential ID in the **ISSUE-N** format (e.g., ISSUE-1, ISSUE-2) automatically.

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

Items follow this lifecycle. Issues and stories use overlapping but distinct subsets of these statuses:

**Issue statuses:**
```
Open → In Progress → Ready for Done → Done → Closed
                                               ↓
                                           Promoted
```

**Story statuses (with QA gate):**
```
Draft → Approved → In Progress → Ready for Review → Done
                                       ↓
                              ┌────────┴────────┐
                          QA Passed          QA Failed
                          QA Waived          QA Concerns
                              ↓                  ↓
                        Ready for Done     QA Fixed → (re-review)
```

**QA gate badges** — When a story reaches "Ready for Review", the QA gate result determines the compound badge:
- **QA Passed** — Quality review passed
- **QA Waived** — Quality review waived/skipped
- **QA Failed** — Quality review failed, fixes needed
- **QA Concerns** — Quality review raised concerns
- **QA Fixed** — The developer has recorded a fix for the current gate; ready for re-review

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

**Issue actions (by status):**
- **Open:**
  - **Quick Fix** — Marks the issue as Done and opens a dev session with the issue context
  - **Promote to Story** — Convert an issue into a development story (disabled if already linked)
  - **Promote to Epic** — Elevate an issue into an epic (disabled if already linked)
  - **Edit** — Open the issue edit dialog
  - **Close** — Close the issue
- **In Progress:**
  - **Resume Dev** — Resume development session for this issue
- **Ready for Done:**
  - **Commit and Mark Done** — Commit related changes and mark as Done
  - **Mark Done** — Mark as Done without committing
- **Closed / Done / Promoted:**
  - **Reopen** — Reopen the issue
- **Delete** — Permanently remove the issue (available in all states)

**Story actions (by status):**
- **Draft:**
  - **Validate and Fix** — Validate the story draft and fix issues
  - **Validate Only** — Validate the story draft without fix
- **Approved:**
  - **Start Development** — Begin implementing the story
  - **Validate and Fix** / **Validate Only** — Re-validate if needed
- **In Progress:**
  - **Resume Development** — Continue implementing the story
- **QA Passed / QA Waived:**
  - **Commit and Complete Story** — Commit related changes and mark as Done
  - **Complete Story** — Mark as Done without committing
  - **Request QA Review** — Re-request quality review
- **QA Failed / QA Concerns:**
  - **Apply QA Fix** — Apply fixes for QA issues (always offered)
  - **Review Story** — Re-request QA review; also offered unless Hammoc has confirmed fixes are still pending for the current gate (e.g., legacy stories or external BMad projects)
- **QA Fixed:**
  - **Apply QA Fix** / **Review Story** — Apply further fixes, or request re-review
- **Ready for Review / Ready for Done (no QA gate):**
  - **Review Story** — Request quality review

**Epic actions:**
- **View Sub-Stories** — Open a dialog showing all stories under the epic
- **Create Next Story** — Draft the next story for this epic with the SM agent (hidden when the epic is Done)

The menu supports keyboard navigation (Arrow Up/Down, Enter, Escape).

### 10.10 Card Behavior

Cards display information based on their type:

- **Type badge** — [I], [S], or [E] with color coding
- **Severity badge** — For issues only, color-coded by level
- **Status badge** — Color-coded status indicator (stories also show QA gate badges such as QA Passed, QA Failed, etc.)
- **Issue number prefix** — Issues now show a short `#N` prefix (e.g., `#1`, `#42`) in monospace gray immediately before the title, so a board card and a chat mention or filename like `ISSUE-42.md` can be matched at a glance. Legacy issues without an `ISSUE-N` ID do not get a prefix
- **Epic progress bar** — On epic cards, shows completion percentage with done/total count
- **Story epic number** — Shows the parent epic reference
- **Unmapped status warning** — ⚠ triangle icon when a card's status doesn't map to any column

**Click behavior:** Clicking a card navigates to its associated file in the development session.

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
- Map statuses and QA gate badges (Open, Draft, Approved, In Progress, Blocked, Ready for Review, QA Passed, QA Waived, QA Failed, QA Concerns, QA Fixed, Ready for Done, Done, Closed, Promoted) to columns
- **Custom status mapping** — Define additional custom status strings and assign them to columns

**Reset:**
- **Reset to defaults** button restores the original column layout (with confirmation dialog)

### 10.12 Mobile Kanban

On small screens, the board uses a swipe carousel:

- **Swipe left/right** to navigate between columns
- **Rubber-band resistance** at the first and last columns (cannot swipe past edges)
- **Indicator dots** at the bottom show current position
- Smooth transition animation between columns
- Touch-optimized card layout

