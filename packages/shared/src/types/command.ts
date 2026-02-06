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
  category: 'agent' | 'task' | 'builtin';
  /** Agent icon emoji if available (from agent YAML) */
  icon?: string;
}

export interface CommandListResponse {
  commands: SlashCommand[];
}
