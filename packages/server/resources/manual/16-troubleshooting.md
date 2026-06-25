## 16. Troubleshooting

### 16.1 "Claude Code CLI not found"

Claude Code CLI must be installed and in your PATH:

```bash
claude --version
```

If not installed, follow the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code). The onboarding wizard checks CLI status automatically on first launch (see §1.3).

### 16.2 "Authentication required" / `claude login`

If the chat displays an authentication error, Claude Code needs to be logged in. Two options:

- **In-app** — Go to **Settings > Claude Account** and click **"Sign in to Claude"** to complete the OAuth flow without leaving Hammoc (see §13.14)
- **Terminal** — Run `claude login` in a terminal session

### 16.3 API rate limit exceeded

When Anthropic API rate limits are reached, the chat shows a rate limit error with a retry delay. Solutions:

1. Wait for the indicated retry period and try again
2. Reduce concurrent sessions or shorten prompts
3. Check your API usage / plan limits on the Anthropic console
4. The header status indicator shows API health (yellow triangle = API unavailable)

### 16.4 "Connection lost" / Reconnecting

Hammoc automatically reconnects when the connection is lost. The header shows a status indicator: green (connected), yellow spinning (reconnecting), or red (disconnected with manual Reconnect button).

On mobile, the app automatically recovers when returning from background.

If the connection doesn't recover:

1. Check that the server is still running
2. Click the Reconnect button in the header (appears when disconnected)
3. Refresh the browser
4. Restart the server: `hammoc` or `npm start`

### 16.5 Port already in use

The server automatically retries when the port is in use. If it still fails:

```bash
hammoc --port 3001
```

Or set the environment variable: `PORT=3001 hammoc`

### 16.6 Terminal not available

Terminal may be disabled when:

- Accessing from an external network (security restriction — only local IPs are allowed)
- `TERMINAL_ENABLED=false` is set in environment
- Maximum terminal sessions reached (default 10, configurable via `MAX_TERMINAL_SESSIONS`)

### 16.7 Reset password

If you forgot your password:

```bash
hammoc --reset-password
```

This prompts you to set a new password. Alternatively, delete `~/.hammoc/config.json` and restart the server to re-trigger the password setup flow in the browser.

### 16.8 Chat timeout

If Claude's responses are timing out:

1. Go to **Settings > Global** and adjust the **Chat Timeout** dropdown
2. Available values: 1 min, 3 min, 5 min (default), 10 min, 30 min
3. Complex tasks (large codebases, multi-file edits) may need longer timeouts
4. If the `CHAT_TIMEOUT_MS` environment variable is set, it overrides the UI setting (shown with an indicator)

### 16.9 Large file warning

Files over 1 MB display a truncation warning. Consider:

- Using the terminal to view large files
- Opening in an external editor
- Breaking large files into smaller ones

### 16.10 Data locations

If you need to find or back up your data:

| Data | Path |
|------|------|
| App config & password | `~/.hammoc/config.json` |
| User preferences | `~/.hammoc/preferences.json` |
| Queue templates | `<project-root>/.hammoc/queue-templates.json` (per project) |
| Chain failures | `~/.hammoc/chain-failures/<sessionId>.json` (per session) |
| Global snippets | `~/.hammoc/snippets/` (shared across all projects) |
| Project snippets | `<project-root>/.hammoc/snippets/` (per project) |
| Global harness items | `~/.claude/` (skills, agents, commands, hooks, `CLAUDE.md`, `.mcp.json`, `settings.json`) |
| Project harness items | `<project-root>/.claude/` (same layout as global; project takes precedence) |
| Session data | `~/.claude/projects/` |
| Web Push VAPID keys | `~/.hammoc/vapid-keys.json` |
| Web Push subscriptions | `~/.hammoc/push-subscriptions.json` |
| TLS certificates | `~/.hammoc/key.pem`, `~/.hammoc/cert.pem` |
| Manual shards (synced) | `~/.hammoc/docs/manual/` and `~/.hammoc/docs/.manual-version` (auto-synced from the npm package on server boot; agents read these via the absolute path embedded in the system prompt) |
| Internals docs (synced) | `~/.hammoc/docs/internals/` (agent-only mechanism reference; also re-synced when the package version changes) |
| Server logs | `./logs/server-YYYY-MM-DD.log` (daily log files in working directory) |
