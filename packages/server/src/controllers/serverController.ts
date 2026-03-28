import { Request, Response } from 'express';
import { execFile, execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { isLocalIP, extractRequestIP } from '../utils/networkUtils.js';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root: packages/server/src/controllers → ../../../..  (also works from dist/controllers)
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Resolve npm absolute path once at startup.
// Prefer deterministic process.execPath-based resolution (node and npm are co-located)
// over shell-based 'where' which can fail in MINGW64 or return non-.cmd entries.
let npmPath = 'npm';
if (process.platform === 'win32') {
  const candidate = path.join(path.dirname(process.execPath), 'npm.cmd');
  if (fs.existsSync(candidate)) {
    npmPath = candidate;
  } else {
    try {
      npmPath = execSync('where npm.cmd', { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0];
    } catch { /* keep bare 'npm' fallback */ }
  }
} else {
  try {
    npmPath = execSync('which npm', { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0];
  } catch { /* keep bare 'npm' fallback */ }
}

/** Filter warning lines from stderr so only real errors are shown to the user. */
function stripWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !/^\s*(warn(ing)?[\s:]|⚠|A PostCSS plugin)/i.test(line))
    .join('\n')
    .trim();
}

function getLocalNetworkIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

// Detect dev mode: .git AND packages/server/src must both exist
const isDevMode = fs.existsSync(path.join(MONOREPO_ROOT, '.git'))
  && fs.existsSync(path.join(MONOREPO_ROOT, 'packages', 'server', 'src'));

// Read version from root package.json
function getPackageInfo(): { name: string; version: string } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MONOREPO_ROOT, 'package.json'), 'utf-8'));
    return { name: pkg.name || 'hammoc', version: pkg.version || '0.0.0' };
  } catch {
    return { name: 'hammoc', version: '0.0.0' };
  }
}

// In-memory build/update state
let buildState: { status: 'idle' | 'building' | 'updating' | 'failed'; error?: string } = { status: 'idle' };

/** Resolve Git Bash path on Windows */
function findGitBash(): string {
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'bash'; // fallback
}

// Detect npx install: path contains _npx (npm's npx cache directory)
const isNpxInstall = MONOREPO_ROOT.includes('_npx');

/**
 * Spawn a new process in Git Bash and exit the current server.
 * - 'prod'   → npm run prod (dev: build + start)
 * - 'update' → global: npm install -g + hammoc / npx: npx hammoc@latest
 */
function spawnAndExit(mode: 'prod' | 'update'): void {
  const nodeDir = path.dirname(process.execPath);
  const scriptPath = path.join(os.tmpdir(), 'hammoc-restart.sh');

  const toUnix = (p: string) => p.replace(/\\/g, '/');
  const { name } = getPackageInfo();

  let command: string;
  if (mode === 'update') {
    if (isNpxInstall) {
      const npxPath = process.platform === 'win32'
        ? path.join(path.dirname(process.execPath), 'npx.cmd')
        : 'npx';
      command = `"${toUnix(npxPath)}" ${name}@latest`;
    } else {
      // Global install: update in-place, then run the bin command
      command = `"${toUnix(npmPath)}" install -g ${name}@latest && "${toUnix(npmPath)}" exec hammoc`;
    }
  } else {
    command = `"${toUnix(npmPath)}" run ${mode}`;
  }

  // Export all current environment variables so the restarted process
  // inherits them (on Windows, `cmd /c start` + Git Bash loses the parent env).
  // - Filter names to valid bash identifiers (reject e.g. "PROGRAMFILES(X86)")
  // - Use single quotes to prevent bash expansion of $, `, etc.
  const bashSafe = (v: string) => "'" + v.replace(/'/g, "'\\''") + "'";
  const envExports = Object.entries(process.env)
    .filter(([k, v]) => v !== undefined && k !== 'PATH' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k))
    .map(([k, v]) => `export ${k}=${bashSafe(v!)}`)
    .join('\n');

  fs.writeFileSync(scriptPath, [
    '#!/bin/bash',
    envExports,
    `export PATH="${toUnix(nodeDir)}:$PATH"`,
    // Always propagate the running port even if PORT was not in process.env
    `export PORT=${bashSafe(String(config.server.port))}`,
    'sleep 2',
    `cd "${toUnix(MONOREPO_ROOT)}"`,
    command,
  ].join('\n'));

  const shell = process.platform === 'win32' ? findGitBash() : '/bin/bash';

  let child;
  if (process.platform === 'win32') {
    // Use cmd.exe's 'start' to open a visible console window running Git Bash
    const comspec = process.env.COMSPEC || 'cmd.exe';
    child = spawn(comspec, ['/c', 'start', '""', shell, scriptPath], {
      detached: true,
      stdio: 'ignore',
    });
  } else {
    child = spawn(shell, [scriptPath], {
      cwd: MONOREPO_ROOT,
      detached: true,
      stdio: 'ignore',
    });
  }
  child.on('error', (err) => {
    console.error('[server] Failed to spawn restart process:', err.message);
    buildState = { status: 'failed', error: `Spawn failed: ${err.message}` };
  });
  child.unref();

  // Wait until the child process is confirmed spawned before exiting.
  // Exiting too early (before detach completes) can kill the child on Windows.
  child.on('spawn', () => {
    console.log('[server] Child process spawned. Exiting old server in 500ms.');
    setTimeout(() => process.exit(0), 500);
  });
}

