## 6. File Explorer & Editor

### 6.1 File Explorer

Access the file explorer from the sidebar tab. Toggle between views with the toolbar button:

**Grid View (Finder-style, default)**
- Icon-based card display with folder/file icons
- Click folders to navigate in, click files to open
- ".." entry to navigate to parent directory
- Breadcrumb navigation at the top

**List View (hierarchical tree)**
- Recursive tree with expand/collapse chevrons
- Lazy-loaded subdirectories
- Sorted by type (folders first) then by name
- Keyboard navigation: ArrowUp/Down/Left/Right, Enter, Home/End

**Context Menu** (right-click or ⋮ button on hover)
- **New File** / **New Folder** — Creates via inline input
- **Copy** / **Cut** / **Paste** — Copy or move files and folders within the project
- **Download** — Download individual files (files only)
- **Rename** — Inline renaming
- **Delete** — With confirmation dialog

**File Upload**
- Drag and drop files from your OS into the Grid view to upload them
- Paste files from clipboard (`Ctrl+V`) while the file explorer is focused

**Toolbar**
- **Search** — File search with real-time filtering
- **Hidden files** — Toggle visibility of ignored patterns (`.git`, `node_modules`, `.env`, `dist`, etc.)
- **View toggle** — Switch between Grid and List views
- **Open in OS explorer** — Opens the project folder in your OS file manager (Explorer, Finder, etc.). Only shown when accessing via localhost
- Default view mode configurable in settings

### 6.2 Text Editor

Click any text file to open it in the built-in editor:

- **Syntax highlighting** — Language-aware (detected from file extension)
- **Line numbers** and **active line highlighting**
- **Save** — `Ctrl+S` / `Cmd+S` or the save button
- **Close** — `Escape` key or the X button
- **Unsaved changes warning** — Confirmation dialog prevents accidental data loss
- **File size limit** — Files over 1MB are truncated and read-only
- **Binary files** — When a binary file is opened (images, PDFs, executables, etc.), the editor body shows the file's human-readable size (e.g., `104 B`, `5.0 MB`) together with a **Download** button for direct download

**External change detection**

The server watches open files and pushes a notification if the file changes on disk outside Hammoc. An alert banner appears above the editor:

- **File modified on disk (clean editor)** — Amber banner with **Reload** (re-read from disk) and **Dismiss** (keep current view)
- **File modified on disk (with unsaved edits)** — Amber banner warning that saving will overwrite the external changes; same Reload / Dismiss buttons
- **File deleted on disk** — Red banner with a **Dismiss** button (no reload is possible)
- **Stale-write conflict** — If you try to save a file that was modified on disk since you opened it, the save is rejected and a red banner offers **Reload** (discard your edits) or **Overwrite** (force-save over the external changes)

### 6.3 Markdown Preview

For `.md` files:

- Toggle between **Edit** and **Preview** modes via the header button
- Preview renders full markdown with styles
- Default mode (Edit or Preview) configurable in settings

### 6.4 Image Viewer

Click any image file to open the viewer in a fullscreen overlay:

- **Zoom in/out** — Button controls or mouse wheel scroll (wheel zoom cancels any active fit mode)
- **Drag to pan** — Click and drag to move the image. Pan position is clamped so the zoomed image cannot be dragged completely off-screen
- **Zoom percentage** — Displayed between zoom buttons
- **Fit controls** — Header buttons for **Actual size (100%)**, **Fit to screen**, **Fit to width**, and **Fit to height**. The active fit mode is cleared when you manually zoom with the wheel
- **Touch gestures** (mobile / touchscreen):
  - **Pinch** with two fingers to zoom. The zoom is anchored at the midpoint between the two fingers so the content under your fingers stays put
  - **One-finger drag** pans the image when it's zoomed in (with edge clamping)
  - **One-finger horizontal swipe** (when the image fits on screen) navigates to the previous / next image in the set. A swipe needs to exceed roughly 50 px horizontally and be more horizontal than vertical to trigger
- **Multi-image navigation** — When multiple images are available (a chat message with multiple attachments, **or a file-explorer image opened from a folder containing other images**), they form a navigable set. Left/right arrow keys move between images and zoom resets to fit on each change. The header shows the current position (e.g., `filename (2/5)`)
- **Close** — `Escape` key or the X button
- Supports PNG, JPEG, GIF, WebP, SVG, BMP, ICO

### 6.5 Quick File Panel

Access files without leaving the chat:

- Open the quick panel and switch to the Files tab
- **Recently opened** files appear at the top (max 5 per session)
- Search and navigate the file tree
- Click to open in the editor overlay

