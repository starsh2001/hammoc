/**
 * PermissionModeSelector - Toggle button for cycling through permission modes
 * [Source: Story 5.2 - Task 3; unified SDK/CLI set 2026-06-14]
 *
 * Both engines (SDK and CLI) support the SAME six claude permission modes, so they share ONE button
 * set — there is no per-engine split. The cycle exposes five (dontAsk is internal-only: summaries):
 * `Ask / Edits / Plan / Auto / Bypass`, in claude's Shift+Tab order. "Edits" == acceptEdits;
 * "Auto" == claude's classifier mode `auto` (a DISTINCT mode — the two were previously conflated).
 *
 * Bypass applies immediately under the SDK engine and on the NEXT message under the CLI engine
 * (claude keeps it off the live Shift+Tab cycle); that difference is handled server-side, the button
 * is identical. Single button that cycles forward on click. Compact (44px), neon colors per mode.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionMode } from '@hammoc/shared';

interface PermissionModeOption {
  value: PermissionMode;
  label: string;
  descriptionKey: string;
  // Neon style: lighter bg, darker/saturated border
  colorClass: string;
}

const COLOR = {
  plan: 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:border-blue-400 dark:text-blue-300',
  ask: 'bg-orange-100 border-orange-500 text-orange-700 dark:bg-orange-900/40 dark:border-orange-400 dark:text-orange-300',
  edits: 'bg-gray-50 border-gray-400 text-gray-700 dark:bg-[#263240] dark:border-gray-400 dark:text-gray-200',
  auto: 'bg-purple-100 border-purple-500 text-purple-700 dark:bg-purple-900/40 dark:border-purple-400 dark:text-purple-300',
  bypass: 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/40 dark:border-red-400 dark:text-red-300',
} as const;

// claude's real modes in claude's Shift+Tab cycle order (default→acceptEdits→plan→auto), with Bypass
// appended. "Edits" == acceptEdits; "Auto" == claude's classifier `auto`.
const PERMISSION_MODES: PermissionModeOption[] = [
  { value: 'default', label: 'Ask', descriptionKey: 'permissionMode.askDescription', colorClass: COLOR.ask },
  { value: 'acceptEdits', label: 'Edits', descriptionKey: 'permissionMode.autoDescription', colorClass: COLOR.edits },
  { value: 'plan', label: 'Plan', descriptionKey: 'permissionMode.planDescription', colorClass: COLOR.plan },
  { value: 'auto', label: 'Auto', descriptionKey: 'permissionMode.classifierDescription', colorClass: COLOR.auto },
  { value: 'bypassPermissions', label: 'Bypass', descriptionKey: 'permissionMode.bypassDescription', colorClass: COLOR.bypass },
];

/** Forward cycle order — also consumed by ChatInput's Shift+Tab handler so the keyboard cycle and
 *  the button cycle stay identical. */
export const PERMISSION_CYCLE: PermissionMode[] = PERMISSION_MODES.map((m) => m.value);

interface PermissionModeSelectorProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

export function PermissionModeSelector({ mode, onModeChange, disabled }: PermissionModeSelectorProps) {
  const { t } = useTranslation('settings');

  const options = useMemo(
    () =>
      PERMISSION_MODES.map((opt) => ({
        ...opt,
        description: t(opt.descriptionKey),
      })),
    [t]
  );

  const currentIndex = options.findIndex((opt) => opt.value === mode);
  // Graceful fallback when the active mode isn't in the visible set (e.g. the internal `dontAsk` or a
  // stale value): show Ask rather than crashing.
  const currentOption = options[currentIndex] || options.find((o) => o.value === 'default') || options[0];

  const handleClick = useCallback(() => {
    if (disabled) return;
    const nextIndex = (currentIndex + 1) % options.length; // currentIndex -1 ⇒ starts at 0
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
