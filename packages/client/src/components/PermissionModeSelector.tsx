/**
 * PermissionModeSelector - Segmented control for selecting Claude permission mode
 * [Source: Story 5.2 - Task 3]
 *
 * Features:
 * - Three modes: Plan, Ask (default), Auto
 * - Segmented button UI with highlight
 * - Tooltip descriptions for each mode
 * - ARIA radiogroup pattern with keyboard navigation
 * - Mobile-friendly touch targets (44px min height)
 */

import { useRef, useCallback } from 'react';
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
}> = [
  {
    value: 'plan',
    label: 'Plan',
    description: 'Claude가 계획만 세우고 파일을 수정하지 않습니다',
  },
  {
    value: 'default',
    label: 'Ask',
    description: '파일 수정 전 승인을 요청합니다',
  },
  {
    value: 'acceptEdits',
    label: 'Auto',
    description: '파일 수정을 자동으로 승인합니다',
  },
];

export function PermissionModeSelector({ mode, onModeChange, disabled }: PermissionModeSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      if (disabled) return;

      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % PERMISSION_MODE_OPTIONS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + PERMISSION_MODE_OPTIONS.length) % PERMISSION_MODE_OPTIONS.length;
      }

      if (nextIndex !== null) {
        const nextOption = PERMISSION_MODE_OPTIONS[nextIndex];
        onModeChange(nextOption.value);

        // Focus the newly selected button
        const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
        buttons?.[nextIndex]?.focus();
      }
    },
    [disabled, onModeChange]
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Permission mode"
      className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1"
    >
      {PERMISSION_MODE_OPTIONS.map((option, index) => {
        const isSelected = mode === option.value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${option.label}: ${option.description}`}
            title={option.description}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled}
            onClick={() => onModeChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`
              px-4 min-h-[44px] text-sm font-medium rounded-md transition-all
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                isSelected
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
