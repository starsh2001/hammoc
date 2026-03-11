/**
 * Tool utility tests - getToolIcon, formatDuration, getToolDetailParams
 * [Source: Story 7.2 - Task 4]
 */

import { describe, it, expect } from 'vitest';
import { getToolIcon, getToolDisplayName, formatDuration, getToolDisplayInfo, getToolExtraParams } from '../toolUtils';
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
  Globe,
  ClipboardList,
  SearchCode,
} from 'lucide-react';

describe('getToolIcon', () => {
  it('returns FileSearch for Read', () => {
    expect(getToolIcon('Read')).toBe(FileSearch);
  });

  it('returns Pencil for Edit', () => {
    expect(getToolIcon('Edit')).toBe(Pencil);
  });

  it('returns FilePlus for Write', () => {
    expect(getToolIcon('Write')).toBe(FilePlus);
  });

  it('returns Terminal for Bash', () => {
    expect(getToolIcon('Bash')).toBe(Terminal);
  });

  it('returns FolderSearch for Glob', () => {
    expect(getToolIcon('Glob')).toBe(FolderSearch);
  });

  it('returns Search for Grep', () => {
    expect(getToolIcon('Grep')).toBe(Search);
  });

  it('returns ListChecks for TodoWrite', () => {
    expect(getToolIcon('TodoWrite')).toBe(ListChecks);
  });

  it('returns GitBranch for Agent', () => {
    expect(getToolIcon('Agent')).toBe(GitBranch);
  });

  it('returns GitBranch for Task (legacy)', () => {
    expect(getToolIcon('Task')).toBe(GitBranch);
  });

  it('returns ClipboardList for TaskOutput', () => {
    expect(getToolIcon('TaskOutput')).toBe(ClipboardList);
  });

  it('returns SearchCode for ToolSearch', () => {
    expect(getToolIcon('ToolSearch')).toBe(SearchCode);
  });

  it('returns Globe for WebSearch', () => {
    expect(getToolIcon('WebSearch')).toBe(Globe);
  });

  it('returns Globe for WebFetch', () => {
    expect(getToolIcon('WebFetch')).toBe(Globe);
  });

  it('returns Wrench for unknown tools (fallback)', () => {
    expect(getToolIcon('UnknownTool')).toBe(Wrench);
    expect(getToolIcon('')).toBe(Wrench);
  });
});

