import type { ChatServiceConfig, EngineMode } from '@hammoc/shared';
import type { ChatEngine } from './chatEngine.js';
import { ChatService } from './chatService.js';

/**
 * Single creation point for conversation engines (Epic 32 seam).
 *
 * Every conversation-path engine instance is created *only* through this factory,
 * so a follow-up story can introduce the CLI (PTY + session JSONL) engine by
 * filling in the `'cli'` branch — without touching any call site.
 *
 * Until Epic 33 wires mode selection into settings, callers pass
 * `DEFAULT_ENGINE_MODE` (always `'sdk'`).
 */
export function createChatEngine(mode: EngineMode, config: ChatServiceConfig): ChatEngine {
  switch (mode) {
    case 'sdk':
      return new ChatService(config);
    case 'cli':
      throw new Error('CLI engine not implemented yet (Epic 32 follow-up story)');
    default: {
      // Exhaustiveness guard: if EngineMode gains a member, this stops compiling
      // until the new mode is handled above.
      const exhaustive: never = mode;
      throw new Error(`Unknown engine mode: ${String(exhaustive)}`);
    }
  }
}
