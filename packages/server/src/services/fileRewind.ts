/**
 * Shared standalone file-rewind mechanism (Epic 32 — Story 32.5).
 *
 * `rewindSessionFiles` is the SINGLE billing-neutral rewind primitive that BOTH
 * conversation engines delegate to — `ChatService` (SDK mode) and `CliChatEngine`
 * (CLI / subscription-pool mode). It was extracted verbatim from the mechanism
 * Story 32.3 placed in `ChatService.rewindFiles` so the `--session-id`+`--resume`
 * footgun guard lives in exactly one place (no comment drift, no chance a later
 * edit re-adds `sessionId` to one engine but not the other).
 *
 * Why CLI mode may reuse an SDK `query()` here even though Epic 32 exists to keep
 * conversation streaming OFF the SDK billing path: **rewind is a file-checkpoint
 * operation with no model call — 0 tokens.** A throwaway `query({ prompt: '' })`
 * is resumed only to drive its file-rewind control request; its async iterator is
 * never consumed, so no turn is ever sent to the model. Verified against real
 * claude (Story 32.5 AC4): rewinding a CLI-created session moved session/weekly
 * utilization by 0 and returned in ~2s (file op, not a model round-trip). Billing
 * is by *token usage*, so a 0-token rewind is neutral regardless of engine.
 *
 * This is therefore the documented exception to the 32.4 rule "the CLI engine does
 * not spawn the SDK directly": it is allowed precisely because it costs nothing.
 * It is also the ONLY programmatic rewind path — interactive claude exposes no
 * non-interactive rewind flag (`claude --help`: only `--resume`/`--continue`/
 * `--fork-session`/`--session-id`), its `/rewind` command is a full-screen ANSI
 * picker, and the SDK control-protocol rewind is headless-stream-json only.
 *
 * [Source: packages/server/src/services/chatService.ts (32.3 mechanism);
 *  docs/stories/32.5.story.md#AC1-AC3; node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2290-2300]
 */

import { query, type RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import { SessionService } from './sessionService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('fileRewind');

/**
 * Rewind tracked files for `sessionId` to their state at `messageUuid`. `dryRun`
 * previews the change (returns file stats) without writing. Returns the SDK's
 * `RewindFilesResult` verbatim (`canRewind` + optional `error`/file stats) so the
 * `session:rewind-files` handler maps it to the wire identically for either engine.
 *
 * @param cwd Project working directory — locates the session JSONL + tracked files.
 *            Pass `undefined` only when unknown; the dirty-marker side effect is then
 *            skipped (the SDK still resolves a cwd, but cannot be flagged for cleanup).
 */
export async function rewindSessionFiles(
  params: { sessionId: string; messageUuid: string; dryRun?: boolean },
  cwd: string | undefined,
): Promise<RewindFilesResult> {
  const { sessionId, messageUuid, dryRun } = params;
  const rewindQuery = query({
    prompt: '',
    options: {
      resume: sessionId,
      cwd,
      enableFileCheckpointing: true,
      // Do NOT pass sessionId here — CLI rejects --session-id combined with
      // --resume unless --fork-session is also set. resume: sessionId already
      // identifies the session.
    },
  });

  try {
    const result = await rewindQuery.rewindFiles(messageUuid, { dryRun: !!dryRun });
    log.info(`rewindFiles result: canRewind=${result.canRewind}, filesChanged=${result.filesChanged?.length ?? 0}, insertions=${result.insertions ?? 0}, deletions=${result.deletions ?? 0}`);
    return result;
  } finally {
    // Mark session as dirty BEFORE close — the throwaway query({ prompt: '' })
    // leaves an empty user message in the JSONL. On the SDK send path that empty
    // message triggers cache_control 400, so cleanRewindDirty strips it before the
    // next SDK resume. (Interactive claude --resume tolerates it — verified Story
    // 32.5 AC4 — so the CLI engine does not clean; any later SDK resume self-heals.)
    if (cwd) new SessionService().markRewindDirty(cwd, sessionId);
    // Clean up the throwaway query object.
    try { rewindQuery.close(); } catch { /* best-effort */ }
  }
}
