/**
 * FavoritesPopup Component Tests
 * [Source: Story 9.6 - Task 4, Story 9.12 - Task 6]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FavoritesPopup } from '../FavoritesPopup';
import type { SlashCommand, StarCommand } from '@bmad-studio/shared';

const mockCommands: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM', description: 'Product Manager', category: 'agent', icon: '📋' },
  { command: '/BMad:tasks:create-doc', name: 'create-doc', description: 'Create doc', category: 'task' },
  { command: '/BMad:agents:dev', name: 'Dev', category: 'agent' }, // no icon, no description
];

const defaultProps = {
  favoriteCommands: ['/BMad:agents:pm', '/BMad:tasks:create-doc'],
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

  // TC4: Remove button calls onRemoveFavorite
  it('calls onRemoveFavorite when remove button is clicked', () => {
    const onRemoveFavorite = vi.fn();
    render(<FavoritesPopup {...defaultProps} onRemoveFavorite={onRemoveFavorite} />);

    fireEvent.click(screen.getByTestId('favorite-remove-0'));

    expect(onRemoveFavorite).toHaveBeenCalledWith('/BMad:agents:pm');
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

    expect(onReorder).toHaveBeenCalledWith(['/BMad:tasks:create-doc', '/BMad:agents:pm']);
  });

  // TC6: Unknown command string still renders (graceful degradation)
  it('renders unknown command string when no matching SlashCommand found', () => {
    render(
      <FavoritesPopup
        {...defaultProps}
        favoriteCommands={['/unknown:command']}
      />
    );

    expect(screen.getByText('/unknown:command')).toBeInTheDocument();
  });

  // TC7: ARIA accessibility attributes
  it('has correct ARIA accessibility attributes', () => {
    render(<FavoritesPopup {...defaultProps} />);

    const popup = screen.getByTestId('favorites-popup');
    expect(popup).toHaveAttribute('role', 'listbox');
    expect(popup).toHaveAttribute('aria-label', '즐겨찾기 커맨드 목록');

    const items = screen.getAllByRole('option');
    expect(items.length).toBe(2);
    items.forEach((item) => {
      expect(item).toHaveAttribute('tabindex', '0');
    });

    // Drag handle aria-label
    const gripHandles = screen.getAllByLabelText('순서 변경');
    expect(gripHandles.length).toBe(2);

    // Remove button aria-label
    expect(screen.getByLabelText('즐겨찾기에서 제거: /BMad:agents:pm')).toBeInTheDocument();
    expect(screen.getByLabelText('즐겨찾기에서 제거: /BMad:tasks:create-doc')).toBeInTheDocument();
  });

  // TC8: Optional icon/description fields fallback
  it('renders correctly when icon and description are missing', () => {
    render(
      <FavoritesPopup
        {...defaultProps}
        favoriteCommands={['/BMad:agents:dev']}
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
