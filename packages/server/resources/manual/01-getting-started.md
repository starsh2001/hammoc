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

1. Open http://localhost:3000 in your browser
2. **Password Setup**: Set an admin password on first visit. This protects your instance from unauthorized access.
3. **Login**: Enter your password to sign in. **"Stay signed in"** keeps you logged in for 30 days (checked by default). After too many failed attempts, login is temporarily locked with a countdown timer.
4. **CLI Verification**: The onboarding wizard checks that Claude Code CLI is installed and authenticated. Follow the prompts if any step fails.
5. **Project Selection**: Choose an existing Claude Code project or create a new one.

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

