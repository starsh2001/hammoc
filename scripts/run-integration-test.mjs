#!/usr/bin/env node
/**
 * Hammoc integration test launcher.
 *
 * Starts the server with test-specific environment variables, waits until
 * it is ready, then prints connection info for the Playwright MCP operator.
 *
 * Automatically snapshots ~/.hammoc/preferences.json at startup and restores it
 * on exit, so scenarios that mutate language / permission mode / advanced
 * settings don't leak state between runs.
 *
 * Usage:
 *   node scripts/run-integration-test.mjs [options]
 *
 * Options:
 *   --port=<n>                    Primary server port (default: 21213)
 *   --chat-timeout=<ms>           CHAT_TIMEOUT_MS env var (default: 300000)
 *   --permission-timeout=<ms>     browser init-script snippet to inject
 *   --with-notifications          Remind operator to grant browser notification permission
 *   --with-terminal-disabled      Spawn secondary server on <port+1> with TERMINAL_ENABLED=false
 *   --bot-api-base=<url>          BOT_API_BASE_URL env var (point to mock-telegram.mjs)
 *   --mock-telegram               Auto-spawn mock-telegram.mjs on <port+17> and wire it up
 *   --mock-telegram-port=<n>      Override mock-telegram port (default: <primary port>+17)
 */

