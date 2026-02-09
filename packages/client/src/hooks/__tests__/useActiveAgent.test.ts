/**
 * useActiveAgent Hook Tests
 * [Source: Story 8.5 - Task 8]
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveAgent } from '../useActiveAgent';
import type { HistoryMessage, SlashCommand } from '@bmad-studio/shared';

const mockCommands: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM (Product Manager)', category: 'agent', icon: '📋' },
  { command: '/BMad:agents:dev', name: 'Developer', category: 'agent', icon: '💻' },
];

function makeMessage(type: HistoryMessage['type'], content: string): HistoryMessage {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    timestamp: new Date().toISOString(),
  };
}

describe('useActiveAgent', () => {
  it('returns matching agent when first user message is an agent command', () => {
    const messages: HistoryMessage[] = [
      makeMessage('user', '/BMad:agents:pm'),
      makeMessage('assistant', 'Hello!'),
    ];

    const { result } = renderHook(() => useActiveAgent(messages, mockCommands));
    expect(result.current.activeAgent).toEqual(mockCommands[0]);
  });

  it('returns null when messages array is empty', () => {
    const { result } = renderHook(() => useActiveAgent([], mockCommands));
    expect(result.current.activeAgent).toBeNull();
  });

  it('returns null when first user message is plain text', () => {
    const messages: HistoryMessage[] = [
      makeMessage('user', 'Hello world'),
    ];

    const { result } = renderHook(() => useActiveAgent(messages, mockCommands));
    expect(result.current.activeAgent).toBeNull();
  });

  it('returns null when commands is empty', () => {
    const messages: HistoryMessage[] = [
      makeMessage('user', '/BMad:agents:pm'),
    ];

    const { result } = renderHook(() => useActiveAgent(messages, []));
    expect(result.current.activeAgent).toBeNull();
  });

  it('only checks the first user message among multiple messages', () => {
    const messages: HistoryMessage[] = [
      makeMessage('assistant', 'System init'),
      makeMessage('user', 'Hello world'),
      makeMessage('user', '/BMad:agents:dev'),
    ];

    const { result } = renderHook(() => useActiveAgent(messages, mockCommands));
    expect(result.current.activeAgent).toBeNull();
  });
});
