## 15. Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address (all interfaces) |
| `NODE_ENV` | — | Set to `production` for optimized mode |
| `TRUST_PROXY` | `false` | Enable reverse proxy support. Set to `true` when behind Cloudflare Tunnel, nginx, etc. |
| `CORS_ORIGIN` | `true` | CORS origin policy. `true` allows any origin (local/VPN use). Set a specific URL (e.g., `https://hammoc.example.com`) to restrict |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (required for Claude Code to function) |
| `CHAT_TIMEOUT_MS` | `300000` | Chat response timeout in milliseconds (5 minutes). Overrides the Settings UI value |
| `LOG_LEVEL` | `INFO` (prod) / `DEBUG` (dev) | Logging level: ERROR, WARN, INFO, DEBUG, VERBOSE |
| `TERMINAL_ENABLED` | `true` | Enable/disable terminal feature (set `false` to disable). Overrides the Settings UI value |
| `SHELL_TIMEOUT` | `30000` | Time (in ms) before an idle terminal session is cleaned up |
| `MAX_TERMINAL_SESSIONS` | `10` | Maximum concurrent terminal sessions |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (takes priority over Settings UI value) |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID (takes priority over Settings UI value) |
| `BASE_URL` | — | Fallback base URL for Telegram notification links (e.g., `http://192.168.1.100:3000`) |

### Client (Vite)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_PORT` | `3000` | Server port the client connects to (useful for multi-instance setups) |
| `VITE_LOG_LEVEL` | — | Client-side debug log level: ERROR, WARN, INFO, DEBUG, VERBOSE |

