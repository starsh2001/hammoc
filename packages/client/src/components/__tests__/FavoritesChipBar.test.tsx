/**
 * FavoritesChipBar Component Tests
 * [Source: Story 9.7 - Task 4, Story 9.12 - Task 5]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FavoritesChipBar } from '../FavoritesChipBar';
import type { SlashCommand } from '@hammoc/shared';

const mockCommands: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM', description: 'Product Manager', category: 'agent', icon: '📋' },
  { command: '/BMad:tasks:create-doc', name: 'create-doc', description: 'Create document', category: 'task' },
  { command: '/BMad:agents:dev', name: 'Dev', category: 'agent' },
];

const defaultProps = {
  favoriteCommands: ['/BMad:agents:pm', '/BMad:tasks:create-doc'],
  commands: mockCommands,
  onExecute: vi.fn(),
  onOpenDialog: vi.fn(),
};

describe('FavoritesChipBar', () => {
  // TC1: Empty favorites — component not rendered (AC: 7)
  it('does not render when favoriteCommands is empty', () => {
    const { container } = render(
      <FavoritesChipBar
        {...defaultProps}
        favoriteCommands={[]}
      />
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('favorites-chip-bar')).not.toBeInTheDocument();
  });

  // TC2: Renders star button and chips when favorites exist (AC: 1)
  it('renders star button and chips when favorites exist', () => {
    render(<FavoritesChipBar {...defaultProps} />);

    expect(screen.getByTestId('favorites-chip-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chip-bar-star-button')).toBeInTheDocument();
    expect(screen.getByTestId('chip-scroll-area')).toBeInTheDocument();
    // Two chips should be rendered
    expect(screen.getByText('PM')).toBeInTheDocument();
    expect(screen.getByText('create-doc')).toBeInTheDocument();
  });

  // TC3: Chips display command icon and name
  it('displays command icon and name on chips', () => {
    render(<FavoritesChipBar {...defaultProps} />);

    // PM has icon 📋
    expect(screen.getByText('📋')).toBeInTheDocument();
    expect(screen.getByText('PM')).toBeInTheDocument();
    // create-doc has no icon
    expect(screen.getByText('create-doc')).toBeInTheDocument();
  });

  // TC4: Chip click calls onExecute with command string (AC: 3)
  it('calls onExecute with command string when chip is clicked', () => {
    const onExecute = vi.fn();
    render(<FavoritesChipBar {...defaultProps} onExecute={onExecute} />);

    fireEvent.click(screen.getByText('PM'));

    expect(onExecute).toHaveBeenCalledWith('/BMad:agents:pm');
  });

  // TC5: Star button click calls onOpenDialog (AC: 4)
  it('calls onOpenDialog when star button is clicked', () => {
    const onOpenDialog = vi.fn();
    render(<FavoritesChipBar {...defaultProps} onOpenDialog={onOpenDialog} />);

    fireEvent.click(screen.getByTestId('chip-bar-star-button'));

    expect(onOpenDialog).toHaveBeenCalledTimes(1);
  });

  // TC7: Graceful degradation for unmatched commands
  it('shows fallback label for commands not found in command list', () => {
    render(
      <FavoritesChipBar
        {...defaultProps}
        favoriteCommands={['/BMad:agents:unknown-agent']}
      />
    );

    // Fallback: last segment after ":"
    expect(screen.getByText('unknown-agent')).toBeInTheDocument();
  });

  // TC8: ARIA accessibility attributes
  it('has correct ARIA accessibility attributes', () => {
    render(<FavoritesChipBar {...defaultProps} />);

    // Toolbar container
    const toolbar = screen.getByTestId('favorites-chip-bar');
    expect(toolbar).toHaveAttribute('role', 'toolbar');
    expect(toolbar).toHaveAttribute('aria-label', '즐겨찾기 커맨드 바로실행');

    // Star button
    const starButton = screen.getByTestId('chip-bar-star-button');
    expect(starButton).toHaveAttribute('aria-label', '즐겨찾기 편집');

    // Chips have aria-label
    expect(screen.getByRole('button', { name: /PM 실행/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create-doc 실행/i })).toBeInTheDocument();
  });

  // TC9: Scroll container has overflow-x-auto (AC: 2)
  it('has overflow-x-auto on the scroll container', () => {
    render(<FavoritesChipBar {...defaultProps} />);

    const scrollArea = screen.getByTestId('chip-scroll-area');
    expect(scrollArea.className).toContain('overflow-x-auto');
  });

  it('renders chip with icon when icon exists on the command', () => {
    render(
      <FavoritesChipBar
        {...defaultProps}
        favoriteCommands={['/BMad:agents:dev']}
      />
    );

    // Dev has no icon field
    expect(screen.getByText('Dev')).toBeInTheDocument();
  });

  // Star favorites tests (Story 9.12)
  describe('star favorites (Story 9.12)', () => {
    const mockActiveAgent: SlashCommand = {
      command: '/BMad:agents:sm',
      name: 'SM (Bob)',
      description: 'Scrum Master',
      category: 'agent',
      icon: '🏃',
    };

    const mockStarFavorites = ['help', 'draft', 'story-checklist'];

    // TC-S1: Both slash + star favorites render together
    it('renders both slash and star favorite chips', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={mockStarFavorites}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      // Slash chips
      expect(screen.getByText('PM')).toBeInTheDocument();
      expect(screen.getByText('create-doc')).toBeInTheDocument();
      // Star chips
      expect(screen.getByTestId('star-favorite-chip-help')).toBeInTheDocument();
      expect(screen.getByTestId('star-favorite-chip-draft')).toBeInTheDocument();
      expect(screen.getByTestId('star-favorite-chip-story-checklist')).toBeInTheDocument();
    });

    // TC-S2: Divider shown only when both sections exist
    it('shows divider when both slash and star favorites exist', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={mockStarFavorites}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(screen.getByTestId('chip-bar-divider')).toBeInTheDocument();
    });

    // TC-S3: Star chips have * prefix
    it('displays * prefix on star favorite chips', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[]}
          starFavorites={['help']}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      const chip = screen.getByTestId('star-favorite-chip-help');
      expect(chip.textContent).toContain('*');
      expect(chip.textContent).toContain('help');
    });

    // TC-S4: Star chip click calls onExecuteStarFavorite
    it('calls onExecuteStarFavorite when star chip is clicked', () => {
      const onExecuteStarFavorite = vi.fn();
      render(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={mockStarFavorites}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={onExecuteStarFavorite}
        />
      );

      fireEvent.click(screen.getByTestId('star-favorite-chip-help'));

      expect(onExecuteStarFavorite).toHaveBeenCalledWith('help');
    });

    // TC-S5: Star section hidden when no activeAgent
    it('hides star section when activeAgent is null', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={mockStarFavorites}
          activeAgent={null}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(screen.queryByTestId('star-favorite-chip-help')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chip-bar-divider')).not.toBeInTheDocument();
    });

    // TC-S6: Only slash favorites — no divider
    it('does not show divider when only slash favorites exist', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={[]}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(screen.getByTestId('favorites-chip-bar')).toBeInTheDocument();
      expect(screen.queryByTestId('chip-bar-divider')).not.toBeInTheDocument();
    });

    // TC-S7: Only star favorites — no divider, chip bar visible
    it('shows chip bar with star favorites only (no slash, no divider)', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[]}
          starFavorites={mockStarFavorites}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(screen.getByTestId('favorites-chip-bar')).toBeInTheDocument();
      expect(screen.queryByTestId('chip-bar-divider')).not.toBeInTheDocument();
      expect(screen.getByTestId('star-favorite-chip-help')).toBeInTheDocument();
    });

    // TC-S8: Both empty — chip bar hidden (AC: 8)
    it('hides chip bar when both slash and star favorites are empty', () => {
      const { container } = render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[]}
          starFavorites={[]}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(container.innerHTML).toBe('');
    });

    // TC-S9: Star chips have yellow style
    it('applies yellow styling to star favorite chips', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[]}
          starFavorites={['help']}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      const chip = screen.getByTestId('star-favorite-chip-help');
      expect(chip.className).toContain('bg-yellow-50');
      expect(chip.className).toContain('border-yellow-200');
    });

    // TC-S10: activeAgent change updates star favorites (AC: 4)
    it('updates star favorites when activeAgent changes', () => {
      const { rerender } = render(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={['help']}
          activeAgent={mockActiveAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(screen.getByTestId('star-favorite-chip-help')).toBeInTheDocument();

      const newAgent: SlashCommand = {
        command: '/BMad:agents:po',
        name: 'PO (Sarah)',
        description: 'Product Owner',
        category: 'agent',
        icon: '👩‍💼',
      };

      rerender(
        <FavoritesChipBar
          {...defaultProps}
          starFavorites={['review', 'validate']}
          activeAgent={newAgent}
          onExecuteStarFavorite={vi.fn()}
        />
      );

      expect(screen.queryByTestId('star-favorite-chip-help')).not.toBeInTheDocument();
      expect(screen.getByTestId('star-favorite-chip-review')).toBeInTheDocument();
      expect(screen.getByTestId('star-favorite-chip-validate')).toBeInTheDocument();
    });
  });
});
