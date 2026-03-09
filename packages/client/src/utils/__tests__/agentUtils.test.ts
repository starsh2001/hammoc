/**
 * agentUtils Tests
 * [Source: Story 8.5 - Task 8]
 */

import { describe, it, expect } from 'vitest';
import { detectAgentFromPrompt } from '../agentUtils';
import type { SlashCommand } from '@hammoc/shared';

const mockCommands: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM (Product Manager)', category: 'agent', icon: '📋' },
  { command: '/BMad:agents:dev', name: 'Developer', category: 'agent', icon: '💻' },
  { command: '/BMad:tasks:create-doc', name: 'Create Doc', category: 'task' },
  { command: '/help', name: 'Help', category: 'builtin' },
];

describe('detectAgentFromPrompt', () => {
  it('returns matching SlashCommand for agent command match', () => {
    const result = detectAgentFromPrompt('/BMad:agents:pm', mockCommands);
    expect(result).toEqual(mockCommands[0]);
  });

  it('does not match non-agent commands (task category)', () => {
    const result = detectAgentFromPrompt('/BMad:tasks:create-doc', mockCommands);
    expect(result).toBeNull();
  });

  it('returns null for plain text firstPrompt', () => {
    const result = detectAgentFromPrompt('Hello, how are you?', mockCommands);
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = detectAgentFromPrompt('', mockCommands);
    expect(result).toBeNull();
  });

  it('trims whitespace before matching', () => {
    const result = detectAgentFromPrompt('  /BMad:agents:dev  ', mockCommands);
    expect(result).toEqual(mockCommands[1]);
  });
});
