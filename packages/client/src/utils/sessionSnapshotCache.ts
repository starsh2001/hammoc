/**
 * Session snapshot cache — a browser-local "last seen" snapshot of a chat session, used to
 * paint the screen INSTANTLY on (re)entry / reconnect / mobile sleep-wake, BEFORE the server's
 * authoritative `stream:history` (and, in CLI mode, the `cli:screen-frame`) arrive over the wire.
 *
 * Why this exists: the message store and the CLI mirror are memory-only. A refresh, a new tab, or
 * a phone waking from sleep therefore starts blank and shows a loading skeleton until a full
 * WebSocket round-trip completes — which in CLI mode is the heaviest payload of all (a whole ANSI
 * screen frame). This cache removes that blank gap by pre-painting what this browser last saw.
 *
 * Safe under multi-browser sync: it is a pure OPTIMISTIC pre-paint, never a source of truth. The
 * server stays authoritative, and the first `stream:history` / `cli:screen-frame` overwrites
 * whatever we restored (stale-while-revalidate). A snapshot is only ever shown to the same browser
 * that wrote it and is never sent anywhere, so it cannot diverge other clients.
 *
 * Storage: a single localStorage key holding the most-recent N sessions (LRU). Each session keeps
 * only the tail of its messages, and the whole key is size-capped so it stays well under the
 * ~5MB localStorage budget. Writes are debounced and best-effort (storage disabled / quota
 * exceeded degrades silently to "no pre-paint", never an error).
 */

import type { HistoryMessage } from '@hammoc/shared';

const STORAGE_KEY = 'hammoc-session-snapshot';
const VERSION = 1;
/** Keep at most this many sessions (LRU by last-write time). */
const MAX_SESSIONS = 5;
/** Keep only the tail of each session's transcript — the bottom is what the user sees first. */
const MAX_MESSAGES_PER_SESSION = 120;
/** Hard ceiling on the serialized key so we never crowd out other localStorage users. */
const MAX_TOTAL_BYTES = 1_500_000;
/** Coalesce bursts of saves (every stream tick calls setMessages) into one write. */
const SAVE_DEBOUNCE_MS = 800;

export interface SessionSnapshot {
  messages: HistoryMessage[];
  /** Last CLI mirror screen frame (serialized ANSI), or null for SDK-mode sessions. */
  frame: string | null;
  /** Last-write epoch ms — drives LRU eviction. */
  ts: number;
}

interface CacheShape {
  version: number;
  sessions: Record<string, SessionSnapshot>;
}

function emptyCache(): CacheShape {
  return { version: VERSION, sessions: {} };
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function readCache(): CacheShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCache();
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed || parsed.version !== VERSION || typeof parsed.sessions !== 'object' || parsed.sessions === null) {
      return emptyCache();
    }
    return parsed;
  } catch {
    // Corrupt JSON / disabled storage — start fresh rather than throwing into the render path.
    return emptyCache();
  }
}

function writeCache(cache: CacheShape): void {
  // LRU prune: keep only the most-recent MAX_SESSIONS sessions by ts.
  let entries = Object.entries(cache.sessions).sort((a, b) => b[1].ts - a[1].ts);
  if (entries.length > MAX_SESSIONS) entries = entries.slice(0, MAX_SESSIONS);

  // Size guard: if the serialized key is too large, drop the oldest sessions until it fits
  // (or only one remains — a single oversized session is still better than no pre-paint).
  let next: CacheShape = { version: VERSION, sessions: Object.fromEntries(entries) };
  let serialized = safeStringify(next);
  while (serialized !== null && serialized.length > MAX_TOTAL_BYTES && entries.length > 1) {
    entries = entries.slice(0, entries.length - 1);
    next = { version: VERSION, sessions: Object.fromEntries(entries) };
    serialized = safeStringify(next);
  }
  if (serialized === null) return;
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // QuotaExceeded or storage disabled — best-effort; a missed pre-paint is harmless.
  }
}

// --- Debounced write buffer -------------------------------------------------
// Pending per-session patches not yet flushed to localStorage. loadSnapshot() merges these so a
// remount immediately after a save still sees the latest, even before the debounce fires.
let pending: Record<string, Partial<Pick<SessionSnapshot, 'messages' | 'frame'>>> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushSnapshotsNow, SAVE_DEBOUNCE_MS);
}

/** Flush any buffered snapshot writes to localStorage immediately (also used by tests). */
export function flushSnapshotsNow(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const updates = pending;
  pending = {};
  if (Object.keys(updates).length === 0) return;

  const cache = readCache();
  for (const [sessionId, patch] of Object.entries(updates)) {
    const prev = cache.sessions[sessionId];
    cache.sessions[sessionId] = {
      messages: patch.messages ?? prev?.messages ?? [],
      frame: patch.frame !== undefined ? patch.frame : (prev?.frame ?? null),
      ts: Date.now(),
    };
  }
  writeCache(cache);
}

/** Cache the latest authoritative transcript for a session (tail only). No-op for empty input. */
export function saveMessagesSnapshot(sessionId: string, messages: HistoryMessage[]): void {
  if (!sessionId || messages.length === 0) return;
  pending[sessionId] = {
    ...pending[sessionId],
    messages: messages.slice(-MAX_MESSAGES_PER_SESSION),
  };
  scheduleFlush();
}

/** Cache the latest CLI mirror screen frame for a session. */
export function saveFrameSnapshot(sessionId: string, frame: string): void {
  if (!sessionId) return;
  pending[sessionId] = { ...pending[sessionId], frame };
  scheduleFlush();
}

/** Return this browser's last-seen snapshot for a session, merging un-flushed pending writes. */
export function loadSnapshot(sessionId: string): SessionSnapshot | null {
  if (!sessionId) return null;
  const stored = readCache().sessions[sessionId];
  const pend = pending[sessionId];
  if (!stored && !pend) return null;
  return {
    messages: pend?.messages ?? stored?.messages ?? [],
    frame: pend?.frame !== undefined ? pend.frame : (stored?.frame ?? null),
    ts: stored?.ts ?? Date.now(),
  };
}

/** Test helper — clear the buffer and the persisted key. */
export function __resetSnapshotCacheForTests(): void {
  pending = {};
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
