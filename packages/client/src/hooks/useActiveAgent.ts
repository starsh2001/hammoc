import { useMemo } from 'react';
import type { HistoryMessage, SlashCommand } from '@bmad-studio/shared';
import { detectAgentFromPrompt } from '../utils/agentUtils';

/**
 * Detect the active agent from session messages.
 * Scans loaded messages in reverse for the last agent command,
 * falling back to server-provided lastAgentCommand for paginated sessions.
 */
export function useActiveAgent(
  messages: HistoryMessage[],
  commands: SlashCommand[],
  serverLastAgentCommand?: string | null
): { activeAgent: SlashCommand | null } {
  const activeAgent = useMemo(() => {
    // 1. Scan loaded messages in reverse for the last agent command
    //    (handles mid-session agent switching and streaming detection)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        const agent = detectAgentFromPrompt(messages[i].content, commands);
        if (agent) return agent;
      }
    }

    // 2. Fall back to server metadata (handles paginated sessions where
    //    the agent command is in an unloaded earlier page)
    if (serverLastAgentCommand) {
      return detectAgentFromPrompt(serverLastAgentCommand, commands);
    }

    return null;
  }, [messages, commands, serverLastAgentCommand]);

  return { activeAgent };
}
