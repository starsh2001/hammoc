/**
 * PermissionModeSelector - Toggle button for cycling through permission modes
 * [Source: Story 5.2 - Task 3]
 *
 * Features:
 * - Four modes: Plan, Ask (default), Auto, Bypass
 * - Single button that cycles through modes on click
 * - Compact design for placement next to input
 * - Neon-style colors per mode
 */

import { useCallback } from 'react';
import type { PermissionMode } from '@bmad-studio/shared';

interface PermissionModeSelectorProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode;
  label: string;
  description: string;
  // Neon style: lighter bg, darker/saturated border
  colorClass: string;
}> = [
  {
    value: 'plan',
    label: 'Plan',
    description: 'Claude가 계획만 세우고 파일을 수정하지 않습니다',
    colorClass: 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:border-blue-400 dark:text-blue-300',
  },
  {
    value: 'default',
    label: 'Ask',
    description: '파일 수정 전 승인을 요청합니다',
    colorClass: 'bg-orange-100 border-orange-500 text-orange-700 dark:bg-orange-900/40 dark:border-orange-400 dark:text-orange-300',
  },
  {
    value: 'acceptEdits',
    label: 'Auto',
    description: '파일 수정을 자동으로 승인합니다',
    colorClass: 'bg-gray-50 border-gray-400 text-gray-700 dark:bg-gray-800 dark:border-gray-400 dark:text-gray-300',
  },
  {
    value: 'bypassPermissions',
    label: 'Bypass',
    description: '모든 권한 요청을 건너뜁니다',
    colorClass: 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/40 dark:border-red-400 dark:text-red-300',
  },
];

export function PermissionModeSelector({ mode, onModeChange, disabled }: PermissionModeSelectorProps) {
  const currentIndex = PERMISSION_MODE_OPTIONS.findIndex((opt) => opt.value === mode);
  const currentOption = PERMISSION_MODE_OPTIONS[currentIndex] || PERMISSION_MODE_OPTIONS[1]; // default to Ask

  const handleClick = useCallback(() => {
    if (disabled) return;
    const nextIndex = (currentIndex + 1) % PERMISSION_MODE_OPTIONS.length;
    onModeChange(PERMISSION_MODE_OPTIONS[nextIndex].value);
  }, [disabled, currentIndex, onModeChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % PERMISSION_MODE_OPTIONS.length;
        onModeChange(PERMISSION_MODE_OPTIONS[nextIndex].value);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + PERMISSION_MODE_OPTIONS.length) % PERMISSION_MODE_OPTIONS.length;
        onModeChange(PERMISSION_MODE_OPTIONS[prevIndex].value);
      }
    },
    [disabled, currentIndex, onModeChange, handleClick]
  );

  // Prevent focus on mouse click to avoid scroll jump
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      title={currentOption.description}
      aria-label={`권한 모드: ${currentOption.label}. ${currentOption.description}. 클릭하여 다음 모드로 전환`}
      className={`
        w-[60px] h-[28px] self-center ml-0.4 mr-1.0 text-xs font-semibold rounded-md transition-all
        border-1
        focus:outline-none focus:ring-2 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        hover:brightness-95 dark:hover:brightness-110
        active:brightness-90 dark:active:brightness-125
        select-none
        ${currentOption.colorClass}
      `}
    >
      {currentOption.label}
    </button>
  );
}
