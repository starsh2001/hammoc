/**
 * CLI screen cache (Story 37.7) — a session-lifetime snapshot of the current claude TUI
 * screen grid, used to sync late-joining / refreshed browsers in CLI mode.
 *
 * The Story 37.1 headless emulator is per-TURN (spawned with the PTY, disposed at
 * teardown). But the CLI engine is turn-per-process, so between turns there is no
 * emulator and no live PTY. This cache lives at the SESSION scope: the engine hands off
 * the turn emulator's FINAL grid here (just before dispose) so a `session:join` arriving
 * between turns still has a "current screen" to send. The live `cli:pty-raw` stream is
 * skipped on buffer replay, so without this a late-joining socket would see a blank or
 * partial screen — a raw frame is an in-place overwrite delta, not a full screen.
 *
 * Pure module-level Map. CLI-only; SDK mode never writes it (no PTY / screen model), so
 * `get` returns undefined for SDK sessions and the snapshot push is naturally a no-op.
 */

interface CliScreenEntry {
  grid: string[];
  ts: number;
}

const cache = new Map<string, CliScreenEntry>();

/** Store (or replace) the current screen grid for a session. `ts` records recency. */
export function setCliScreen(sessionId: string, grid: string[]): void {
  cache.set(sessionId, { grid, ts: Date.now() });
}

/** Return the cached screen grid for a session, or undefined on a cache miss. */
export function getCliScreen(sessionId: string): string[] | undefined {
  return cache.get(sessionId)?.grid;
}

/** Drop a session's cached screen (called when its socket room empties — leak guard). */
export function deleteCliScreen(sessionId: string): void {
  cache.delete(sessionId);
}
