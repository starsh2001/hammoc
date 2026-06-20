/**
 * CLI Debug Log — unified per-session decision trace for CLI-mode debugging.
 *
 * Records every classification/emit decision the server makes (screen parse → block
 * type → client emit, file parse → block type → client emit) and every decision the
 * client reports back (event received → segment classified → rendered). Both sides
 * land in ONE chronological file so a post-mortem can diff server-emitted vs
 * client-received at each timestamp.
 *
 * Activation: always-on when CLI engine runs (lightweight — one WriteStream per turn,
 * best-effort writes). No env-var gate; the file is gitignored under `logs/`.
 *
 * Format (one JSON line per entry):
 *   {"ts":"2026-06-20T10:15:32.123Z","src":"S","ev":"grid-card-emit","d":{...}}
 *   {"ts":"2026-06-20T10:15:32.200Z","src":"C","ev":"recv-thinking","d":{...}}
 *
 * `src`: "S" = [CLILog-Server], "C" = [CLILog-Client]
 */

import { mkdirSync, createWriteStream, type WriteStream } from 'fs';
import path from 'path';

export interface CliDebugLogEntry {
  ts: string;
  src: 'S' | 'C';
  ev: string;
  d?: Record<string, unknown>;
}

const LOG_DIR = path.join(process.cwd(), 'logs', 'cli-debug');

export class CliDebugLog {
  private stream: WriteStream | null = null;
  readonly filePath: string;

  constructor(sessionId: string) {
    const sid = sessionId || 'unknown';
    const fname = `${sid}-${Date.now()}.jsonl`;
    this.filePath = path.join(LOG_DIR, fname);
    try {
      mkdirSync(LOG_DIR, { recursive: true });
      this.stream = createWriteStream(this.filePath, { encoding: 'utf8' });
    } catch {
      // best-effort — never break the engine
    }
  }

  /** Server-side decision log. */
  server(event: string, data?: Record<string, unknown>): void {
    this.write({ ts: new Date().toISOString(), src: 'S', ev: event, ...(data ? { d: data } : {}) });
  }

  /** Client-side decision log (relayed from browser via socket). */
  client(event: string, data?: Record<string, unknown>): void {
    this.write({ ts: new Date().toISOString(), src: 'C', ev: event, ...(data ? { d: data } : {}) });
  }

  /** Client-side decision log with original client timestamp preserved. */
  clientWithTs(ts: string, event: string, data?: Record<string, unknown>): void {
    this.write({ ts, src: 'C', ev: event, ...(data ? { d: data } : {}) });
  }

  close(): void {
    try { this.stream?.end(); } catch { /* ignore */ }
    this.stream = null;
  }

  private write(entry: CliDebugLogEntry): void {
    if (!this.stream) return;
    try {
      this.stream.write(JSON.stringify(entry) + '\n');
    } catch { /* best-effort */ }
  }
}
