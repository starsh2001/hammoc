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
 * Tools that support generic expand/collapse for detail parameters.
 * Excludes: Edit/Write (own collapse), Bash (ToolPathDisplay shows full command), TodoWrite (separate rendering)
 */
export const EXPANDABLE_TOOLS = new Set(['Read', 'Glob', 'Grep']);

/**
 * Extract detail parameters to show in expand/collapse panel for a tool.
 */
export function getToolDetailParams(
  toolName: string,
  input?: Record<string, unknown>
): { label: string; value: string }[] | null {
  if (!input || !EXPANDABLE_TOOLS.has(toolName)) return null;

  const params: { label: string; value: string }[] = [];

  if (toolName === 'Read') {
    if (typeof input.file_path === 'string') params.push({ label: 'file_path', value: input.file_path });
    if (input.limit != null) params.push({ label: 'limit', value: String(input.limit) });
    if (input.offset != null) params.push({ label: 'offset', value: String(input.offset) });
  } else if (toolName === 'Glob') {
    if (typeof input.pattern === 'string') params.push({ label: 'pattern', value: input.pattern });
    if (typeof input.path === 'string') params.push({ label: 'path', value: input.path });
  } else if (toolName === 'Grep') {
    if (typeof input.pattern === 'string') params.push({ label: 'pattern', value: input.pattern });
    if (typeof input.path === 'string') params.push({ label: 'path', value: input.path });
  }

  return params.length > 0 ? params : null;
}
