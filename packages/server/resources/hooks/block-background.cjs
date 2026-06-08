// CLI-mode PreToolUse command hook (Story 36.1): deny background Bash calls.
//
// claude (interactive CLI) runs this as an external process per PreToolUse event,
// piping the hook input JSON on stdin. We deny `run_in_background: true` Bash so
// Hammoc's turn-per-process model never spawns a doomed background task. A deny
// here bypasses canUseTool, so it also blocks auto-approved (bypass/auto) calls.
//
// Bundled under packages/server/resources/ (npm `files` includes resources/), so
// the path resolves identically in dev and prod.
//
// ⚠️ Keep permissionDecisionReason in sync with BACKGROUND_BLOCK_REASON in
//    packages/server/src/utils/backgroundBlock.ts (a .cjs cannot import the TS module).
'use strict';

let data = '';
process.stdin.on('data', (chunk) => {
  data += chunk;
});
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(data);
  } catch (_e) {
    // Malformed input: do nothing (allow), never block the conversation on a parse error.
  }
  const toolInput = (input && input.tool_input) || {};
  if (input && input.tool_name === 'Bash' && toolInput.run_in_background === true) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            'Background execution is disabled in Hammoc: it runs one process per turn, so a backgrounded task is killed when the turn ends. Re-run without run_in_background (foreground).',
        },
      })
    );
  }
  process.exit(0);
});
