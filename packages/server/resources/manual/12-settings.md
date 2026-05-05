## 12. Settings

Access settings via the gear icon or the Settings page. The page has **8 tabs**: Global, Project, Notifications, Claude Account, Hammoc User, Advanced, Help, and About. On desktop, tabs appear as a sidebar; on mobile, they use an accordion layout.

### 12.1 Theme

- **Dark** — Dark background, light text (default)
- **Light** — Warm gray background, dark text
- **System** — Follows your OS/browser preference

### 12.2 Language

Hammoc supports 6 languages:

- English
- 中文(简体) (Chinese Simplified)
- 日本語 (Japanese)
- 한국어 (Korean)
- Español (Spanish)
- Português (Portuguese)

Language is auto-detected from your browser settings. Override it manually in settings.

### 12.3 Default Model

Choose the default Claude model:

**Default:**
- **Default** — Uses the SDK/system default model

**Aliases (always latest version):**
- **Sonnet** — Latest Sonnet
- **Opus** — Latest Opus
- **Haiku** — Latest Haiku

**Claude 4.x:**
- Opus 4.7 (most capable, 1M context), 4.6, 4.5, 4.1, 4
- Sonnet 4.5, 4
- Haiku 4.5

**Claude 3.x:**
- Sonnet 3.7, 3.5
- Haiku 3.5
- Opus 3, Sonnet 3, Haiku 3

Can be overridden per-project (see §12.8).

### 12.4 Default Permission Mode

Set how Claude handles file modifications:

| Mode | Behavior |
|------|----------|
| **Last Used** | Keeps the permission mode from the previous session |
| **Plan** | Claude plans but doesn't make changes |
| **Ask before edits** | Claude asks for approval before each change (default) |
| **Edit automatically** | Claude edits files automatically |
| **Bypass permissions** | Full autonomy, no restrictions |

**Auto-approve safety checks** — When Bypass mode is selected, a checkbox option appears to automatically approve CLI safety check prompts without user confirmation. Enabled by default.

Can be overridden per-project (see §12.8). Quick-cycle with `Shift+Tab` when the chat input is focused.

### 12.5 Markdown File Open Mode

Choose how `.md` files open by default:

- **Edit** — Opens in text editing mode
- **Preview** — Opens in rendered preview mode

### 12.6 File Explorer View

Default view for the file explorer:

- **Grid** — Icon-based Finder-style layout (default)
- **List** — Traditional file list

### 12.7 Layout Mode

Control the overall page width:

- **Narrow** — Content centered with a max width
- **Wide** — Full-width layout using all available screen space

Toggle via the layout button in the header.

### 12.8 Project Settings

Override global settings on a per-project basis:

1. Select a project from the **dropdown** (defaults to the currently active project)
2. Configure overrides:
   - **Model override** — Choose a specific model or "Use global default"
   - **Permission mode override** — Plan, Ask before edits, or Edit automatically (or use global default). Note: Bypass permissions is not available at project level
   - **Hide in sidebar** — Toggle to hide the project from the sidebar navigation
3. **Reset to Global Defaults** — Clears all project-level overrides (with confirmation). Only enabled when overrides exist

Active overrides are indicated with a blue "Project override" label next to each setting.

### 12.9 Chat Timeout

How long to wait for Claude's response:

- 1 minute
- 3 minutes
- **5 minutes** (default)
- 10 minutes
- 30 minutes

The timeout resets on every activity. If overridden by an environment variable, the field is disabled with an amber warning.

### 12.10 Default Thinking Effort

Set the default thinking effort for new sessions:

- **SDK Default** / Low / Medium / High / XHigh / Max
- Max is available on Opus 4.6, Sonnet 4.6, and Opus 4.7
- XHigh is available only on Opus 4.7 (and is the SDK default for that model)
- If the active model does not support the configured level, it falls back to High automatically — the saved preference is kept, only the request to the SDK is clamped

### 12.11 Quick Panel Defaults

- **Default Open** — Whether the quick panel opens automatically when entering a chat page (default: On)
- **Default Side** — Which side the quick panel appears on:
  - **Left** — Always opens on the left
  - **Right** — Always opens on the right (default)
  - **Last Used** — Remembers the last side you used and restores it

### 12.12 Notifications

The Notifications tab contains two sections: Web Push and Telegram.

#### 12.12.1 Web Push Notifications

Receive browser push notifications when Claude needs attention. Requires HTTPS and a browser that supports the Push API (Chrome, Firefox, Edge, Safari 16+).

- **Subscribe** — Register the current browser to receive push notifications (requests browser notification permission)
- **Unsubscribe** — Remove the current browser's push subscription
- **Enable toggle** — Master switch to enable or disable web push delivery
- **Subscribed devices** — Shows the number of browsers currently registered
- **Test** — Send a test push notification to verify setup

