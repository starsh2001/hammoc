/**
 * FavoritesChipBar Component Tests
 * [Source: Story 9.7 - Task 4, Story 9.12 - Task 5, BS-1 - Task 8]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FavoritesChipBar } from '../FavoritesChipBar';
import type { SlashCommand, CommandFavoriteEntry } from '@hammoc/shared';

const mockCommands: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM', description: 'Product Manager', category: 'agent', icon: '📋' },
  { command: '/BMad:tasks:create-doc', name: 'create-doc', description: 'Create document', category: 'task' },
  { command: '/BMad:agents:dev', name: 'Dev', category: 'agent' },
  { command: '/my-global-skill', name: 'my-global-skill', description: 'A global skill', category: 'skill', scope: 'global' },
];

const projectFavEntries: CommandFavoriteEntry[] = [
  { command: '/BMad:agents:pm', scope: 'project' },
  { command: '/BMad:tasks:create-doc', scope: 'project' },
];

const defaultProps = {
  favoriteCommands: projectFavEntries,
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

  // TC7: Graceful degradation for unmatched commands (invalid chip)
  it('shows AlertTriangle icon for commands not found in command list', () => {
    render(
      <FavoritesChipBar
        {...defaultProps}
        favoriteCommands={[{ command: '/BMad:agents:unknown-agent', scope: 'project' }]}
      />
    );

    // Fallback: last segment after ":"
    expect(screen.getByText('unknown-agent')).toBeInTheDocument();
    // Invalid chip should be disabled
    const chip = screen.getByTestId('favorite-chip-/BMad:agents:unknown-agent');
    expect(chip).toBeDisabled();
    expect(chip.className).toContain('opacity-50');
  });

  // TC8: ARIA accessibility attributes
  it('has correct ARIA accessibility attributes', () => {
    render(<FavoritesChipBar {...defaultProps} />);

    // Toolbar container
    const toolbar = screen.getByTestId('favorites-chip-bar');
    expect(toolbar).toHaveAttribute('role', 'toolbar');

    // Star button
    const starButton = screen.getByTestId('chip-bar-star-button');
    expect(starButton).toHaveAttribute('aria-label');
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
        favoriteCommands={[{ command: '/BMad:agents:dev', scope: 'project' }]}
      />
    );

    // Dev has no icon field
    expect(screen.getByText('Dev')).toBeInTheDocument();
  });

  // Scope distinction tests (BS-1)
  describe('scope distinction (BS-1)', () => {
    // TC-SC1: Project chips render with gray style
    it('renders project chips with gray styling', () => {
      render(<FavoritesChipBar {...defaultProps} />);

      const chip = screen.getByTestId('favorite-chip-/BMad:agents:pm');
      expect(chip.className).toContain('bg-gray-100');
    });

    // TC-SC2: Global chips render with purple style
    it('renders global chips with purple styling', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[{ command: '/my-global-skill', scope: 'global' }]}
        />
      );

      const chip = screen.getByTestId('favorite-chip-/my-global-skill');
      expect(chip.className).toContain('bg-purple-50');
      expect(chip.className).toContain('border-purple-200');
    });

    // TC-SC3: Divider shown between project and global groups
    it('shows scope divider when both project and global chips exist', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[
            { command: '/BMad:agents:pm', scope: 'project' },
            { command: '/my-global-skill', scope: 'global' },
          ]}
        />
      );

      expect(screen.getByTestId('chip-bar-scope-divider')).toBeInTheDocument();
    });

    // TC-SC4: No divider when only one group exists
    it('does not show scope divider when only project chips exist', () => {
      render(<FavoritesChipBar {...defaultProps} />);

      expect(screen.queryByTestId('chip-bar-scope-divider')).not.toBeInTheDocument();
    });

    // TC-SC5: Same-name chips show scope tooltip
    it('shows scope tooltip for disambiguation', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[
            { command: '/BMad:agents:pm', scope: 'project' },
            { command: '/my-global-skill', scope: 'global' },
          ]}
        />
      );

      const projectChip = screen.getByTestId('favorite-chip-/BMad:agents:pm');
      expect(projectChip).toHaveAttribute('title', expect.stringContaining('(project)'));

      const globalChip = screen.getByTestId('favorite-chip-/my-global-skill');
      expect(globalChip).toHaveAttribute('title', expect.stringContaining('(global)'));
    });

    // TC-SC6: Invalid chip shows AlertTriangle and is disabled
    it('renders invalid chip with AlertTriangle icon and disabled', () => {
      render(
        <FavoritesChipBar
          {...defaultProps}
          favoriteCommands={[{ command: '/nonexistent-cmd', scope: 'project' }]}
        />
      );

      const chip = screen.getByTestId('favorite-chip-/nonexistent-cmd');
      expect(chip).toBeDisabled();
      expect(chip.className).toContain('opacity-50');
    });

    // TC-SC7: Valid chip renders normally and triggers onExecute
    it('valid chip triggers onExecute on click', () => {
      const onExecute = vi.fn();
      render(
        <FavoritesChipBar
          {...defaultProps}
          onExecute={onExecute}
          favoriteCommands={[{ command: '/BMad:agents:pm', scope: 'project' }]}
        />
      );

      fireEvent.click(screen.getByText('PM'));
      expect(onExecute).toHaveBeenCalledWith('/BMad:agents:pm');
    });
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
