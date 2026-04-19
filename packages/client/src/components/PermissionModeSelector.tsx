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

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionMode } from '@hammoc/shared';

interface PermissionModeSelectorProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

const PERMISSION_MODE_BASE: Array<{
  value: PermissionMode;
  label: string;
  descriptionKey: string;
  // Neon style: lighter bg, darker/saturated border
  colorClass: string;
}> = [
  {
    value: 'plan',
    label: 'Plan',
    descriptionKey: 'permissionMode.planDescription',
    colorClass: 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:border-blue-400 dark:text-blue-300',
  },
  {
    value: 'default',
    label: 'Ask',
    descriptionKey: 'permissionMode.askDescription',
    colorClass: 'bg-orange-100 border-orange-500 text-orange-700 dark:bg-orange-900/40 dark:border-orange-400 dark:text-orange-300',
  },
  {
    value: 'acceptEdits',
    label: 'Auto',
    descriptionKey: 'permissionMode.autoDescription',
    colorClass: 'bg-gray-50 border-gray-400 text-gray-700 dark:bg-[#263240] dark:border-gray-400 dark:text-gray-200',
  },
  {
    value: 'bypassPermissions',
    label: 'Bypass',
    descriptionKey: 'permissionMode.bypassDescription',
    colorClass: 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/40 dark:border-red-400 dark:text-red-300',
  },
];

export function PermissionModeSelector({ mode, onModeChange, disabled }: PermissionModeSelectorProps) {
  const { t } = useTranslation('settings');

  const options = useMemo(
    () =>
      PERMISSION_MODE_BASE.map((opt) => ({
        ...opt,
        description: t(opt.descriptionKey),
      })),
    [t]
  );

  const currentIndex = options.findIndex((opt) => opt.value === mode);
  const currentOption = options[currentIndex] || options[1]; // default to Ask

  const handleClick = useCallback(() => {
    if (disabled) return;
    const nextIndex = (currentIndex + 1) % options.length;
    onModeChange(options[nextIndex].value);
  }, [disabled, currentIndex, onModeChange, options]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % options.length;
        onModeChange(options[nextIndex].value);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + options.length) % options.length;
        onModeChange(options[prevIndex].value);
      }
    },
    [disabled, currentIndex, onModeChange, handleClick, options]
  );

  // Prevent focus from moving to button on both desktop and mobile.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
  }, []);

  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      title={currentOption.description}
      aria-label={t('permissionMode.selectorAria', { label: currentOption.label, description: currentOption.description })}
      className={`
        w-[44px] h-[28px] flex-shrink-0 self-center text-[10px] font-semibold rounded-md transition-all
        border
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