> iOS: Add Hammoc to Home Screen first, then subscribe from within the PWA.

#### 12.12.2 Telegram Notifications

Get notified on your phone when Claude needs attention:

**Setup:**
1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) — enter the Bot Token
2. Get your Chat ID via [@userinfobot](https://t.me/userinfobot) — enter the Chat ID
3. Both fields support **change** and **delete** operations; bot tokens are shown **masked** for security

**Enable/Disable:**
- Master **enable checkbox** — requires both Bot Token and Chat ID to be configured before it can be toggled on

**Chat Notification Types:**
- **Permission requests** — Claude needs approval for file changes
- **Completion** — Chat task finished
- **Error** — Something went wrong during chat

**Queue Notification Types:**
- **Queue start** — Queue execution began
- **Queue complete** — Queue finished all items
- **Queue error** — Queue encountered an error
- **Queue input needed** — Queue paused, waiting for user input

**Other Options:**
- **Always notify** — Get notified for every message (suppressed when the session is visible in the browser)

**Test:** Click "Send Test" to verify your configuration.

**Access URL:** Set your Hammoc base URL (e.g., `http://192.168.1.100:3000`) so notification links open directly in your browser.

**Environment Variables:** Bot Token and Chat ID can be set via environment variables, which take priority over saved values (shown with an amber "Env" indicator).

### 12.13 Claude Account

Shows the Claude Code account that Hammoc is using, plus live subscription usage:

- **Account info** — Email, Subscription plan, Provider (e.g., Claude API / Claude.ai), Organization (if applicable), and the timestamp of the last fetch
- **Usage bars** — Two progress bars showing consumption of the **5-hour window** and **7-day window** quotas, with color thresholds (green / yellow / red at 50% / 80%) and reset times
- **Refresh** — Manually fetch the latest account info and usage from the API (spinner shown while refreshing). Toast confirms success or failure
- If no data has been fetched yet, a helper line explains that account info fills in automatically after the first chat or after clicking Refresh

### 12.14 Hammoc User

Local Hammoc authentication (independent of your Claude Code account):

- **Change password** — Enter your current password, new password, and confirm. Minimum 4 characters. After changing, you'll be signed out and redirected to the login page.
- **Logout** — Sign out immediately.

### 12.15 System Prompt

Customize Claude's behavior with a fully editable system prompt template:

- **Warning banner** — Displayed at the top, cautioning about the impact of modifications
- **Editable textarea** — Edit the system prompt with **auto-save**
- **Character count** — Shown below the editor
- **"Customized" indicator** — Blue banner when a custom prompt is active
- **Restore to Default** button — Appears when the prompt has been modified
- **Template variables** — Listed below the editor with descriptions (e.g., `{gitBranch}`, `{gitMainBranch}`, `{gitStatus}`); variables are resolved at runtime
- **Resolved preview** — Toggle to see the fully rendered prompt with variables replaced for the current project

### 12.16 Advanced Settings

**Server Management (mode-dependent):**

- **Development mode:** "Server Rebuild" button — rebuilds and restarts the server. Shows elapsed time during the build process
- **Production mode:** Shows current version number, "Check for Updates" button, and "Install Update" button (appears only when an update is available). Includes build progress with elapsed timer

**File Checkpointing:**
- **Chat sessions** — Save file snapshots during chat for rewind/restore (default: on). Disabling this prevents the Code Rewind feature (see §2.20) from working
- **Queue runner** — Save file snapshots during queue execution (default: off). Enabling increases JSONL session file size

**SDK Parameters:**
- **Max Thinking Tokens** — Limit Claude's extended thinking tokens (1,024–128,000)
- **Max Turns** — Limit conversation turns per query (1–100)
- **Max Budget (USD)** — Set cost limit per query ($0.01–$100)

> **Scope (as of v1.3.0)**: these SDK parameters now apply to **both** direct chat sends and Queue Runner executions. Earlier releases silently dropped them in the queue path — if your queue runs started honoring Max Turns or Max Thinking Tokens after upgrading, this is why. Adjust the values if the new behavior surprises you.

### 12.17 Help

In-app usage guide within the Settings page:

- **Basic chat usage** — How to use the chat interface
- **Slash commands** — Available command reference
- **Permission mode guide** — Plan, Ask Before Edits, Edit Automatically explained
- **BMad Method** — Quick guide to the BMad workflow
- **Keyboard shortcuts** — Key bindings table (Enter, Shift+Enter, Escape, Ctrl+C, F7/Shift+F7, /)

### 12.18 About

Displays app information:

- App name and version number
- Project description
- Author with link
- License type
- **GitHub Issues** link
- **Server status** — Healthy/unhealthy with color indicator dot
- **Server version**
- **Server time** — Localized timestamp

