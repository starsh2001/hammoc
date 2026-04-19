/**
 * Debug Routes - Server-side logging and test helpers (dev only)
 */

import { Router, Request, Response } from 'express';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { getIO } from '../handlers/websocket.js';

const log = createLogger('debugRoute');

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
    log.error('Failed to write log:', err);
    res.status(500).json({ error: 'Failed to write log' });
  }
});

/**
 * POST /api/debug/kill-ws
 * Forcibly disconnect WebSocket sockets for a session (dev test helper for R-01-01).
 * Body: { sessionId?: string } — if omitted, disconnects all connected sockets.
 */
router.post('/kill-ws', async (req: Request, res: Response) => {
  try {
    const io = getIO();
    const { sessionId } = req.body as { sessionId?: string };

    if (sessionId) {
      const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
      if (!room || room.size === 0) {
        res.status(404).json({ error: 'No sockets found for sessionId', sessionId });
        return;
      }
      let count = 0;
      for (const socketId of room) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock) {
          sock.disconnect(true);
          count++;
        }
      }
      log.info(`kill-ws: disconnected ${count} socket(s) for session ${sessionId}`);
      res.status(200).json({ success: true, disconnected: count, sessionId });
    } else {
      // Disconnect all connected sockets (no sessionId filter)
      const sockets = await io.fetchSockets();
      for (const sock of sockets) {
        sock.disconnect(true);
      }
      log.info(`kill-ws: disconnected all ${sockets.length} socket(s)`);
      res.status(200).json({ success: true, disconnected: sockets.length });
    }
  } catch (err) {
    log.error('kill-ws failed:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
