import type { ChatServiceConfig, EngineMode } from '@hammoc/shared';
import type { ChatEngine } from './chatEngine.js';
import { ChatService } from './chatService.js';
import { CliChatEngine } from './cliChatEngine.js';

/**
 * Single creation point for conversation engines (Epic 32 seam).
 *
 * Every conversation-path engine instance is created *only* through this factory.
 * Story 32.4 filled in the `'cli'` branch (the CLI PTY + session JSONL engine) as
 * the seam's second implementation — without touching any call site.
 *
 * Until Epic 33 wires mode selection into settings, callers pass
 * `DEFAULT_ENGINE_MODE` (always `'sdk'`), so the `'cli'` branch is only reached by
 * tests and manual verification.
 */
export function createChatEngine(mode: EngineMode, config: ChatServiceConfig): ChatEngine {
  switch (mode) {
    case 'sdk':
      return new ChatService(config);
    case 'cli':
      return new CliChatEngine(config);
    default: {
      // Exhaustiveness guard: if EngineMode gains a member, this stops compiling
      // until the new mode is handled above.
      const exhaustive: never = mode;
      throw new Error(`Unknown engine mode: ${String(exhaustive)}`);
    }
  }
}
