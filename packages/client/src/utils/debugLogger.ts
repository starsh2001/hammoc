/**
 * Debug Logger — level-filtered logging with in-memory ring buffer and server persistence.
 *
 * Usage:
 *   import { debugLog, debugLogger } from '../utils/debugLogger';
 *   debugLog.stream('handleChunk', { sessionId, messageId, contentLen: data.content.length });
 *   debugLogger.error('Critical failure', { code: 500 });
 *   debugLogger.warn('Unexpected state', { state });
 *   debugLogger.info('Session created', { id });
 *
 * Console commands:
 *   window.__debugLogger.dump()      — print all logs to console
 *   window.__debugLogger.download()  — download logs as .txt file
 *   window.__debugLogger.clear()     — clear buffer
 *   window.__debugLogger.setEnabled(false) — disable logging
 *   window.__debugLogger.setLevel(0) — set to ERROR only
 *   window.__debugLogger.setLevel(4) — set to VERBOSE (all)
 *
 * Configuration:
 *   VITE_LOG_LEVEL env var: ERROR | WARN | INFO | DEBUG | VERBOSE
 */

import { LogLevel, parseLogLevel } from '@hammoc/shared';

const MAX_ENTRIES = 2000;
const SERVER_FLUSH_INTERVAL = 500; // ms between server flushes

interface LogEntry {
  ts: string;
  category: string;
  event: string;
  data?: Record<string, unknown>;
}

const categoryColors: Record<string, string> = {
  error: '#F44336',
  warn: '#FF9800',
  info: '#2196F3',
  socket: '#2196F3',
  stream: '#4CAF50',
  state: '#FF9800',
  message: '#9C27B0',
  reconnect: '#F44336',
  chatpage: '#00BCD4',
};

class DebugLogger {
  private buffer: LogEntry[] = [];
  private enabled = true;
  private serverLoggingEnabled = false; // disabled until confirmed dev mode
  private serverQueue: LogEntry[] = [];
  private serverFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private currentLevel: LogLevel;
  private consecutiveFailures = 0;
  private static readonly MAX_FAILURES = 3;

  constructor() {
    const envLevel = parseLogLevel(import.meta.env.VITE_LOG_LEVEL);
    const isDev = import.meta.env.DEV;
    this.currentLevel = envLevel ?? (isDev ? LogLevel.DEBUG : LogLevel.INFO);
    this.probeDevMode();
  }

  /**
   * Check server dev mode and only enable server logging + flush timer if confirmed.
   */
  private async probeDevMode() {
    try {
      const res = await fetch('/api/server/info', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.isDevMode) {
          this.serverLoggingEnabled = true;
          this.startServerFlush();
        }
      }
    } catch {
      // Not in dev mode or server unreachable — keep server logging disabled
    }
  }

  private startServerFlush() {
    if (this.serverFlushTimer) return;
    this.scheduleFlush();
  }

  private scheduleFlush() {
    this.serverFlushTimer = setTimeout(async () => {
      await this.flushToServer();
      if (this.serverLoggingEnabled) {
        this.scheduleFlush();
      }
    }, SERVER_FLUSH_INTERVAL);
  }

  private async flushToServer() {
    if (!this.serverLoggingEnabled || this.serverQueue.length === 0) return;

    const batch = this.serverQueue.splice(0, this.serverQueue.length);
    try {
      const res = await fetch('/api/debug/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch }),
        credentials: 'include',
      });
      if (res.ok) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= DebugLogger.MAX_FAILURES) {
          this.serverLoggingEnabled = false;
          console.warn('[DebugLogger] Server logging disabled after repeated failures');
        }
      }
    } catch {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= DebugLogger.MAX_FAILURES) {
        this.serverLoggingEnabled = false;
        console.warn('[DebugLogger] Server logging disabled after repeated failures');
      }
    }
  }

  private writeEntry(category: string, event: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      category,
      event,
      data,
    };

    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift();
    }

    // Queue for server-side file logging
    if (this.serverLoggingEnabled) {
      this.serverQueue.push(entry);
    }

    // Console output with color coding
    const color = categoryColors[category] || '#757575';
    console.debug(
      `%c[${category}]%c ${event}`,
      `color: ${color}; font-weight: bold`,
      'color: inherit',
      data || '',
    );
  }

  /**
   * Categorized log at DEBUG level (existing API — backward compatible)
   */
  log(category: string, event: string, data?: Record<string, unknown>) {
    if (!this.enabled || LogLevel.DEBUG > this.currentLevel) return;
    this.writeEntry(category, event, data);
  }

  // --- Level-based methods ---

  error(event: string, data?: Record<string, unknown>) {
    if (!this.enabled || LogLevel.ERROR > this.currentLevel) return;
    this.writeEntry('error', event, data);
  }

  warn(event: string, data?: Record<string, unknown>) {
    if (!this.enabled || LogLevel.WARN > this.currentLevel) return;
    this.writeEntry('warn', event, data);
  }

  info(event: string, data?: Record<string, unknown>) {
    if (!this.enabled || LogLevel.INFO > this.currentLevel) return;
    this.writeEntry('info', event, data);
  }

  verbose(category: string, event: string, data?: Record<string, unknown>) {
    if (!this.enabled || LogLevel.VERBOSE > this.currentLevel) return;
    this.writeEntry(category, event, data);
  }

  // --- Configuration methods ---

  setLevel(level: LogLevel) {
    this.currentLevel = level;
    console.log(`[DebugLogger] Level set to ${LogLevel[level]} (${level})`);
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  setServerLogging(enabled: boolean) {
    this.serverLoggingEnabled = enabled;
    console.log(`[DebugLogger] Server logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`[DebugLogger] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  // --- Buffer management ---

  dump(): string {
    const lines = this.buffer.map((e) => {
      const dataStr = e.data ? ' ' + JSON.stringify(e.data) : '';
      return `[${e.ts}] [${e.category}] ${e.event}${dataStr}`;
    });
    const text = lines.join('\n');
    console.log(text);
    return text;
  }

  download() {
    const text = this.dump();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bmad-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clear() {
    this.buffer = [];
    console.log('[DebugLogger] Buffer cleared');
  }

  getEntries(): readonly LogEntry[] {
    return this.buffer;
  }
}

export const debugLogger = new DebugLogger();

// Convenience namespace for categorized logging (DEBUG level)
export const debugLog = {
  socket: (event: string, data?: Record<string, unknown>) =>
    debugLogger.log('socket', event, data),
  stream: (event: string, data?: Record<string, unknown>) =>
    debugLogger.log('stream', event, data),
  state: (event: string, data?: Record<string, unknown>) =>
    debugLogger.log('state', event, data),
  message: (event: string, data?: Record<string, unknown>) =>
    debugLogger.log('message', event, data),
  reconnect: (event: string, data?: Record<string, unknown>) =>
    debugLogger.log('reconnect', event, data),
  chatpage: (event: string, data?: Record<string, unknown>) =>
    debugLogger.log('chatpage', event, data),
};

// Expose to browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__debugLogger = debugLogger;
}
