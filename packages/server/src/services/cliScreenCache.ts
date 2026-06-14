/**
 * CLI screen cache (Story 37.7, reworked in 37.8) — a session-lifetime snapshot of the
 * current claude TUI screen, used to restore late-joining / refreshed / collapse-expanded
 * browsers in CLI mode.
 *
 * The Story 37.1 headless emulator is per-TURN (spawned with the PTY, disposed at teardown).
 * But the CLI engine is turn-per-process, so between turns there is no emulator and no live
 * PTY. This cache lives at the SESSION scope: while a turn streams, the engine refreshes it
 * with the CURRENT serialized screen on the same ~100ms throttle as the live `cli:screen-frame`
 * (so a late-join mid-turn restores the live screen, not a stale one), and hands off the FINAL
 * serialized screen at teardown. A `session:join` or `cli:request-screen-frame` arriving
 * between turns then has a "current screen" to send.
 *
 * Story 37.8: the entry is now a single SERIALIZED frame string (ANSI/color intact, produced
 * by the screen model's serialize addon), not a plain-text grid — the client restores it via
 * reset()+write(frame), identical to a live frame, so restore and live share one render path.
 *
 * Pure module-level Map. CLI-only; SDK mode never writes it (no PTY / screen model), so `get`
 * returns undefined for SDK sessions and the frame push is naturally a no-op.
 */

interface CliScreenEntry {
  frame: string;
  /**
   * Soft screen-stall flag (cliScreenStallWatchdog), mirrored onto the session's screen entry so a
   * late-joining / reconnecting socket can be resynced on session:join. The live `cli:screen-stall`
   * signal fires ONLY on a stalled↔live transition, so a socket that connected AFTER the stall began
   * (tab switch, mobile sleep/wake) would otherwise never learn the current state.
   */
  stalled: boolean;
  ts: number;
}

const cache = new Map<string, CliScreenEntry>();

/** Store (or replace) the current serialized screen frame for a session. `ts` records recency.
 *  Preserves the existing `stalled` flag — only the watchdog (setCliScreenStall) mutates that. */
export function setCliScreen(sessionId: string, frame: string): void {
  const prev = cache.get(sessionId);
  cache.set(sessionId, { frame, stalled: prev?.stalled ?? false, ts: Date.now() });
}

/** Return the cached serialized screen frame for a session, or undefined on a cache miss. */
export function getCliScreen(sessionId: string): string | undefined {
  return cache.get(sessionId)?.frame;
}

/** Update the soft screen-stall flag on an EXISTING screen entry. No-op on a cache miss, so a
 *  frame-less (leak-prone) entry is never created — a cached screen frame is what defines a session. */
export function setCliScreenStall(sessionId: string, stalled: boolean): void {
  const prev = cache.get(sessionId);
  if (!prev) return;
  cache.set(sessionId, { ...prev, stalled });
}

/** Current cached stall flag for a session (false on a miss). Used to resync late joiners. */
export function getCliScreenStall(sessionId: string): boolean {
  return cache.get(sessionId)?.stalled ?? false;
}

/** Drop a session's cached screen (called when its socket room empties — leak guard). */
export function deleteCliScreen(sessionId: string): void {
  cache.delete(sessionId);
}
