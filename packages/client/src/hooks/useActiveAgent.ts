import { useMemo } from 'react';
import type { HistoryMessage, SlashCommand } from '@bmad-studio/shared';
import { detectAgentFromPrompt } from '../utils/agentUtils';

/**
 * Detect the active agent from session messages.
 * Checks the first user message against available agent commands.
 */
export function useActiveAgent(
  messages: HistoryMessage[],
  commands: SlashCommand[]
): { activeAgent: SlashCommand | null } {
  const activeAgent = useMemo(() => {
    const firstUserMessage = messages.find((m) => m.type === 'user');
    if (!firstUserMessage) return null;
    return detectAgentFromPrompt(firstUserMessage.content, commands);
  }, [messages, commands]);

  return { activeAgent };
}