export const serverController = {
  /** GET /api/server/info - server environment info */
  async info(_req: Request, res: Response): Promise<void> {
    const { name, version } = getPackageInfo();
    const hostname = os.hostname();
    const port = config.server.port;
    const host = config.server.host;
    // Detect LAN-accessible IPv4 address
    const localIP = getLocalNetworkIP();
    res.json({ isDevMode, version, packageName: name, hostname, host, port, localIP });
  },

  /** POST /api/server/restart - rebuild & restart (dev only, local network only) */
  async restart(req: Request, res: Response): Promise<void> {
    const clientIP = extractRequestIP(req);
    if (!isLocalIP(clientIP)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Local access only' } });
      return;
    }
    if (!isDevMode) {
      res.status(403).json({ error: { code: 'DEV_ONLY', message: req.t!('server.error.rebuildDevOnly') } });
      return;
    }
    if (buildState.status === 'building' || buildState.status === 'updating') {
      res.status(409).json({ error: { code: 'BUILD_IN_PROGRESS', message: req.t!('server.error.buildInProgress') } });
      return;
    }

    buildState = { status: 'building' };
    res.json({ message: req.t!('server.info.buildStarted') });

    console.log('[restart] Spawning new server via npm run prod (build + start)...');
    spawnAndExit('prod');
  },

  /** GET /api/server/check-update - check npm registry for newer version (local network only) */
  async checkUpdate(req: Request, res: Response): Promise<void> {
    const clientIP = extractRequestIP(req);
    if (!isLocalIP(clientIP)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Local access only' } });
      return;
    }
    if (isDevMode) {
      res.status(501).json({ error: { code: 'NOT_APPLICABLE', message: req.t!('server.error.updateCheckDevOnly') } });
      return;
    }

    const { name, version: currentVersion } = getPackageInfo();
    execFile(npmPath, ['view', name, 'version'], { timeout: 30_000, shell: true }, (err, stdout) => {
      if (err) {
        res.status(502).json({ error: { code: 'REGISTRY_ERROR', message: req.t!('server.error.npmCheckFailed') } });
        return;
      }
      const latestVersion = stdout.trim();
      res.json({
        currentVersion,
        latestVersion,
        updateAvailable: latestVersion !== currentVersion,
      });
    });
  },

  /** POST /api/server/update - npm update & restart (non-dev only, local network only) */
  async update(req: Request, res: Response): Promise<void> {
    const clientIP = extractRequestIP(req);
    if (!isLocalIP(clientIP)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Local access only' } });
      return;
    }
    if (isDevMode) {
      res.status(403).json({ error: { code: 'DEV_ONLY', message: req.t!('server.error.useRebuildInDev') } });
      return;
    }
    if (buildState.status === 'building' || buildState.status === 'updating') {
      res.status(409).json({ error: { code: 'UPDATE_IN_PROGRESS', message: req.t!('server.error.operationInProgress') } });
      return;
    }

    const { name } = getPackageInfo();
    buildState = { status: 'updating' };
    res.json({ message: req.t!('server.info.updateStarted') });

    console.log(`[update] Updating ${name} (${isNpxInstall ? 'npx' : 'global'})...`);
    spawnAndExit('update');
  },

  /** GET /api/server/build-status - poll build/update progress */
  async buildStatus(_req: Request, res: Response): Promise<void> {
    res.json(buildState);
  },
};
