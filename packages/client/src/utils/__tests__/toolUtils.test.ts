/**
 * Tool utility tests - getToolIcon, formatDuration, getToolDetailParams
 * [Source: Story 7.2 - Task 4]
 */

import { describe, it, expect } from 'vitest';
import { getToolIcon, getToolDisplayName, formatDuration, getToolDetailParams, EXPANDABLE_TOOLS } from '../toolUtils';
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

describe('getToolDetailParams', () => {
  it('returns null for non-expandable tools', () => {
    expect(getToolDetailParams('Edit', { file_path: '/foo' })).toBeNull();
    expect(getToolDetailParams('Write', { file_path: '/foo' })).toBeNull();
    expect(getToolDetailParams('Bash', { command: 'ls' })).toBeNull();
    expect(getToolDetailParams('TodoWrite', { todos: [] })).toBeNull();
  });

  it('returns null when input is undefined', () => {
    expect(getToolDetailParams('Read', undefined)).toBeNull();
  });

  it('returns file_path for Read tool', () => {
    const params = getToolDetailParams('Read', { file_path: '/src/index.ts' });
    expect(params).toEqual([{ label: 'file_path', value: '/src/index.ts' }]);
  });

  it('returns file_path with limit and offset for Read tool', () => {
    const params = getToolDetailParams('Read', { file_path: '/src/index.ts', limit: 50, offset: 10 });
    expect(params).toEqual([
      { label: 'file_path', value: '/src/index.ts' },
      { label: 'limit', value: '50' },
      { label: 'offset', value: '10' },
    ]);
  });

  it('returns pattern for Glob tool', () => {
    const params = getToolDetailParams('Glob', { pattern: '**/*.ts' });
    expect(params).toEqual([{ label: 'pattern', value: '**/*.ts' }]);
  });

  it('returns pattern and path for Grep tool', () => {
    const params = getToolDetailParams('Grep', { pattern: 'import.*from', path: '/src' });
    expect(params).toEqual([
      { label: 'pattern', value: 'import.*from' },
      { label: 'path', value: '/src' },
    ]);
  });
});

describe('EXPANDABLE_TOOLS', () => {
  it('includes Read, Glob, Grep', () => {
    expect(EXPANDABLE_TOOLS.has('Read')).toBe(true);
    expect(EXPANDABLE_TOOLS.has('Glob')).toBe(true);
    expect(EXPANDABLE_TOOLS.has('Grep')).toBe(true);
  });

  it('excludes Edit, Write, Bash, TodoWrite', () => {
    expect(EXPANDABLE_TOOLS.has('Edit')).toBe(false);
    expect(EXPANDABLE_TOOLS.has('Write')).toBe(false);
    expect(EXPANDABLE_TOOLS.has('Bash')).toBe(false);
    expect(EXPANDABLE_TOOLS.has('TodoWrite')).toBe(false);
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
