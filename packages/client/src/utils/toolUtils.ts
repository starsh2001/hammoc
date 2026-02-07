/**
 * Tool utility functions - shared between MessageArea (streaming) and ToolCallCard (history)
 * [Source: Story 7.2 - Task 1, Task 2]
 */

import {
  FileSearch,
  Pencil,
  FilePlus,
  Terminal,
  FolderSearch,
  Search,
  ListChecks,
  GitBranch,
  Wrench,
} from 'lucide-react';

/** Tool name → lucide-react icon component mapping */
const TOOL_ICONS: Record<string, typeof Wrench> = {
  Read: FileSearch,
  Edit: Pencil,
  Write: FilePlus,
  Bash: Terminal,
  Glob: FolderSearch,
  Grep: Search,
  TodoWrite: ListChecks,
  Task: GitBranch,
};

/**
 * Get the appropriate icon component for a tool by name.
 * Falls back to Wrench for unknown tools.
 */
export function getToolIcon(toolName: string): typeof Wrench {
  return TOOL_ICONS[toolName] ?? Wrench;
}

/** Tool display name overrides (shared between streaming and history views) */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  TodoWrite: 'Update Todos',
};

/**
 * Get display name for a tool. Returns override or original name.
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] ?? toolName;
}

/**
 * Format duration in milliseconds for display on tool cards.
 * - < 60s: "0.3s", "2.5s"
 * - >= 60s: "1m 23s"
 */
export function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

/**
 * Get primary display info for a tool, considering tool-specific priorities.
 * For Glob/Grep: pattern is the primary info.
 * For others: file_path > path > pattern > command.
 */
export function getToolDisplayInfo(toolName: string, input?: Record<string, unknown>): string | null {
  if (!input) return null;

  // Glob/Grep: pattern is the most informative primary display
  if (toolName === 'Glob' || toolName === 'Grep') {
    if (typeof input.pattern === 'string') return input.pattern;
  }

  // Bash: description first, fallback to command
  if (toolName === 'Bash') {
    if (typeof input.description === 'string') return input.description;
    if (typeof input.command === 'string') return input.command;
  }

  // Task: show short description
  if (toolName === 'Task') {
    if (typeof input.description === 'string') return input.description;
  }

  const rawInfo = input.file_path || input.path || input.pattern || input.command;
  return typeof rawInfo === 'string' ? rawInfo : null;
}

/**
 * Get extra params for Glob/Grep to show in ToolPathDisplay when expanded.
 * Only returns params not already shown as primary displayInfo.
 */
export function getToolExtraParams(
  toolName: string,
  input?: Record<string, unknown>
): { label: string; value: string }[] | null {
  if (!input) return null;
  const params: { label: string; value: string }[] = [];

  if (toolName === 'Glob' || toolName === 'Grep') {
    if (typeof input.path === 'string') {
      params.push({ label: 'path', value: input.path });
    }
  }

  if (toolName === 'Bash') {
    // Show command as extra param only when description is the primary display
    if (typeof input.description === 'string' && typeof input.command === 'string') {
      params.push({ label: 'IN', value: input.command });
    }
  }

  if (toolName === 'Task') {
    if (typeof input.subagent_type === 'string') {
      params.push({ label: 'agent', value: input.subagent_type });
    }
    if (typeof input.model === 'string') {
      params.push({ label: 'model', value: input.model });
    }
    if (typeof input.prompt === 'string') {
      params.push({ label: 'prompt', value: input.prompt });
    }
  }

  return params.length > 0 ? params : null;
}
