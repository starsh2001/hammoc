/**
 * Server Configuration
 * Story 4.6: Environment-based configuration for chat settings
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LogLevel, parseLogLevel } from '@bmad-studio/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read root package.json for metadata (works in dev and npm install)
function readPackageMeta() {
  const pkgPath = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return {
      name: pkg.name ?? 'bmad-studio',
      version: pkg.version ?? '0.0.0',
      description: pkg.description ?? '',
      license: pkg.license ?? '',
      author: typeof pkg.author === 'string' ? { name: pkg.author } : (pkg.author ?? {}),
      repository: typeof pkg.repository === 'string'
        ? { url: pkg.repository }
        : (pkg.repository ?? {}),
      homepage: pkg.homepage ?? '',
    };
  } catch {
    return {
      name: 'bmad-studio',
      version: process.env.npm_package_version || '0.0.0',
      description: '',
      license: '',
      author: {},
      repository: {},
      homepage: '',
    };
  }
}

/**
 * Server configuration object
 * Centralized configuration management with environment variable support
 */
export const config = {
  /**
   * Chat-related settings
   */
  chat: {
    /**
     * Chat response timeout in milliseconds
     * Default: 300000 (5 minutes)
     * Activity-based: resets on every SDK message AND every 30s heartbeat while
     * generator.next() is pending (SDK alive but not yielding messages).
     * Configurable via CHAT_TIMEOUT_MS environment variable
     */
    timeoutMs: parseInt(process.env.CHAT_TIMEOUT_MS || '300000', 10),
  },

  /**
   * Server settings
   */
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  /**
   * WebSocket settings
   */
  websocket: {
    cors: {
      // Allow any origin in development for mobile/remote access
      origin: process.env.CORS_ORIGIN || true,
      methods: ['GET', 'POST'] as string[],
      credentials: true as const,
    },
  },

  /**
   * Logging settings
   * LOG_LEVEL env var: ERROR | WARN | INFO | DEBUG | VERBOSE
   */
  logging: {
    level: parseLogLevel(process.env.LOG_LEVEL) ??
      (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG),
  },

  /**
   * Telegram notification settings (optional)
   * Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable
   */
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
  },

  /**
   * Terminal PTY settings (Story 17.1)
   * Guard logic implemented in Story 17.5 via checkTerminalAccess()
   * Runtime: preferencesService.getTerminalEnabled() for dynamic preference support
   */
  terminal: {
    enabled: process.env.TERMINAL_ENABLED !== 'false',
    shellTimeout: parseInt(process.env.SHELL_TIMEOUT || '30000', 10),
    maxSessions: parseInt(process.env.MAX_TERMINAL_SESSIONS || '10', 10),
  },
  /**
   * Package metadata from root package.json
   */
  pkg: readPackageMeta(),
} as const;

export type Config = typeof config;
