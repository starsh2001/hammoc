/**
 * Background-execution block policy shared by both chat engines (Story 36.1).
 *
 * Hammoc runs one CLI/SDK process per turn (turn-per-process) and kills it when
 * the turn ends, so a backgrounded tool call (`run_in_background: true`) would be
 * orphaned/killed and only leaves side effects (e.g. task-notification files).
 * A PreToolUse hook denies such calls before they reach the shell — and unlike
 * canUseTool, a PreToolUse deny also covers auto-approved tools (bypass/auto modes).
 *
 * SDK mode wires the check as an inline hook callback (see chatService); CLI mode
 * runs it as an external command hook (resources/hooks/block-background.cjs). The
 * two runtimes differ, so only the predicate + reason are shared here.
 *
 * ⚠️ The .cjs script duplicates BACKGROUND_BLOCK_REASON as a literal (it cannot
 * import a TS module); keep the two strings in sync.
 */
export const BACKGROUND_BLOCK_REASON =
  'Background execution is disabled in Hammoc: it runs one process per turn, so a backgrounded task is killed when the turn ends. Re-run without run_in_background (foreground).';

/** True when a tool call is a background Bash execution that must be blocked. */
export function isBlockedBackgroundCall(toolName: string, toolInput: unknown): boolean {
  return (
    toolName === 'Bash' &&
    typeof toolInput === 'object' &&
    toolInput !== null &&
    (toolInput as { run_in_background?: unknown }).run_in_background === true
  );
}
