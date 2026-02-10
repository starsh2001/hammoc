/**
 * StarCommandPalette Component Tests
 * [Source: Story 9.9 - Task 5.1, 5.2]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarCommandPalette, filterStarCommands } from '../StarCommandPalette';
import type { SlashCommand, StarCommand } from '@bmad-studio/shared';

const mockStarCommands: StarCommand[] = [
  { agentId: 'sm', command: 'help', description: 'Show numbered list of the following commands to allow selection' },
  { agentId: 'sm', command: 'draft', description: 'Execute task create-next-story.md' },
  { agentId: 'sm', command: 'story-checklist', description: 'Execute task execute-checklist.md with checklist story-draft-checklist.md' },
  { agentId: 'sm', command: 'correct-course', description: 'Execute task correct-course.md' },
  { agentId: 'sm', command: 'exit', description: 'Say goodbye as the Scrum Master' },
];

const mockAgent: SlashCommand = {
  command: '/BMad:agents:sm',
  name: 'SM (Bob)',
  description: 'Scrum Master',
  category: 'agent',
  icon: '\uD83C\uDFC3',
};

describe('StarCommandPalette', () => {
  // TC1: renders star commands with * prefix
  it('renders star commands with * prefix', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter=""
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    expect(screen.getByText('*help')).toBeInTheDocument();
    expect(screen.getByText('*draft')).toBeInTheDocument();
    expect(screen.getByText('*story-checklist')).toBeInTheDocument();
    expect(screen.getByText('*correct-course')).toBeInTheDocument();
    expect(screen.getByText('*exit')).toBeInTheDocument();
  });

  // TC2: agent header displays icon and name
  it('displays agent icon and name in header', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter=""
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    expect(screen.getByText('SM (Bob)')).toBeInTheDocument();
    expect(screen.getByText('\uD83C\uDFC3')).toBeInTheDocument();
  });

  // TC3: filters commands by filter prop
  it('filters commands by filter prop', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter="hel"
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    expect(screen.getByText('*help')).toBeInTheDocument();
    expect(screen.queryByText('*draft')).not.toBeInTheDocument();
    expect(screen.queryByText('*exit')).not.toBeInTheDocument();
  });

  // TC4: shows empty message when filter has no matches
  it('shows empty message when filter has no matches', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter="nonexistent"
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    expect(screen.getByText('일치하는 명령어가 없습니다')).toBeInTheDocument();
  });

  // TC5: calls onSelect with command name on click
  it('calls onSelect with command name on click', () => {
    const onSelect = vi.fn();
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter=""
        selectedIndex={0}
        onSelect={onSelect}

      />
    );

    fireEvent.click(screen.getByText('*draft'));

    expect(onSelect).toHaveBeenCalledWith('draft');
  });

  // TC6: highlights selected item with aria-selected
  it('highlights selected item with aria-selected', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter=""
        selectedIndex={2}
        onSelect={vi.fn()}

      />
    );

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
  });

  // TC7: ARIA accessibility attributes
  it('has correct ARIA accessibility attributes', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter=""
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-label', '별표 명령어 목록');
    expect(listbox).toHaveAttribute('id', 'star-command-palette');

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'star-command-option-0');
    expect(options[1]).toHaveAttribute('id', 'star-command-option-1');
  });

  // TC: displays command descriptions
  it('displays command descriptions', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter=""
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    expect(screen.getByText('Say goodbye as the Scrum Master')).toBeInTheDocument();
  });

  // TC: agent header still shows in empty state
  it('shows agent header even when no commands match', () => {
    render(
      <StarCommandPalette
        commands={mockStarCommands}
        agent={mockAgent}
        filter="zzz"
        selectedIndex={0}
        onSelect={vi.fn()}

      />
    );

    expect(screen.getByText('SM (Bob)')).toBeInTheDocument();
  });
});

describe('filterStarCommands', () => {
  // TC8: empty query returns all
  it('returns all commands for empty query', () => {
    const result = filterStarCommands(mockStarCommands, '');
    expect(result).toHaveLength(mockStarCommands.length);
  });

  // TC9: matches command name
  it('matches by command name', () => {
    const result = filterStarCommands(mockStarCommands, 'help');
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('help');
  });

  // TC10: matches description text
  it('matches by description text', () => {
    const result = filterStarCommands(mockStarCommands, 'goodbye');
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('exit');
  });

  // TC11: case-insensitive matching
  it('matches case-insensitively', () => {
    const result = filterStarCommands(mockStarCommands, 'HELP');
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('help');
  });

  // TC: partial match
  it('matches partial command names', () => {
    const result = filterStarCommands(mockStarCommands, 'correct');
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('correct-course');
  });

  // TC: no match returns empty
  it('returns empty array when nothing matches', () => {
    const result = filterStarCommands(mockStarCommands, 'zzzzz');
    expect(result).toHaveLength(0);
  });
});
