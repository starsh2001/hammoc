/**
 * HeaderOverflowMenu Component Tests
 * Story 17.4 - Task 4.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { HeaderOverflowMenu } from '../HeaderOverflowMenu';

// Mock useTheme hook
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    toggleTheme: vi.fn(),
  }),
}));

describe('HeaderOverflowMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const openMenu = () => {
    const btn = screen.getByRole('button', { name: '더보기 메뉴' });
    fireEvent.click(btn);
  };

  // TC-HOM-1: Shows terminal menu item when onShowTerminal is provided
  it('shows terminal menu item when onShowTerminal is provided', () => {
    const onShowTerminal = vi.fn();
    render(<HeaderOverflowMenu onShowTerminal={onShowTerminal} />);
    openMenu();

    const menuItem = screen.getByRole('menuitem', { name: /터미널/i });
    expect(menuItem).toBeDefined();
  });

  // TC-HOM-2: Calls onShowTerminal and closes menu when clicked
  it('calls onShowTerminal and closes menu when terminal item is clicked', () => {
    const onShowTerminal = vi.fn();
    render(<HeaderOverflowMenu onShowTerminal={onShowTerminal} />);
    openMenu();

    const menuItem = screen.getByRole('menuitem', { name: /터미널/i });
    fireEvent.click(menuItem);

    expect(onShowTerminal).toHaveBeenCalledTimes(1);
    // Menu should be closed (no menuitems visible)
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  // TC-HOM-3: Does not show terminal menu item when onShowTerminal is not provided
  it('does not show terminal menu item when onShowTerminal is not provided', () => {
    render(<HeaderOverflowMenu />);
    openMenu();

    const menuItems = screen.queryAllByRole('menuitem');
    const terminalItem = menuItems.find((item) => item.textContent?.includes('터미널'));
    expect(terminalItem).toBeUndefined();
  });
});
