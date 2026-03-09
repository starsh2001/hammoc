/**
 * useActiveAgent Hook Tests
 * [Source: Story 8.5 - Task 8]
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveAgent } from '../useActiveAgent';
import type { HistoryMessage, SlashCommand } from '@hammoc/shared';

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

  it('detects the last agent command when multiple user messages exist', () => {
    const messages: HistoryMessage[] = [
      makeMessage('user', '/BMad:agents:pm'),
      makeMessage('assistant', 'PM mode'),
      makeMessage('user', 'some chat'),
      makeMessage('user', '/BMad:agents:dev'),
      makeMessage('assistant', 'Dev mode'),
    ];

    const { result } = renderHook(() => useActiveAgent(messages, mockCommands));
    expect(result.current.activeAgent).toEqual(mockCommands[1]); // dev, not pm
  });

  it('falls back to serverLastAgentCommand when no agent in loaded messages', () => {
    const messages: HistoryMessage[] = [
      makeMessage('assistant', 'Continuing from earlier...'),
      makeMessage('user', 'What was I doing?'),
    ];

    const { result } = renderHook(() =>
      useActiveAgent(messages, mockCommands, '/BMad:agents:pm')
    );
    expect(result.current.activeAgent).toEqual(mockCommands[0]); // pm from server
  });

  it('prefers loaded message agent over serverLastAgentCommand', () => {
    const messages: HistoryMessage[] = [
      makeMessage('user', '/BMad:agents:dev'),
      makeMessage('assistant', 'Dev mode'),
    ];

    const { result } = renderHook(() =>
      useActiveAgent(messages, mockCommands, '/BMad:agents:pm')
    );
    expect(result.current.activeAgent).toEqual(mockCommands[1]); // dev from messages, not pm from server
  });

  it('returns null when serverLastAgentCommand does not match any command', () => {
    const messages: HistoryMessage[] = [
      makeMessage('user', 'Hello'),
    ];

    const { result } = renderHook(() =>
      useActiveAgent(messages, mockCommands, '/some-unknown-command')
    );
    expect(result.current.activeAgent).toBeNull();
  });
});
