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
