/**
 * CommandPalette Component Tests
 * [Source: Story 5.1 - Task 3]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandPalette, filterCommands } from '../CommandPalette';
import type { SlashCommand } from '@hammoc/shared';

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

  describe('favorites (Story 9.5)', () => {
    const favoritesProps = {
      isFavorite: vi.fn().mockReturnValue(false),
      onToggleFavorite: vi.fn(),
    };

    it('TC1: should not render star buttons when isFavorite/onToggleFavorite props are absent', () => {
      render(<CommandPalette {...defaultProps} />);

      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('TC2: should render outline star for non-favorited commands', () => {
      const isFavorite = vi.fn().mockReturnValue(false);
      render(<CommandPalette {...defaultProps} isFavorite={isFavorite} onToggleFavorite={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);
      // All stars should not have fill class
      buttons.forEach((btn) => {
        const svg = btn.querySelector('svg');
        expect(svg).not.toHaveClass('fill-yellow-400');
      });
    });

    it('TC3: should render filled star for favorited commands', () => {
      const isFavorite = vi.fn().mockImplementation((cmd: string) => cmd === '/BMad:agents:pm');
      render(<CommandPalette {...defaultProps} isFavorite={isFavorite} onToggleFavorite={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      // First button (pm) should be filled
      const pmSvg = buttons[0].querySelector('svg');
      expect(pmSvg).toHaveClass('fill-yellow-400');
      // Second button (sm) should be outline
      const smSvg = buttons[1].querySelector('svg');
      expect(smSvg).not.toHaveClass('fill-yellow-400');
    });

    it('TC4: should call onToggleFavorite with command string when star is clicked', () => {
      const onToggleFavorite = vi.fn();
      render(<CommandPalette {...defaultProps} isFavorite={vi.fn().mockReturnValue(false)} onToggleFavorite={onToggleFavorite} />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(onToggleFavorite).toHaveBeenCalledWith('/BMad:agents:pm');
    });

    it('TC5: should not call onSelect when star button is clicked (stopPropagation)', () => {
      const onSelect = vi.fn();
      const onToggleFavorite = vi.fn();
      render(
        <CommandPalette
          {...defaultProps}
          onSelect={onSelect}
          isFavorite={vi.fn().mockReturnValue(false)}
          onToggleFavorite={onToggleFavorite}
        />
      );

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(onToggleFavorite).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('TC6: should render star buttons for agent commands', () => {
      const agentOnlyCommands = mockCommands.filter((c) => c.category === 'agent');
      render(
        <CommandPalette
          {...defaultProps}
          commands={agentOnlyCommands}
          isFavorite={vi.fn().mockReturnValue(false)}
          onToggleFavorite={vi.fn()}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('TC7: should have appropriate aria-label on star buttons', () => {
      const isFavorite = vi.fn().mockImplementation((cmd: string) => cmd === '/BMad:agents:pm');
      render(<CommandPalette {...defaultProps} isFavorite={isFavorite} onToggleFavorite={vi.fn()} />);

      expect(screen.getByLabelText('즐겨찾기 제거')).toBeInTheDocument();
      expect(screen.getAllByLabelText('즐겨찾기 추가')).toHaveLength(3);
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

