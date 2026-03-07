/**
 * SlashCommand types for command autocomplete
 * [Source: Story 5.1 - Task 1]
 */

export interface SlashCommand {
  /** Full command string, e.g., "/BMad:agents:pm" */
  command: string;
  /** Display name, e.g., "PM (Product Manager)" */
  name: string;
  /** Brief description of what this command does */
  description?: string;
  /** Command category for grouping */
  category: 'agent' | 'task' | 'builtin' | 'skill';
  /** Agent icon emoji if available (from agent YAML) */
  icon?: string;
}

/**
 * Star command definition parsed from agent YAML commands: section
 * [Source: Story 9.8 - Task 1]
 */
export interface StarCommand {
  /** Agent ID this command belongs to (e.g., 'pm', 'dev', 'sm') */
  agentId: string;
  /** Star command name without * prefix (e.g., 'create-story', 'help') */
  command: string;
  /** Command description */
  description: string;
}

/**
 * Extended commands response with star commands
 * [Source: Story 9.8 - Task 1]
 */
export interface CommandsResponse {
  commands: SlashCommand[];
  starCommands: Record<string, StarCommand[]>;
}
