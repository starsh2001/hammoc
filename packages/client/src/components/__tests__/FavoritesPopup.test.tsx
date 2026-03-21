/**
 * FavoritesPopup Component Tests
 * [Source: Story 9.6 - Task 4, Story 9.12 - Task 6, BS-1 - Task 8]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FavoritesPopup } from '../FavoritesPopup';
import type { SlashCommand, StarCommand, CommandFavoriteEntry } from '@hammoc/shared';

const mockCommands: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM', description: 'Product Manager', category: 'agent', icon: '📋' },
  { command: '/BMad:tasks:create-doc', name: 'create-doc', description: 'Create doc', category: 'task' },
  { command: '/BMad:agents:dev', name: 'Dev', category: 'agent' }, // no icon, no description
  { command: '/my-global-skill', name: 'my-global-skill', description: 'A global skill', category: 'skill', scope: 'global' },
];

const projectFavEntries: CommandFavoriteEntry[] = [
  { command: '/BMad:agents:pm', scope: 'project' },
  { command: '/BMad:tasks:create-doc', scope: 'project' },
];

const defaultProps = {
  favoriteCommands: projectFavEntries,
  commands: mockCommands,
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onReorder: vi.fn(),
  onRemoveFavorite: vi.fn(),
};

describe('FavoritesPopup', () => {
  // TC1: Favorites list renders correctly with icon, name, description
  it('renders favorite commands with icon, name, and description', () => {
    render(<FavoritesPopup {...defaultProps} />);

    expect(screen.getByTestId('favorites-popup')).toBeInTheDocument();
    expect(screen.getByText('PM')).toBeInTheDocument();
    expect(screen.getByText('Product Manager')).toBeInTheDocument();
    expect(screen.getByText('📋')).toBeInTheDocument();
    expect(screen.getByText('create-doc')).toBeInTheDocument();
    expect(screen.getByText('Create doc')).toBeInTheDocument();
  });

  // TC2: Empty favorites shows guidance message
  it('shows empty state message when no favorites', () => {
    render(
      <FavoritesPopup
        {...defaultProps}
        favoriteCommands={[]}
      />
    );

    expect(screen.getByTestId('favorites-empty-message')).toBeInTheDocument();
    expect(screen.getByText(/즐겨찾기가 비어있습니다/)).toBeInTheDocument();
  });

  // TC3: Command click calls onSelect with correct command string
  it('calls onSelect when a command is clicked', () => {
    const onSelect = vi.fn();
    render(<FavoritesPopup {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('favorite-item-0'));

    expect(onSelect).toHaveBeenCalledWith('/BMad:agents:pm');
  });

  // TC4: Remove button calls onRemoveFavorite with CommandFavoriteEntry
  it('calls onRemoveFavorite when remove button is clicked', () => {
    const onRemoveFavorite = vi.fn();
    render(<FavoritesPopup {...defaultProps} onRemoveFavorite={onRemoveFavorite} />);

    fireEvent.click(screen.getByTestId('favorite-remove-0'));

    expect(onRemoveFavorite).toHaveBeenCalledWith({ command: '/BMad:agents:pm', scope: 'project' });
  });

  // TC5: Drag and drop calls onReorder with new order
  it('calls onReorder after drag and drop', () => {
    const onReorder = vi.fn();
    render(<FavoritesPopup {...defaultProps} onReorder={onReorder} />);

    const item0 = screen.getByTestId('favorite-item-0');
    const item1 = screen.getByTestId('favorite-item-1');

    fireEvent.dragStart(item0);
    fireEvent.dragOver(item1, { preventDefault: vi.fn() });
    fireEvent.drop(item1);

    expect(onReorder).toHaveBeenCalledWith([
      { command: '/BMad:tasks:create-doc', scope: 'project' },
      { command: '/BMad:agents:pm', scope: 'project' },
    ]);
  });

  // TC6: Unknown command string still renders (graceful degradation)
  it('renders unknown command string when no matching SlashCommand found', () => {
    render(
      <FavoritesPopup
        {...defaultProps}
        favoriteCommands={[{ command: '/unknown:command', scope: 'project' }]}
      />
    );

    expect(screen.getByText('/unknown:command')).toBeInTheDocument();
  });

  // TC7: ARIA accessibility attributes
  it('has correct ARIA accessibility attributes', () => {
    render(<FavoritesPopup {...defaultProps} />);

    const popup = screen.getByTestId('favorites-popup');
    expect(popup).toHaveAttribute('role', 'listbox');

    const items = screen.getAllByRole('option');
    expect(items.length).toBe(2);
    items.forEach((item) => {
      expect(item).toHaveAttribute('tabindex', '0');
    });

    // Drag handle aria-label
    const gripHandles = screen.getAllByLabelText('순서 변경');
    expect(gripHandles.length).toBe(2);
  });

  // TC8: Optional icon/description fields fallback
  it('renders correctly when icon and description are missing', () => {
    render(
      <FavoritesPopup
        {...defaultProps}
        favoriteCommands={[{ command: '/BMad:agents:dev', scope: 'project' }]}
      />
    );

    // Should show name without icon or description
    expect(screen.getByText('Dev')).toBeInTheDocument();
    // No description should be rendered
    expect(screen.queryByText('Product Manager')).not.toBeInTheDocument();
  });

  // Keyboard interaction: Enter/Space on item calls onSelect
  it('calls onSelect on Enter key press on item', () => {
    const onSelect = vi.fn();
    render(<FavoritesPopup {...defaultProps} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByTestId('favorite-item-0'), { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('/BMad:agents:pm');
  });

  it('calls onSelect on Space key press on item', () => {
    const onSelect = vi.fn();
    render(<FavoritesPopup {...defaultProps} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByTestId('favorite-item-0'), { key: ' ' });

    expect(onSelect).toHaveBeenCalledWith('/BMad:agents:pm');
  });

  // Scope distinction tests (BS-1)
  describe('scope distinction (BS-1)', () => {
    // TC-G1: Global favorites show purple left-border and (Global) badge
    it('shows purple left-border and (Global) badge for global favorites', () => {
      render(
        <FavoritesPopup
          {...defaultProps}
          favoriteCommands={[{ command: '/my-global-skill', scope: 'global' }]}
        />
      );

      const item = screen.getByTestId('favorite-item-0');
      expect(item.className).toContain('border-l-2');
      expect(item.className).toContain('border-purple-400');

      const badge = screen.getByTestId('favorite-global-badge-0');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('(');
    });

    // TC-G2: Project favorites show no badge
    it('does not show badge for project favorites', () => {
      render(<FavoritesPopup {...defaultProps} />);

      expect(screen.queryByTestId('favorite-global-badge-0')).not.toBeInTheDocument();
      expect(screen.queryByTestId('favorite-global-badge-1')).not.toBeInTheDocument();
    });

    // TC-G3: Remove callback passes CommandFavoriteEntry for global
    it('passes CommandFavoriteEntry to onRemoveFavorite for global item', () => {
      const onRemoveFavorite = vi.fn();
      render(
        <FavoritesPopup
          {...defaultProps}
          onRemoveFavorite={onRemoveFavorite}
          favoriteCommands={[{ command: '/my-global-skill', scope: 'global' }]}
        />
      );

      fireEvent.click(screen.getByTestId('favorite-remove-0'));

      expect(onRemoveFavorite).toHaveBeenCalledWith({ command: '/my-global-skill', scope: 'global' });
    });

    // TC-G4: DnD reorder works with CommandFavoriteEntry
    it('reorder works with mixed scope entries', () => {
      const onReorder = vi.fn();
      const mixedEntries: CommandFavoriteEntry[] = [
        { command: '/BMad:agents:pm', scope: 'project' },
        { command: '/my-global-skill', scope: 'global' },
      ];
      render(
        <FavoritesPopup
          {...defaultProps}
          onReorder={onReorder}
          favoriteCommands={mixedEntries}
        />
      );

      const item0 = screen.getByTestId('favorite-item-0');
      const item1 = screen.getByTestId('favorite-item-1');

      fireEvent.dragStart(item0);
      fireEvent.dragOver(item1, { preventDefault: vi.fn() });
      fireEvent.drop(item1);

      expect(onReorder).toHaveBeenCalledWith([
        { command: '/my-global-skill', scope: 'global' },
        { command: '/BMad:agents:pm', scope: 'project' },
      ]);
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

    const mockStarCommands: StarCommand[] = [
      { agentId: 'sm', command: 'help', description: 'Show commands' },
      { agentId: 'sm', command: 'draft', description: 'Create next story' },
      { agentId: 'sm', command: 'story-checklist', description: 'Run story checklist' },
    ];

    const starProps = {
      ...defaultProps,
      starFavorites: mockStarFavorites,
      starCommands: mockStarCommands,
      activeAgent: mockActiveAgent,
      onReorderStarFavorites: vi.fn(),
      onRemoveStarFavorite: vi.fn(),
      onSelectStarFavorite: vi.fn(),
    };

    // TC-P1: Section header with agent name/icon
    it('shows star section header with agent name and icon', () => {
      render(<FavoritesPopup {...starProps} />);

      const header = screen.getByTestId('star-section-header');
      expect(header.textContent).toContain('🏃');
      expect(header.textContent).toContain('Agent Command');
    });

    // TC-P2: Star items show * prefix, command name, and description
    it('shows star items with * prefix, name, and description', () => {
      render(<FavoritesPopup {...starProps} />);

      const item = screen.getByTestId('star-favorite-item-0');
      expect(item.textContent).toContain('*');
      expect(item.textContent).toContain('help');
      expect(item.textContent).toContain('Show commands');
    });

    // TC-P3: Remove button calls onRemoveStarFavorite
    it('calls onRemoveStarFavorite when star remove button is clicked', () => {
      const onRemoveStarFavorite = vi.fn();
      render(<FavoritesPopup {...starProps} onRemoveStarFavorite={onRemoveStarFavorite} />);

      fireEvent.click(screen.getByTestId('star-favorite-remove-0'));

      expect(onRemoveStarFavorite).toHaveBeenCalledWith('help');
    });

    // TC-P4: Item click calls onSelectStarFavorite
    it('calls onSelectStarFavorite when star item is clicked', () => {
      const onSelectStarFavorite = vi.fn();
      render(<FavoritesPopup {...starProps} onSelectStarFavorite={onSelectStarFavorite} />);

      fireEvent.click(screen.getByTestId('star-favorite-item-1'));

      expect(onSelectStarFavorite).toHaveBeenCalledWith('draft');
    });

    // TC-P5: DnD calls onReorderStarFavorites
    it('calls onReorderStarFavorites after drag and drop', () => {
      const onReorderStarFavorites = vi.fn();
      render(<FavoritesPopup {...starProps} onReorderStarFavorites={onReorderStarFavorites} />);

      const item0 = screen.getByTestId('star-favorite-item-0');
      const item1 = screen.getByTestId('star-favorite-item-1');

      fireEvent.dragStart(item0);
      fireEvent.dragOver(item1, { preventDefault: vi.fn() });
      fireEvent.drop(item1);

      expect(onReorderStarFavorites).toHaveBeenCalledWith(['draft', 'help', 'story-checklist']);
    });

    // TC-P6: Divider between slash and star sections
    it('shows divider between slash and star sections', () => {
      render(<FavoritesPopup {...starProps} />);

      expect(screen.getByTestId('popup-star-divider')).toBeInTheDocument();
    });

    // TC-P7: Star section hidden when no activeAgent
    it('hides star section when activeAgent is null', () => {
      render(<FavoritesPopup {...starProps} activeAgent={null} />);

      expect(screen.queryByTestId('star-section-header')).not.toBeInTheDocument();
      expect(screen.queryByTestId('star-favorite-item-0')).not.toBeInTheDocument();
    });

    // TC-P8: Both empty — shows empty state message
    it('shows empty state when both slash and star favorites are empty', () => {
      render(
        <FavoritesPopup
          {...starProps}
          favoriteCommands={[]}
          starFavorites={[]}
        />
      );

      expect(screen.getByTestId('favorites-empty-message')).toBeInTheDocument();
    });
  });
});
