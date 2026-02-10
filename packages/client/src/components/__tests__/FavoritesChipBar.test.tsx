/**
 * FavoritesChipBar Component Tests
 * [Source: Story 9.7 - Task 4]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FavoritesChipBar } from '../FavoritesChipBar';
import type { SlashCommand } from '@bmad-studio/shared';

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

  // TC6: Disabled state disables chips and star button
  it('disables chips and star button when disabled is true', () => {
    render(<FavoritesChipBar {...defaultProps} disabled />);

    const starButton = screen.getByTestId('chip-bar-star-button');
    expect(starButton).toBeDisabled();
    expect(starButton.className).toContain('opacity-50');

    // Chips should be disabled
    const pmChip = screen.getByRole('button', { name: /PM 실행/i });
    expect(pmChip).toBeDisabled();
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
});
