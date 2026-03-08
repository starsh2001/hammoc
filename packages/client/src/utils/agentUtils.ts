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

/**
 * Extract the agent ID from a command string.
 * e.g. "/BMad:agents:pm" → "pm", "/BMad:agents:ux-expert" → "ux-expert"
 */
export function getAgentId(command: string): string {
  const parts = command.split(':');
  return parts[parts.length - 1] || '';
}

/**
 * Extract a short role label from an agent command string.
 * e.g. "/BMad:agents:pm" → "PM", "/BMad:agents:dev" → "Dev",
 *      "/BMad:agents:ux-expert" → "UX Expert"
 */
export function formatAgentRoleLabel(command: string): string {
  const id = getAgentId(command);
  if (!id) return '';

  return id.split('-').map((word) => {
    if (word.length <= 2) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

/** Agent group definition for categorized display */
export interface AgentGroup {
  label: string;
  testId: string;
  agents: SlashCommand[];
}

// Agent IDs ordered by workflow phase
const PLANNING_ORDER = ['analyst', 'pm', 'ux-expert', 'architect'];
const IMPLEMENTATION_ORDER = ['sm', 'po', 'dev', 'qa'];

// Description override i18n keys per agent ID (null = suppress description)
// Values are i18n keys resolved by the consumer component via t()
const DESCRIPTION_OVERRIDE_KEYS: Record<string, string | null> = {
  'qa': 'agent.qaDescription',
  'bmad-master': null,
  'bmad-orchestrator': null,
};

/**
 * Get the display description for an agent, applying overrides.
 * Returns null if the description should be hidden.
 * When an i18n key is returned (starts with 'agent.'), the consumer should resolve via t().
 */
export function getAgentDescription(agent: SlashCommand): string | null {
  const id = getAgentId(agent.command);
  if (id in DESCRIPTION_OVERRIDE_KEYS) return DESCRIPTION_OVERRIDE_KEYS[id];
  return agent.description ?? null;
}

/**
 * Categorize agents into workflow-phase groups: Planning → Implementation → Other.
 * Within each group, agents follow a predefined order.
 * Unknown agents go to "Other".
 */
export function categorizeAgents(agents: SlashCommand[]): AgentGroup[] {
  const planningAgents: SlashCommand[] = [];
  const implAgents: SlashCommand[] = [];
  const otherAgents: SlashCommand[] = [];

  for (const agent of agents) {
    const id = getAgentId(agent.command);
    if (PLANNING_ORDER.includes(id)) {
      planningAgents.push(agent);
    } else if (IMPLEMENTATION_ORDER.includes(id)) {
      implAgents.push(agent);
    } else {
      otherAgents.push(agent);
    }
  }

  // Sort within groups by predefined order
  const sortByOrder = (list: SlashCommand[], order: string[]) =>
    list.sort((a, b) => order.indexOf(getAgentId(a.command)) - order.indexOf(getAgentId(b.command)));

  sortByOrder(planningAgents, PLANNING_ORDER);
  sortByOrder(implAgents, IMPLEMENTATION_ORDER);

  const groups: AgentGroup[] = [];
  if (planningAgents.length > 0) groups.push({ label: 'agent.groupPlanning', testId: 'bmad-group-planning', agents: planningAgents });
  if (implAgents.length > 0) groups.push({ label: 'agent.groupImplementation', testId: 'bmad-group-implementation', agents: implAgents });
  if (otherAgents.length > 0) groups.push({ label: 'agent.groupOther', testId: 'bmad-group-other', agents: otherAgents });

  return groups;
}