import { spawn } from 'child_process';
import { existsSync, copyFileSync, unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Preferences snapshot/restore ────────────────────────────────────────────
// Integration scenarios mutate ~/.hammoc/preferences.json (language, permission
// mode, advanced settings, etc.). Capture the pre-test state at startup and
// restore it on exit so tests don't leave the user's environment dirty.

const PREFS_PATH = path.join(os.homedir(), '.hammoc', 'preferences.json');
const BACKUP_PATH = path.join(
  os.homedir(),
  '.hammoc',
  `preferences.json.integration-backup-${process.pid}`,
);

let snapshotState = { captured: false, originalExisted: false };

function snapshotPreferences() {
  if (existsSync(PREFS_PATH)) {
    copyFileSync(PREFS_PATH, BACKUP_PATH);
    snapshotState = { captured: true, originalExisted: true };
    console.log(`✓ Snapshot: preferences.json → ${path.basename(BACKUP_PATH)}`);
  } else {
    snapshotState = { captured: true, originalExisted: false };
    console.log('✓ Snapshot: preferences.json did not exist (will delete on exit if created)');
  }
}

let restored = false;
function restorePreferences() {
  if (!snapshotState.captured || restored) return;
  restored = true;
  try {
    if (snapshotState.originalExisted) {
      if (existsSync(BACKUP_PATH)) {
        copyFileSync(BACKUP_PATH, PREFS_PATH);
        unlinkSync(BACKUP_PATH);
        console.log('✓ Preferences restored from snapshot.');
      } else {
        console.error(`✗ Snapshot file missing at ${BACKUP_PATH} — preferences NOT restored.`);
      }
    } else {
      if (existsSync(PREFS_PATH)) {
        unlinkSync(PREFS_PATH);
        console.log('✓ Preferences file removed (did not exist before test).');
      }
      if (existsSync(BACKUP_PATH)) unlinkSync(BACKUP_PATH);
    }
  } catch (err) {
    console.error(`✗ Failed to restore preferences: ${err.message}`);
    console.error(`  Manual recovery: copy ${BACKUP_PATH} → ${PREFS_PATH}`);
  }
}

// ── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const eqIdx = arg.indexOf('=');
    const key = eqIdx === -1 ? arg : arg.slice(0, eqIdx);
    const value = eqIdx === -1 ? undefined : arg.slice(eqIdx + 1);
    switch (key) {
      case '--port':              args.port = parseInt(value, 10); break;
      case '--chat-timeout':     args.chatTimeout = parseInt(value, 10); break;
      case '--permission-timeout': args.permissionTimeout = parseInt(value, 10); break;
      case '--with-notifications': args.withNotifications = true; break;
      case '--with-terminal-disabled': args.withTerminalDisabled = true; break;
      case '--trust-proxy':      args.trustProxy = true; break;
      case '--bot-api-base':     args.botApiBase = value; break;
      case '--mock-telegram':    args.mockTelegram = true; break;
      case '--mock-telegram-port': args.mockTelegramPort = parseInt(value, 10); break;
      default:
        if (!key.startsWith('--help')) {
          console.warn(`Unknown option: ${key}`);
        } else {
          printHelp();
          process.exit(0);
        }
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage: node scripts/run-integration-test.mjs [options]

Options:
  --port=<n>                    Primary server port (default: 21213)
  --chat-timeout=<ms>           CHAT_TIMEOUT_MS (default: 300000)
  --permission-timeout=<ms>     Permission auto-deny timeout injected via browser_evaluate
  --with-notifications          Grants browser notification permission in Playwright context
  --with-terminal-disabled      Spawn secondary server on <port+1> with TERMINAL_ENABLED=false
  --trust-proxy                 Set TRUST_PROXY=true so X-Forwarded-For is honored (L-03-01 requires this)
  --bot-api-base=<url>          Telegram API base URL (use with mock-telegram.mjs)
  --mock-telegram               Auto-spawn mock-telegram.mjs and inject its URL
  --mock-telegram-port=<n>      Override mock-telegram port (default: primary+17)
  --help                        Show this help message
`);
}

// ── Server lifecycle ────────────────────────────────────────────────────────

function buildEnv(port, opts) {
  // Use production so the server serves the built client at /. Dev mode expects
  // the Vite dev server to handle the frontend, which we don't start here.
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    CHAT_TIMEOUT_MS: String(opts.chatTimeout ?? 300000),
    // Enable /api/debug/* routes (kill-ws) for integration scenarios like R-01-01
    // without switching to NODE_ENV=development (which would break static file serving).
    ENABLE_TEST_ENDPOINTS: 'true',
    // Honor X-Forwarded-For header — required for L-03-01 (simulate external-IP
    // access via header). Off by default: without this, all requests appear as
    // 127.0.0.1 and the IP-filter cannot be exercised.
    ...(opts.trustProxy ? { TRUST_PROXY: 'true' } : {}),
  };
  if (opts.botApiBase) {
    env.BOT_API_BASE_URL = opts.botApiBase;
  }
  return env;
}

function resolveServerEntry() {
  const distEntry = path.join(ROOT, 'packages', 'server', 'dist', 'index.js');
  if (existsSync(distEntry)) {
    return { cmd: process.execPath, args: [distEntry] };
  }
  // Fall back to tsx for development (no build required)
  const srcEntry = path.join(ROOT, 'packages', 'server', 'src', 'index.ts');
  return {
    cmd: process.execPath,
    args: ['--import', 'tsx/esm', srcEntry],
  };
}

function spawnServer(port, env, label) {
  const { cmd, args } = resolveServerEntry();
  const proc = spawn(cmd, args, {
    env: { ...env, PORT: String(port) },
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (d) => {
    process.stdout.write(`[${label}] ${d}`);
  });
  proc.stderr.on('data', (d) => {
    process.stderr.write(`[${label}] ${d}`);
  });
  proc.on('exit', (code) => {
    console.error(`[${label}] Server exited with code ${code}`);
  });

  return proc;
}

async function waitForReady(url, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} (${url}) did not become ready within ${timeoutMs}ms`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv);
const primaryPort = opts.port ?? 21213;
const secondaryPort = primaryPort + 1;
const mockTelegramPort = opts.mockTelegramPort ?? primaryPort + 17;

// Spawn mock-telegram first so its URL can be injected into server env.
let mockTelegramProc = null;
if (opts.mockTelegram) {
  const mockScript = path.join(ROOT, 'scripts', 'mock-telegram.mjs');
  mockTelegramProc = spawn(
    process.execPath,
    [mockScript, `--port=${mockTelegramPort}`],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  mockTelegramProc.stdout.on('data', (d) => process.stdout.write(`[mock-tg] ${d}`));
  mockTelegramProc.stderr.on('data', (d) => process.stderr.write(`[mock-tg] ${d}`));
  mockTelegramProc.on('exit', (code) => {
    console.error(`[mock-tg] Exited with code ${code}`);
  });
  // When auto-spawning, override --bot-api-base to our local mock.
  opts.botApiBase = `http://127.0.0.1:${mockTelegramPort}`;
}

const primaryEnv = buildEnv(primaryPort, opts);

console.log('\n═══════════════════════════════════════════════════════');
console.log(' Hammoc Integration Test Launcher');
console.log('═══════════════════════════════════════════════════════');

// Ensure dists exist or advise build
const serverDist = path.join(ROOT, 'packages', 'server', 'dist', 'index.js');
const clientDist = path.join(ROOT, 'packages', 'client', 'dist', 'index.html');
if (!existsSync(serverDist)) {
  console.warn('⚠  packages/server/dist not found — falling back to tsx (slower startup).');
  console.warn('   Run "npm run build" first for faster tests.\n');
}
if (!existsSync(clientDist)) {
  console.warn('⚠  packages/client/dist not found — Playwright will get a blank page.');
  console.warn('   Run "npm run build" first.\n');
}

// Snapshot preferences before touching anything
snapshotPreferences();

// Spawn primary server
const primaryProc = spawnServer(primaryPort, primaryEnv, 'primary');

// Spawn secondary (TERMINAL_ENABLED=false) if requested
let secondaryProc = null;
if (opts.withTerminalDisabled) {
  const secondaryEnv = { ...primaryEnv, TERMINAL_ENABLED: 'false' };
  secondaryProc = spawnServer(secondaryPort, secondaryEnv, 'terminal-off');
}

// Cleanup on exit — kill processes first, then restore preferences.
// Servers must be stopped before restoring so they can't rewrite the file mid-restore.
function cleanup() {
  primaryProc.kill();
  if (secondaryProc) secondaryProc.kill();
  if (mockTelegramProc) mockTelegramProc.kill();
  restorePreferences();
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
// Final safety net for unexpected exits (must be synchronous)
process.on('exit', restorePreferences);

// Wait for servers
try {
  if (mockTelegramProc) {
    console.log(`\n⏳ Waiting for mock-telegram on port ${mockTelegramPort}...`);
    await waitForReady(`http://127.0.0.1:${mockTelegramPort}/mock-telegram/health`, 'mock-telegram', 10_000);
  }
  console.log(`\n⏳ Waiting for primary server on port ${primaryPort}...`);
  await waitForReady(`http://127.0.0.1:${primaryPort}/api/health`, 'primary server');
  if (secondaryProc) {
    console.log(`⏳ Waiting for secondary server on port ${secondaryPort}...`);
    await waitForReady(`http://127.0.0.1:${secondaryPort}/api/health`, 'secondary server');
  }
} catch (err) {
  console.error('✗', err.message);
  cleanup();
  process.exit(1);
}

// Print connection info
console.log('\n✓ Servers ready.\n');
console.log('─── Playwright MCP — Connection Info ───────────────────');
console.log(`  Primary URL:   http://127.0.0.1:${primaryPort}`);
if (secondaryProc) {
  console.log(`  Secondary URL: http://127.0.0.1:${secondaryPort}  (TERMINAL_ENABLED=false)`);
}

if (opts.permissionTimeout) {
  console.log('\n─── Permission Timeout — browser_evaluate snippet ───────');
  console.log(`  Run this before permission-timeout scenarios:`);
  console.log(`  browser_evaluate("() => { window.__HAMMOC_PERMISSION_TIMEOUT_MS__ = ${opts.permissionTimeout}; return true }")`);
}

if (opts.withNotifications) {
  console.log('\n─── Web Push Notifications ──────────────────────────────');
  console.log('  Grant permission in Playwright context:');
  console.log('    context.grantPermissions(["notifications"])');
  console.log('  Or use Playwright MCP with browserContext option:');
  console.log('    permissions: ["notifications"]');
}

if (opts.botApiBase) {
  console.log(`\n─── Telegram Mock ───────────────────────────────────────`);
  console.log(`  BOT_API_BASE_URL: ${opts.botApiBase}`);
  if (mockTelegramProc) {
    console.log(`  Admin endpoints:`);
    console.log(`    GET  ${opts.botApiBase}/mock-telegram/health`);
    console.log(`    GET  ${opts.botApiBase}/mock-telegram/messages`);
    console.log(`    POST ${opts.botApiBase}/mock-telegram/reset`);
    console.log(`    POST ${opts.botApiBase}/mock-telegram/mode   body: { mode: "ok"|"401"|"400"|"429" }`);
  }
}

console.log('\n  Press Ctrl+C to stop all servers.\n');
console.log('═══════════════════════════════════════════════════════\n');

// Keep process alive
await new Promise(() => {});
