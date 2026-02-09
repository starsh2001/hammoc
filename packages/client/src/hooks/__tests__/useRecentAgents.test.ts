/**
 * useRecentAgents Tests
 * [Source: Story 8.4 - Task 5]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecentAgents } from '../useRecentAgents';

describe('useRecentAgents', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // TC: Initial state returns empty array (AC 5)
  it('returns empty array on initial state', () => {
    const { result } = renderHook(() => useRecentAgents('test-project'));
    expect(result.current.recentAgentCommands).toEqual([]);
  });

  // TC: addRecentAgent saves to localStorage and updates state (AC 3)
  it('saves to localStorage and updates state when addRecentAgent is called', () => {
    const { result } = renderHook(() => useRecentAgents('test-project'));

    act(() => {
      result.current.addRecentAgent('/BMad:agents:pm');
    });

    expect(result.current.recentAgentCommands).toEqual(['/BMad:agents:pm']);
    expect(JSON.parse(localStorage.getItem('bmad-recent-agents:test-project')!)).toEqual(['/BMad:agents:pm']);
  });

  // TC: Maximum 3 agents maintained (AC 1)
  it('maintains maximum of 3 recent agents', () => {
    const { result } = renderHook(() => useRecentAgents('test-project'));

    act(() => {
      result.current.addRecentAgent('/BMad:agents:pm');
    });
    act(() => {
      result.current.addRecentAgent('/BMad:agents:dev');
    });
    act(() => {
      result.current.addRecentAgent('/BMad:agents:qa');
    });
    act(() => {
      result.current.addRecentAgent('/BMad:agents:sm');
    });

    expect(result.current.recentAgentCommands).toEqual([
      '/BMad:agents:sm',
      '/BMad:agents:qa',
      '/BMad:agents:dev',
    ]);
    expect(result.current.recentAgentCommands).toHaveLength(3);
  });

  // TC: Duplicate agent moves to front
  it('moves duplicate agent to front and removes old entry', () => {
    const { result } = renderHook(() => useRecentAgents('test-project'));

    act(() => {
      result.current.addRecentAgent('/BMad:agents:pm');
    });
    act(() => {
      result.current.addRecentAgent('/BMad:agents:dev');
    });
    act(() => {
      result.current.addRecentAgent('/BMad:agents:qa');
    });

    // Re-add pm - should move to front
    act(() => {
      result.current.addRecentAgent('/BMad:agents:pm');
    });

    expect(result.current.recentAgentCommands).toEqual([
      '/BMad:agents:pm',
      '/BMad:agents:qa',
      '/BMad:agents:dev',
    ]);
  });

  // TC: Project-specific keys are isolated (AC 4)
  it('isolates recent agents per project', () => {
    const { result: result1 } = renderHook(() => useRecentAgents('project-a'));
    const { result: result2 } = renderHook(() => useRecentAgents('project-b'));

    act(() => {
      result1.current.addRecentAgent('/BMad:agents:pm');
    });

    expect(result1.current.recentAgentCommands).toEqual(['/BMad:agents:pm']);
    expect(result2.current.recentAgentCommands).toEqual([]);
  });

  // TC: undefined projectSlug returns empty array, addRecentAgent is no-op
  it('returns empty array and addRecentAgent is no-op when projectSlug is undefined', () => {
    const { result } = renderHook(() => useRecentAgents(undefined));

    expect(result.current.recentAgentCommands).toEqual([]);

    act(() => {
      result.current.addRecentAgent('/BMad:agents:pm');
    });

    expect(result.current.recentAgentCommands).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  // TC: Invalid JSON in localStorage falls back to empty array
  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem('bmad-recent-agents:test-project', 'invalid-json{{{');

    const { result } = renderHook(() => useRecentAgents('test-project'));
    expect(result.current.recentAgentCommands).toEqual([]);
  });

  // TC: Reloads from localStorage when projectSlug changes
  it('reloads recent agents when projectSlug changes', () => {
    // Pre-populate localStorage for project-b
    localStorage.setItem('bmad-recent-agents:project-b', JSON.stringify(['/BMad:agents:qa']));

    const { result, rerender } = renderHook(
      ({ slug }) => useRecentAgents(slug),
      { initialProps: { slug: 'project-a' as string | undefined } }
    );

    expect(result.current.recentAgentCommands).toEqual([]);

    // Change to project-b
    rerender({ slug: 'project-b' });

    expect(result.current.recentAgentCommands).toEqual(['/BMad:agents:qa']);
  });

  // TC: Clears state when projectSlug changes to undefined
  it('clears state when projectSlug changes to undefined', () => {
    const { result, rerender } = renderHook(
      ({ slug }) => useRecentAgents(slug),
      { initialProps: { slug: 'project-a' as string | undefined } }
    );

    act(() => {
      result.current.addRecentAgent('/BMad:agents:pm');
    });
    expect(result.current.recentAgentCommands).toEqual(['/BMad:agents:pm']);

    rerender({ slug: undefined });
    expect(result.current.recentAgentCommands).toEqual([]);
  });
});
