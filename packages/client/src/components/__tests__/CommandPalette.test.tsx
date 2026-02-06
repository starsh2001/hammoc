/**
 * CommandPalette Component Tests
 * [Source: Story 5.1 - Task 3]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandPalette, filterCommands, groupCommands } from '../CommandPalette';
import type { SlashCommand } from '@bmad-studio/shared';

const mockCommands: SlashCommand[] = [
  {
    command: '/BMad:agents:pm',
    name: 'PM (Product Manager)',
    description: 'Product Manager',
    category: 'agent',
    icon: '\uD83D\uDCCB',
  },
  {
    command: '/BMad:agents:sm',
    name: 'SM (Scrum Master)',
    description: 'Scrum Master',
    category: 'agent',
    icon: '\uD83C\uDFC3',
  },
  {
    command: '/BMad:tasks:create-doc',
    name: 'create-doc',
    description: 'Create document task',
    category: 'task',
  },
  {
    command: '/BMad:tasks:review-story',
    name: 'review-story',
    description: 'Review story task',
    category: 'task',
  },
];

const defaultProps = {
  commands: mockCommands,
  filter: '',
  selectedIndex: 0,
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

describe('CommandPalette', () => {
  describe('rendering', () => {
    it('should render commands grouped by category', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('Agents')).toBeInTheDocument();
      expect(screen.getByText('Tasks')).toBeInTheDocument();
      expect(screen.getByText('/BMad:agents:pm')).toBeInTheDocument();
      expect(screen.getByText('/BMad:tasks:create-doc')).toBeInTheDocument();
    });

    it('should display command descriptions', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('Product Manager')).toBeInTheDocument();
      expect(screen.getByText('Create document task')).toBeInTheDocument();
    });

    it('should display command icons for agents', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('\uD83D\uDCCB')).toBeInTheDocument();
      expect(screen.getByText('\uD83C\uDFC3')).toBeInTheDocument();
    });

    it('should show empty result message when no commands match', () => {
      render(<CommandPalette {...defaultProps} filter="nonexistent" />);

      expect(screen.getByText('일치하는 커맨드가 없습니다')).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('should filter by partial match', () => {
      render(<CommandPalette {...defaultProps} filter="pm" />);

      expect(screen.getByText('/BMad:agents:pm')).toBeInTheDocument();
      expect(screen.queryByText('/BMad:agents:sm')).not.toBeInTheDocument();
    });

    it('should filter case-insensitively', () => {
      render(<CommandPalette {...defaultProps} filter="PM" />);

      expect(screen.getByText('/BMad:agents:pm')).toBeInTheDocument();
    });

    it('should match against name field', () => {
      render(<CommandPalette {...defaultProps} filter="Product" />);

      expect(screen.getByText('/BMad:agents:pm')).toBeInTheDocument();
    });

    it('should match against last segment of command', () => {
      render(<CommandPalette {...defaultProps} filter="create-doc" />);

      expect(screen.getByText('/BMad:tasks:create-doc')).toBeInTheDocument();
      expect(screen.queryByText('/BMad:tasks:review-story')).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('should highlight selected item', () => {
      render(<CommandPalette {...defaultProps} selectedIndex={0} />);

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
      expect(options[1]).toHaveAttribute('aria-selected', 'false');
    });

    it('should call onSelect when item is clicked', () => {
      const onSelect = vi.fn();
      render(<CommandPalette {...defaultProps} onSelect={onSelect} />);

      fireEvent.click(screen.getByText('/BMad:agents:pm'));

      expect(onSelect).toHaveBeenCalledWith(mockCommands[0]);
    });
  });

  describe('ARIA attributes', () => {
    it('should have role="listbox" on container', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should have role="option" on each command item', () => {
      render(<CommandPalette {...defaultProps} />);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
    });

    it('should mark selected option with aria-selected="true"', () => {
      render(<CommandPalette {...defaultProps} selectedIndex={2} />);

      const options = screen.getAllByRole('option');
      expect(options[2]).toHaveAttribute('aria-selected', 'true');
    });

    it('should have aria-label on listbox', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByRole('listbox')).toHaveAttribute('aria-label', '슬래시 커맨드 목록');
    });
  });
});

describe('filterCommands', () => {
  it('should return all commands when query is empty', () => {
    const result = filterCommands(mockCommands, '');
    expect(result).toHaveLength(4);
  });

  it('should filter by partial command match', () => {
    const result = filterCommands(mockCommands, 'pm');
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('/BMad:agents:pm');
  });

  it('should be case-insensitive', () => {
    const result = filterCommands(mockCommands, 'PM');
    expect(result).toHaveLength(1);
  });

  it('should match last segment', () => {
    const result = filterCommands(mockCommands, 'review');
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe('/BMad:tasks:review-story');
  });
});

describe('groupCommands', () => {
  it('should group commands by category', () => {
    const groups = groupCommands(mockCommands);
    expect(groups.get('Agents')).toHaveLength(2);
    expect(groups.get('Tasks')).toHaveLength(2);
  });

  it('should handle empty array', () => {
    const groups = groupCommands([]);
    expect(groups.size).toBe(0);
  });
});
