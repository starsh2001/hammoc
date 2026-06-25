## 1. Getting Started

### 1.1 Installation

**Option A: Run with npx (no install)**

```bash
npx hammoc
```

**Option B: Global install**

```bash
npm install -g hammoc
hammoc
```

**Option C: From source (development)**

```bash
git clone https://github.com/starsh2001/hammoc.git
cd hammoc
npm install
npm run dev
```

### 1.2 System Requirements

- **Node.js** >= 18.0.0 (v22 LTS recommended)
- **Claude Code CLI** installed and authenticated
- Modern browser (Chrome, Firefox, Safari, Edge)

### 1.3 First Launch

Open http://localhost:3000 in your browser. A multi-step onboarding wizard walks you through initial setup. Steps that are already configured are automatically skipped — returning users go straight to the login screen.

1. **Display Name** — Optionally set a name for the AI to use when addressing you (can also be changed later in Settings, see §13.12). Click **Next** or **Skip**
2. **Password** — Set an admin password (minimum 4 characters) to protect your instance. On return visits this step becomes a login screen instead. After too many failed attempts, login is temporarily locked with a countdown timer
3. **Auth Method** — Choose how to connect to Claude:
   - **Claude subscription** — Sign in with a Pro, Max, Team, or Enterprise account. An OAuth flow opens the authorization page in a new tab; copy the authorization code back into the wizard to complete sign-in
   - **API key** — Enter an Anthropic API key directly (format: `sk-ant-...`)
4. **First Project** — Enter a project directory path or click **Browse** to pick a folder visually (see §5.2 for the directory picker). Click **Skip** to add a project later
5. **All Set** — Confirmation screen with auto-redirect to the home page

Use the **Back** button or `Escape` to return to a previous step at any time.

### 1.4 Mobile Access

Hammoc is fully responsive. From any device on the same network:

```
http://<your-computer-ip>:3000
```

- Desktop: Enter sends message, Shift+Enter for new line
- Mobile (touch devices): Enter adds new line, tap the send button to send
- **Pull-to-refresh**: Swipe down on the session list to refresh

### 1.5 CLI Options

```bash
hammoc --port 8080          # Custom port
hammoc --host localhost     # Bind to localhost only
hammoc --trust-proxy        # Enable reverse proxy support
hammoc --cors-origin <url>  # Restrict CORS to specific origin
hammoc --reset-password     # Reset admin password
hammoc --version            # Show version
hammoc --help               # Show help
```

All options are also available as environment variables (see [Environment Variables](#14-environment-variables)).

### 1.6 Remote Access (Reverse Proxy)

If you need to expose Hammoc through a reverse proxy (Cloudflare Tunnel, nginx, etc.), use `--trust-proxy` and `--cors-origin`:

```bash
npx hammoc --trust-proxy --cors-origin https://hammoc.yourdomain.com
```

**What `--trust-proxy` enables:**
- Reads real client IP from proxy headers for access control (e.g. localhost-only endpoints)
- Sets session cookies with `Secure` flag (HTTPS-only)

**What `--cors-origin` does:**
- Restricts cross-origin requests to the specified URL only
- Without it, any website can make authenticated requests to your Hammoc instance

**Security features (always active, no configuration needed):**
- Security headers (CSP, X-Frame-Options, HSTS, etc.)
- Server management APIs (restart, update) restricted to localhost only
- Terminal access restricted to local network IPs
- Login brute-force protection (5 failed attempts → 30s lockout per IP)

> **Note:** Hammoc does not apply request-level rate limiting itself — traffic shaping is an infrastructure concern. Configure it at your reverse proxy / WAF / API gateway (nginx `limit_req`, Cloudflare WAF rules, etc.).

### 1.7 HTTPS / TLS

Hammoc automatically enables HTTPS when TLS certificates are found:

1. Place your certificate files in the `~/.hammoc/` directory:
   - `~/.hammoc/key.pem` — Private key
   - `~/.hammoc/cert.pem` — Certificate (or full chain)
2. Restart Hammoc — it will detect the files and start an HTTPS server
3. The startup log will show `TLS: enabled (certs from ~/.hammoc/)`

If no certificates are found, the server runs over HTTP as usual.

> **Tip:** For local development, you can generate self-signed certificates with `mkcert` or `openssl`. For production, use certificates from Let's Encrypt or your domain provider.

