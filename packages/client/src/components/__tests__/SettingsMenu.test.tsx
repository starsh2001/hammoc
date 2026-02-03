/**
 * SettingsMenu Component Tests
 * [Source: Story 2.4 - Task 9]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsMenu } from '../SettingsMenu';

describe('SettingsMenu', () => {
  const mockOnLogout = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('[MEDIUM] should not render when isOpen is false', () => {
      render(
        <SettingsMenu isOpen={false} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('[HIGH] should render when isOpen is true', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('logout button', () => {
    it('[HIGH] should render logout button', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      expect(screen.getByText('로그아웃')).toBeInTheDocument();
    });

    it('[HIGH] should call onLogout when logout button is clicked', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      fireEvent.click(screen.getByText('로그아웃'));

      expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('theme toggle', () => {
    it('[HIGH] should render theme toggle button', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      // In light mode (default in tests), should show '다크 모드' option
      expect(screen.getByText('다크 모드')).toBeInTheDocument();
    });

    it('[MEDIUM] should have both theme toggle and logout as menu items', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(2);
    });
  });

  describe('keyboard navigation', () => {
    it('[MEDIUM] should close menu on Escape key', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not close menu on Escape when already closed', () => {
      render(
        <SettingsMenu isOpen={false} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have correct ARIA attributes', () => {
      render(
        <SettingsMenu isOpen={true} onClose={mockOnClose} onLogout={mockOnLogout} />
      );

      const menu = screen.getByRole('menu');
      expect(menu).toHaveAttribute('aria-label', 'Settings menu');
    });
  });
});
