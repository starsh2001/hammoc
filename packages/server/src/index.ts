import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { createConnection } from 'net';
import fs from 'fs';
import os from 'os';
import { createApp } from './app.js';
import { initializeWebSocket } from './handlers/websocket.js';
import { AuthConfigService } from './services/authConfigService.js';
import { notificationService } from './services/notificationService.js';
import { webPushService } from './services/webPushService.js';
import { accountInfoService } from './services/accountInfoService.js';
import { resetPassword } from './cli/passwordSetup.js';
import { createLogger, getEffectiveLogLevel } from './utils/logger.js';
import { ptyService } from './services/ptyService.js';
import { LogLevel } from '@hammoc/shared';
import { isExternalBinding } from './utils/networkUtils.js';
import { config } from './config/index.js';
import path from 'path';

const log = createLogger('server');

// Capture uncaught crashes to log file before process dies
process.on('uncaughtException', (error) => {
  log.error('UNCAUGHT EXCEPTION — process will exit:', error.message);
  log.error('Stack:', error.stack ?? '(no stack)');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  log.error('UNHANDLED REJECTION:', msg);
  if (stack) log.error('Stack:', stack);
});

const PORT = config.server.port;
const HOST = config.server.host;

function loadTlsCerts(): { key: Buffer; cert: Buffer } | null {
  const homeDir = os.homedir();
  const keyPath = path.join(homeDir, '.hammoc', 'key.pem');
  const certPath = path.join(homeDir, '.hammoc', 'cert.pem');
  try {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    }
  } catch {
    // fall through to HTTP
  }
  return null;
}

function getLocalIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

/**
 * Probe whether any process is already listening on `host:port`. Windows
 * lets a process bind to `127.0.0.1:PORT` while another binds to
 * `0.0.0.0:PORT` — EADDRINUSE never fires, but connections get split
 * across the two listeners depending on which address the client used.
 * This helper TCP-probes the ports that would alias ours so we can warn
 * and refuse to start when a stale instance is still alive.
 */
function probePortInUse(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (inUse: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** Resolve all hostnames whose bindings could silently coexist with ours. */
function conflictingHosts(bindHost: string, localIP: string | null): string[] {
  const hosts = new Set<string>();
  // Always probe loopback — another process on 127.0.0.1 would shadow us for localhost traffic.
  hosts.add('127.0.0.1');
  // If we're binding to the wildcard, also probe a real LAN IP. A specific-IP
  // bind by another process would still let our wildcard listen() succeed on
  // Windows, but clients hitting that IP would reach the other process.
  if ((bindHost === '0.0.0.0' || bindHost === '::') && localIP) {
    hosts.add(localIP);
  }
  // If we're binding to a specific non-loopback host, make sure no wildcard
  // listener on 127.0.0.1 shadows localhost traffic.
  if (bindHost !== '0.0.0.0' && bindHost !== '::' && bindHost !== '127.0.0.1') {
    hosts.add(bindHost);
  }
  return [...hosts];
}

/** CLI 옵션 파싱 */
function parseCliOptions(): { resetPassword: boolean } {
  return {
    resetPassword: process.argv.includes('--reset-password'),
  };
}

async function main() {
  const options = parseCliOptions();
  const authConfig = new AuthConfigService();

  // --reset-password 옵션 처리
  if (options.resetPassword) {
    await resetPassword();
    process.exit(0);
  }

  // Password not configured: skip CLI prompt, let web UI handle setup
  if (!authConfig.isPasswordConfigured()) {
    log.info('No password configured. Please set up via web browser.');
  }

  // Create Express app (async for session secret loading)
  const app = await createApp();

  // Create HTTP or HTTPS server based on TLS cert availability
  const tlsCerts = loadTlsCerts();
  const isHttps = !!tlsCerts;
  const httpServer = tlsCerts ? createHttpsServer(tlsCerts, app) : createServer(app);

  // Initialize WebSocket (async for session middleware - Story 2.5)
  await initializeWebSocket(httpServer);

  // Load notification settings from preferences and initialize web push
  notificationService.reload().catch(() => {
    // Silent — env var config still works as fallback
  });
  webPushService.init().catch(() => {
    // Silent — web push will initialize on first use
  });

  // Fetch Claude Code account info once at startup (fire-and-forget).
  void accountInfoService.initOnStartup();

  // Pre-flight port check. Windows allows `127.0.0.1:PORT` and `0.0.0.0:PORT`
  // to coexist in separate processes (no EADDRINUSE), which silently splits
  // traffic across two sockets — same-origin clients sync fine, but clients
  // landing on different addresses end up on different socket.io instances.
  // Probe competing hosts and refuse to start when anything answers.
  const localIP = getLocalIP();
  const probeHosts = conflictingHosts(HOST, localIP);
  const probeResults = await Promise.all(
    probeHosts.map(async (host) => ({ host, inUse: await probePortInUse(host, Number(PORT)) })),
  );
  const conflicts = probeResults.filter((r) => r.inUse);
  if (conflicts.length > 0) {
    log.error(
      `✗ Port ${PORT} is already in use by another process on ${conflicts.map((c) => c.host).join(', ')}.`,
    );
    log.error(
      '  Another Hammoc server (or an integration-test launcher) is probably still running. ' +
      'Windows lets the new bind succeed silently, but connections split across instances and ' +
      'cross-origin sync breaks. Stop the other process, then retry.',
    );
    log.error('  Find the owner with: netstat -ano | findstr ":' + PORT + '"');
    process.exit(1);
  }

  // Listen with retry logic for EADDRINUSE (Windows port release delay on tsx watch restart)
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 1000;

  function startListening(attempt: number) {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_RETRIES) {
        log.info(`Port ${PORT} in use, retrying in ${RETRY_DELAY_MS}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        setTimeout(() => startListening(attempt + 1), RETRY_DELAY_MS);
      } else {
        log.error('Failed to start server:', err);
        process.exit(1);
      }
    });

    httpServer.listen(Number(PORT), HOST, () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const localIP = getLocalIP();
      const protocol = isHttps ? 'https' : 'http';
      log.info(`Hammoc Server running on:`);
      log.info(`  Local:   ${protocol}://localhost:${PORT}`);
      if (localIP) log.info(`  Network: ${protocol}://${localIP}:${PORT}`);
      if (isHttps) log.info(`  TLS:     enabled (certs from ~/.hammoc/)`);
      log.info(`  Mode:    ${isProduction ? 'production (serving static client files)' : 'development'}`);
      log.info(`  Log:     ${LogLevel[getEffectiveLogLevel()]} → ${path.resolve(process.cwd(), 'logs')}`);

      // Story 17.5: Security warning for terminal access on external interfaces
      if (isExternalBinding(HOST) && config.terminal.enabled) {
        log.warn(
          '⚠️  SECURITY WARNING: Server is bound to an external interface (%s) with terminal enabled. ' +
          'Remote clients may attempt to access the terminal. ' +
          'Consider setting TERMINAL_ENABLED=false or binding to localhost.',
          HOST
        );
      }
    });
  }

  startListening(0);

  // Graceful shutdown: release port before process exits (critical for --watch restart on Windows)
  const shutdown = () => {
    ptyService.destroyAll();
    httpServer.close(() => process.exit(0));
    // Force exit if close hangs longer than 2s
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  log.error('Failed to start server:', error);
  process.exit(1);
});