describe('formatDuration', () => {
  it('formats sub-second durations', () => {
    expect(formatDuration(300)).toBe('0.3s');
    expect(formatDuration(50)).toBe('0.1s');
    expect(formatDuration(0)).toBe('0.0s');
  });

  it('formats durations between 1-60 seconds', () => {
    expect(formatDuration(2500)).toBe('2.5s');
    expect(formatDuration(10000)).toBe('10.0s');
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats durations of 60 seconds or more', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(83000)).toBe('1m 23s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

describe('getToolDisplayInfo', () => {
  it('returns file_path for Read tool', () => {
    expect(getToolDisplayInfo('Read', { file_path: '/src/index.ts' })).toBe('/src/index.ts');
  });

  it('returns description for Bash tool when available', () => {
    expect(getToolDisplayInfo('Bash', { command: 'ls -la', description: 'List files' })).toBe('List files');
  });

  it('returns command for Bash tool when no description', () => {
    expect(getToolDisplayInfo('Bash', { command: 'ls -la' })).toBe('ls -la');
  });

  it('returns pattern as primary for Glob tool', () => {
    expect(getToolDisplayInfo('Glob', { pattern: '**/*.ts', path: '/src' })).toBe('**/*.ts');
  });

  it('returns pattern as primary for Grep tool', () => {
    expect(getToolDisplayInfo('Grep', { pattern: 'import.*from', path: '/src' })).toBe('import.*from');
  });

  it('returns description for Agent tool', () => {
    expect(getToolDisplayInfo('Agent', { description: 'Search codebase', prompt: 'Find all usages', subagent_type: 'Explore' })).toBe('Search codebase');
  });

  it('returns description for Task tool (legacy)', () => {
    expect(getToolDisplayInfo('Task', { description: 'Search codebase', prompt: 'Find all usages', subagent_type: 'Explore' })).toBe('Search codebase');
  });

  it('returns task_id for TaskOutput tool', () => {
    expect(getToolDisplayInfo('TaskOutput', { task_id: 'abc123', block: true, timeout: 30000 })).toBe('abc123');
  });

  it('returns query for ToolSearch tool', () => {
    expect(getToolDisplayInfo('ToolSearch', { query: 'select:NotebookEdit', max_results: 5 })).toBe('select:NotebookEdit');
  });

  it('returns query for WebSearch tool', () => {
    expect(getToolDisplayInfo('WebSearch', { query: 'React hooks best practices' })).toBe('React hooks best practices');
  });

  it('returns url for WebFetch tool', () => {
    expect(getToolDisplayInfo('WebFetch', { url: 'https://example.com/api' })).toBe('https://example.com/api');
  });

  it('returns null when input is undefined', () => {
    expect(getToolDisplayInfo('Read', undefined)).toBeNull();
  });

  it('falls back through priority for non-Glob/Grep tools', () => {
    expect(getToolDisplayInfo('Unknown', { path: '/foo', pattern: 'bar' })).toBe('/foo');
  });
});

describe('getToolExtraParams', () => {
  it('returns path for Glob tool', () => {
    expect(getToolExtraParams('Glob', { pattern: '**/*.ts', path: '/src' })).toEqual([
      { label: 'path', value: '/src' },
    ]);
  });

  it('returns path for Grep tool', () => {
    expect(getToolExtraParams('Grep', { pattern: 'import', path: '/src' })).toEqual([
      { label: 'path', value: '/src' },
    ]);
  });

  it('returns agent, model, and prompt for Agent tool', () => {
    expect(getToolExtraParams('Agent', { description: 'Search', subagent_type: 'Explore', model: 'haiku', prompt: 'Find usages' })).toEqual([
      { label: 'agent', value: 'Explore' },
      { label: 'model', value: 'haiku' },
      { label: 'prompt', value: 'Find usages' },
    ]);
  });

  it('returns agent, model, and prompt for Task tool (legacy)', () => {
    expect(getToolExtraParams('Task', { description: 'Search', subagent_type: 'Explore', model: 'haiku', prompt: 'Find usages' })).toEqual([
      { label: 'agent', value: 'Explore' },
      { label: 'model', value: 'haiku' },
      { label: 'prompt', value: 'Find usages' },
    ]);
  });

  it('returns only agent for Agent tool without model/prompt', () => {
    expect(getToolExtraParams('Agent', { description: 'Search', subagent_type: 'Bash' })).toEqual([
      { label: 'agent', value: 'Bash' },
    ]);
  });

  it('returns full prompt without truncation for Agent tool', () => {
    const longPrompt = 'A'.repeat(500);
    const result = getToolExtraParams('Agent', { description: 'Search', subagent_type: 'Explore', prompt: longPrompt });
    const promptParam = result?.find(p => p.label === 'prompt');
    expect(promptParam?.value).toBe(longPrompt);
  });

  it('returns IN for Bash tool when description is primary', () => {
    expect(getToolExtraParams('Bash', { command: 'npm test', description: 'Run tests' })).toEqual([
      { label: 'IN', value: 'npm test' },
    ]);
  });

  it('returns null for Bash tool without description (command is primary)', () => {
    expect(getToolExtraParams('Bash', { command: 'npm test' })).toBeNull();
  });

  it('returns null when no extra params exist', () => {
    expect(getToolExtraParams('Glob', { pattern: '**/*.ts' })).toBeNull();
  });

  it('returns null for non-Glob/Grep/Agent/Bash tools', () => {
    expect(getToolExtraParams('Read', { file_path: '/foo', path: '/bar' })).toBeNull();
  });

  it('returns null when input is undefined', () => {
    expect(getToolExtraParams('Glob', undefined)).toBeNull();
  });
});

describe('getToolDisplayName', () => {
  it('returns override for TodoWrite', () => {
    expect(getToolDisplayName('TodoWrite')).toBe('Update Todos');
  });

  it('returns original name for non-overridden tools', () => {
    expect(getToolDisplayName('Read')).toBe('Read');
    expect(getToolDisplayName('Bash')).toBe('Bash');
  });

  it('returns empty string for empty input', () => {
    expect(getToolDisplayName('')).toBe('');
  });
});
