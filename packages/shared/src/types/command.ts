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
  /** Skill scope — project-level or global (~/.claude/skills/) */
  scope?: 'project' | 'global';
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
 * Snippet item for autocomplete popup
 * [Source: ISSUE-54 - Snippet autocomplete]
 */
export interface SnippetItem {
  /** Snippet file name (without extension) */
  name: string;
  /** First line preview of snippet content */
  preview?: string;
  /** Where this snippet was resolved from */
  source: 'project' | 'global' | 'bundled';
}

/**
 * Extended commands response with star commands
 * [Source: Story 9.8 - Task 1]
 */
export interface CommandsResponse {
  commands: SlashCommand[];
  starCommands: Record<string, StarCommand[]>;
  /** Project-level warnings (e.g., missing .claude/commands/ directory) */
  warnings?: string[];
}
