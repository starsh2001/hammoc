#!/usr/bin/env node
/**
 * Mock Telegram Bot API server for integration tests.
 *
 * Emulates a tiny subset of https://api.telegram.org used by Hammoc's
 * notificationService: `POST /bot<TOKEN>/sendMessage`.
 *
 * Additional admin endpoints (for test assertions):
 *   GET  /mock-telegram/health         — health probe
 *   GET  /mock-telegram/messages       — all recorded sendMessage payloads
 *   POST /mock-telegram/reset          — clear message log
 *   POST /mock-telegram/mode           — body: { mode: 'ok'|'401'|'400'|'429' }
 *
 * Usage (standalone):
 *   node scripts/mock-telegram.mjs --port=21230
 *
 * Set Hammoc's BOT_API_BASE_URL to http://127.0.0.1:<port> so the server
 * routes Telegram calls to this mock instead of the real API.
 */

import { createServer } from 'http';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const eqIdx = arg.indexOf('=');
    const key = eqIdx === -1 ? arg : arg.slice(0, eqIdx);
    const value = eqIdx === -1 ? undefined : arg.slice(eqIdx + 1);
    if (key === '--port') out.port = parseInt(value, 10);
  }
  return out;
}

const opts = parseArgs(process.argv);
const PORT = opts.port ?? parseInt(process.env.MOCK_TELEGRAM_PORT || '21230', 10);

const messages = [];
let responseMode = 'ok'; // 'ok' | '401' | '400' | '429'

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const serialized = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(serialized),
  });
  res.end(serialized);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ── Admin endpoints ──
  if (req.method === 'GET' && pathname === '/mock-telegram/health') {
    sendJson(res, 200, { ok: true, mode: responseMode, messageCount: messages.length });
    return;
  }

  if (req.method === 'GET' && pathname === '/mock-telegram/messages') {
    sendJson(res, 200, { messages });
    return;
  }

  if (req.method === 'POST' && pathname === '/mock-telegram/reset') {
    messages.length = 0;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/mock-telegram/mode') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      if (!['ok', '401', '400', '429'].includes(data.mode)) {
        sendJson(res, 400, { error: 'Invalid mode. Use: ok, 401, 400, 429' });
        return;
      }
      responseMode = data.mode;
      sendJson(res, 200, { ok: true, mode: responseMode });
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
    }
    return;
  }

  // ── Telegram Bot API emulation ──
  const botMatch = pathname.match(/^\/bot([^/]+)\/sendMessage$/);
  if (req.method === 'POST' && botMatch) {
    const token = botMatch[1];
    let payload;
    try {
      const body = await readBody(req);
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { ok: false, error_code: 400, description: 'Bad Request: invalid JSON' });
      return;
    }

    messages.push({
      timestamp: new Date().toISOString(),
      token,
      chat_id: payload.chat_id,
      text: payload.text,
      parse_mode: payload.parse_mode,
    });

    if (responseMode === '401') {
      sendJson(res, 401, { ok: false, error_code: 401, description: 'Unauthorized' });
      return;
    }
    if (responseMode === '400') {
      sendJson(res, 400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' });
      return;
    }
    if (responseMode === '429') {
      sendJson(res, 429, {
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 30',
        parameters: { retry_after: 30 },
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      result: {
        message_id: messages.length,
        date: Math.floor(Date.now() / 1000),
        chat: { id: Number(payload.chat_id) || 0 },
        text: payload.text,
      },
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-telegram] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-telegram] Set BOT_API_BASE_URL=http://127.0.0.1:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
