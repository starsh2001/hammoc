import type { SlashCommand } from '@bmad-studio/shared';

/**
 * Detect agent from the first user prompt by exact-matching against agent commands.
 * Returns the matching SlashCommand or null if no match.
 */
export function detectAgentFromPrompt(
  firstPrompt: string,
  commands: SlashCommand[]
): SlashCommand | null {
  const trimmed = firstPrompt.trim();
  if (!trimmed) return null;
  return commands.find(
    (cmd) => cmd.category === 'agent' && cmd.command === trimmed
  ) ?? null;
}
