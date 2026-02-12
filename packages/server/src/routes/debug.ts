/**
 * Debug Routes - Server-side logging for client debugging
 */

import { Router, Request, Response } from 'express';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const router = Router();

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Current log file path (rotates daily)
function getCurrentLogFile(): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(logsDir, `debug-${date}.log`);
}

function formatEntry(entry: { ts?: string; category: string; event: string; data?: Record<string, unknown> }): string {
  const ts = entry.ts || new Date().toISOString();
  const dataStr = entry.data ? ' ' + JSON.stringify(entry.data) : '';
  return `[${ts}] [${entry.category}] ${entry.event}${dataStr}\n`;
}

/**
 * POST /api/debug/log
 * Append client-side debug logs to server file (supports single or batch)
 */
router.post('/log', (req: Request, res: Response) => {
  const logFile = getCurrentLogFile();

  try {
    // Batch mode: { batch: LogEntry[] }
    if (req.body.batch && Array.isArray(req.body.batch)) {
      const lines = req.body.batch
        .filter((e: Record<string, unknown>) => e.category && e.event)
        .map(formatEntry)
        .join('');
      if (lines) {
        appendFileSync(logFile, lines, 'utf-8');
      }
      res.status(200).json({ success: true });
      return;
    }

    // Single mode: { category, event, data, timestamp }
    const { category, event } = req.body;
    if (!category || !event) {
      res.status(400).json({ error: 'Missing category or event' });
      return;
    }

    appendFileSync(logFile, formatEntry(req.body), 'utf-8');
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Debug API] Failed to write log:', err);
    res.status(500).json({ error: 'Failed to write log' });
  }
});

export default router;
