/**
 * SettingsMenu Component
 * Dropdown menu for settings and logout
 * [Source: Story 2.4 - Task 6]
 * [Extended: Theme toggle button added]
 */

import { useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';

interface SettingsMenuProps {
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsMenu({ onLogout, isOpen, onClose }: SettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useClickOutside(menuRef, onClose);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Settings menu"
      className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800
                 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
    >
      {/* Logout */}
      <button
        role="menuitem"
        onClick={onLogout}
        className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400
                   hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                   flex items-center gap-2"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        로그아웃
      </button>
    </div>
  );
}
