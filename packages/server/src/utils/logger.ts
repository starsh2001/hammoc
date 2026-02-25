/**
 * Server Logger — level-filtered logging with console + file output
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('queueService');
 *   log.info('START: items=5');
 *   log.debug('executeLoop: ENTER');
 *   log.error('UNEXPECTED:', err.message);
 *
 * Configuration:
 *   LOG_LEVEL env var: ERROR | WARN | INFO | DEBUG | VERBOSE (default: DEBUG in dev, INFO in prod)
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { LogLevel, parseLogLevel } from '@bmad-studio/shared';

// Determine current log level from environment
// Reads process.env directly (not from config/index.ts) to avoid circular dependency
const envLevel = parseLogLevel(process.env.LOG_LEVEL);
const isProduction = process.env.NODE_ENV === 'production';
const currentLevel: LogLevel = envLevel ?? (isProduction ? LogLevel.INFO : LogLevel.DEBUG);

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

function getLogFile(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logsDir, `server-${date}.log`);
}

function formatForFile(levelName: string, module: string, message: string, args: unknown[]): string {
  const ts = new Date().toISOString();
  const argsStr = args.length > 0
    ? ' ' + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    : '';
  return `[${ts}] [${levelName}] [${module}] ${message}${argsStr}\n`;
}

const consoleMethods: Record<number, (...args: unknown[]) => void> = {
  [LogLevel.ERROR]: console.error,
  [LogLevel.WARN]: console.warn,
  [LogLevel.INFO]: console.log,
  [LogLevel.DEBUG]: console.log,
  [LogLevel.VERBOSE]: console.log,
};

const levelNames: Record<number, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.VERBOSE]: 'VERBOSE',
};

function writeLog(level: LogLevel, module: string, message: string, ...args: unknown[]): void {
  if (level > currentLevel) return;

  // Console output
  const prefix = `[${module}]`;
  if (args.length > 0) {
    consoleMethods[level](`${prefix} ${message}`, ...args);
  } else {
    consoleMethods[level](`${prefix} ${message}`);
  }

  // File output
  try {
    appendFileSync(getLogFile(), formatForFile(levelNames[level], module, message, args), 'utf-8');
  } catch {
    // Silent — logging should never crash the app
  }
}

export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  verbose(message: string, ...args: unknown[]): void;
}

/**
 * Create a module-scoped logger instance.
 */
export function createLogger(module: string): Logger {
  return {
    error: (message: string, ...args: unknown[]) => writeLog(LogLevel.ERROR, module, message, ...args),
    warn: (message: string, ...args: unknown[]) => writeLog(LogLevel.WARN, module, message, ...args),
    info: (message: string, ...args: unknown[]) => writeLog(LogLevel.INFO, module, message, ...args),
    debug: (message: string, ...args: unknown[]) => writeLog(LogLevel.DEBUG, module, message, ...args),
    verbose: (message: string, ...args: unknown[]) => writeLog(LogLevel.VERBOSE, module, message, ...args),
  };
}

/** Get current effective log level (for display/diagnostics) */
export function getEffectiveLogLevel(): LogLevel {
  return currentLevel;
}
