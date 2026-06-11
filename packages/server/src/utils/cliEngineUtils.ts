/**
 * CLI Engine Utilities (Epic 33)
 * Small pure helpers for the CLI conversation engine's call-site gating logic.
 */

import type { EngineMode } from '@hammoc/shared';

/**
 * Decide whether to forward the CLI engine's generation-progress callback
 * (the "↓ N tokens · Ns" spinner counter, Story 32.7) to the browser.
 *
 * Gated on two conditions (Story 33.3):
 *   1. the effective engine is the CLI engine (the SDK engine ignores the callback
 *      anyway — real token streaming makes a counter unnecessary), and
 *   2. the user's `cliShowGenerationProgress` preference is enabled (default ON when
 *      unset — Story 33.2).
 *
 * When this returns false the call site passes `undefined`, so the engine's
 * `emitProgress` early-returns and no `generation:progress` event is emitted.
 */
export function shouldForwardCliProgress(
  engineMode: EngineMode,
  showProgressPref: boolean | undefined,
): boolean {
  return engineMode === 'cli' && (showProgressPref ?? true);
}

/**
 * Decide whether to forward the CLI engine's raw-screen passthrough (the read-only PTY
 * mirror) to the browser.
 *
 * Gated on two conditions:
 *   1. the effective engine is the CLI engine (the SDK engine has no PTY and never
 *      calls the callback anyway), and
 *   2. the user's `cliPtyMirror` preference is enabled (default ON when unset — Story
 *      37.7 promoted the mirror from a diagnostic opt-in to a default feature; the
 *      `false` opt-out is still honored so a user can turn it off).
 *
 * When this returns false the call site passes `undefined`, so the engine's onData
 * never invokes onPtyRaw and no `cli:pty-raw` event is emitted.
 */
export function shouldForwardCliPtyMirror(
  engineMode: EngineMode,
  mirrorPref: boolean | undefined,
): boolean {
  return engineMode === 'cli' && (mirrorPref ?? true);
}
