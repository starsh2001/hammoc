import { createServer } from 'http';
import os from 'os';
import { createApp } from './app.js';
import { initializeWebSocket } from './handlers/websocket.js';
import { AuthConfigService } from './services/authConfigService.js';
import { notificationService } from './services/notificationService.js';
import { resetPassword } from './cli/passwordSetup.js';
import { createLogger, getEffectiveLogLevel } from './utils/logger.js';
import { ptyService } from './services/ptyService.js';
import { LogLevel } from '@bmad-studio/shared';
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

function getLocalIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
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

  // Create HTTP server from Express app
  const httpServer = createServer(app);

  // Initialize WebSocket (async for session middleware - Story 2.5)
  await initializeWebSocket(httpServer);

  // Load Telegram notification settings from preferences
  notificationService.reload().catch(() => {
    // Silent — env var config still works as fallback
  });

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
      log.info(`BMad Studio Server running on:`);
      log.info(`  Local:   http://localhost:${PORT}`);
      if (localIP) log.info(`  Network: http://${localIP}:${PORT}`);
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
