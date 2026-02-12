/**
 * Debug Logger — writes detailed streaming/socket event logs to an in-memory ring buffer.
 * Downloadable as a file from browser console: debugLogger.download()
 *
 * Usage:
 *   import { debugLog, debugLogger } from '../utils/debugLogger';
 *   debugLog.stream('handleChunk', { sessionId, messageId, contentLen: data.content.length });
 *
 * Console commands:
 *   window.__debugLogger.dump()      — print all logs to console
 *   window.__debugLogger.download()  — download logs as .txt file
 *   window.__debugLogger.clear()     — clear buffer
 *   window.__debugLogger.setEnabled(false) — disable logging
 */

const MAX_ENTRIES = 2000;
const SERVER_FLUSH_INTERVAL = 500; // ms between server flushes

interface LogEntry {
  ts: string;
  category: string;
  event: string;
  data?: Record<string, unknown>;
}

class DebugLogger {
  private buffer: LogEntry[] = [];
  private enabled = true;
  private serverLoggingEnabled = true;
  private serverQueue: LogEntry[] = [];
  private serverFlushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start server flush timer
    this.startServerFlush();
  }

  private startServerFlush() {
    if (this.serverFlushTimer) return;
    this.serverFlushTimer = setInterval(() => this.flushToServer(), SERVER_FLUSH_INTERVAL);
  }

  private async flushToServer() {
    if (!this.serverLoggingEnabled || this.serverQueue.length === 0) return;

    const batch = this.serverQueue.splice(0, this.serverQueue.length);
    try {
      await fetch('/api/debug/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch }),
        credentials: 'include',
      });
    } catch {
      // Silently ignore — debug logging should never break the app
    }
  }

  log(category: string, event: string, data?: Record<string, unknown>) {
    if (!this.enabled) return;

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

    // Also log to console in dev mode with color coding
    const colors: Record<string, string> = {
      socket: '#2196F3',
      stream: '#4CAF50',
      state: '#FF9800',
      message: '#9C27B0',
      reconnect: '#F44336',
      chatpage: '#00BCD4',
    };
    const color = colors[category] || '#757575';
    console.debug(
      `%c[${category}]%c ${event}`,
      `color: ${color}; font-weight: bold`,
      'color: inherit',
      data || '',
    );
  }

  setServerLogging(enabled: boolean) {
    this.serverLoggingEnabled = enabled;
    console.log(`[DebugLogger] Server logging ${enabled ? 'enabled' : 'disabled'}`);
  }

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

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`[DebugLogger] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  getEntries(): readonly LogEntry[] {
    return this.buffer;
  }
}

export const debugLogger = new DebugLogger();

// Convenience namespace for categorized logging
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
