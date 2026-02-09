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

/**
 * Get the display label for an agent in a list context: "Role (Name)"
 * Avoids redundancy when name already matches the role label.
 */
export function getAgentDisplayLabel(agent: SlashCommand): string {
  const roleLabel = formatAgentRoleLabel(agent.command);
  if (!roleLabel) return agent.name;

  // Avoid redundancy: if name ≈ role label, just show name
  const normalizedRole = roleLabel.toLowerCase().replace(/\s/g, '');
  const normalizedName = agent.name.toLowerCase().replace(/\s/g, '');
  if (normalizedRole === normalizedName) return agent.name;

  return `${roleLabel} (${agent.name})`;
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

// Description overrides per agent ID (null = suppress description)
const DESCRIPTION_OVERRIDES: Record<string, string | null> = {
  'qa': 'Quality Advisor',
  'bmad-master': null,
  'bmad-orchestrator': null,
};

/**
 * Get the display description for an agent, applying overrides.
 * Returns null if the description should be hidden.
 */
export function getAgentDescription(agent: SlashCommand): string | null {
  const id = getAgentId(agent.command);
  if (id in DESCRIPTION_OVERRIDES) return DESCRIPTION_OVERRIDES[id];
  return agent.description ?? null;
}

/**
 * Categorize agents into workflow-phase groups: Planning → Implementation → Other.
 * Within each group, agents follow a predefined order.
 * Unknown agents go to "기타" (Other).
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
  if (planningAgents.length > 0) groups.push({ label: 'Planning', testId: 'bmad-group-planning', agents: planningAgents });
  if (implAgents.length > 0) groups.push({ label: 'Implementation', testId: 'bmad-group-implementation', agents: implAgents });
  if (otherAgents.length > 0) groups.push({ label: 'Other', testId: 'bmad-group-other', agents: otherAgents });

  return groups;
}
