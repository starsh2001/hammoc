/**
 * ModelSelector - Icon button with dropdown for selecting the AI model
 *
 * Features:
 * - CPU/chip icon button that opens a grouped model list
 * - Checkmark on currently selected model
 * - All supported Claude models grouped by generation
 * - Signal-strength bar control for thinking effort
 *   · 4 bars when Max is available (Opus 4.6)
 *   · 3 bars when Max is unavailable (non-Opus models)
 * - Opens upward (input area is at bottom)
 * - Outside click / Escape to close
 * - Disabled during streaming
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Check } from 'lucide-react';
import type { ThinkingEffort } from '@hammoc/shared';

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  /** Actual model reported by SDK (shown in Default option description) */
  activeModel?: string | null;
  /** Currently selected thinking effort */
  effort?: ThinkingEffort;
  /** Effort change callback */
  onEffortChange?: (effort: ThinkingEffort | undefined) => void;
}

interface ModelOption {
  value: string;
  label: string;
  description: string;
}

interface ModelGroup {
  label: string;
  labelKey?: string;
  models: ModelOption[];
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Default',
    labelKey: 'model.defaultLabel',
    models: [
      { value: '', label: 'Default', description: '' },
    ],
  },
  {
    label: 'Aliases (Latest)',
    labelKey: 'model.aliases',
    models: [
      { value: 'sonnet', label: 'Sonnet', description: 'Latest Sonnet' },
      { value: 'opus', label: 'Opus', description: 'Latest Opus' },
      { value: 'haiku', label: 'Haiku', description: 'Latest Haiku' },
    ],
  },
  {
    label: 'Claude 4.x',
    labelKey: 'model.claude4x',
    models: [
      { value: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable · 1M ctx' },
      { value: 'claude-opus-4-5-20251101', label: 'Opus 4.5', description: '2025-11-01' },
      { value: 'claude-opus-4-1-20250805', label: 'Opus 4.1', description: '2025-08-05' },
      { value: 'claude-opus-4-20250514', label: 'Opus 4', description: '2025-05-14' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', description: '2025-09-29' },
      { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: '2025-05-14' },
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: '2025-10-01' },
    ],
  },
  {
    label: 'Claude 3.x',
    labelKey: 'model.claude3x',
    models: [
      { value: 'claude-3-7-sonnet-20250219', label: 'Sonnet 3.7', description: '2025-02-19' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Sonnet 3.5', description: '2024-10-22' },
      { value: 'claude-3-5-haiku-20241022', label: 'Haiku 3.5', description: '2024-10-22' },
      { value: 'claude-3-opus-20240229', label: 'Opus 3', description: '2024-02-29' },
      { value: 'claude-3-sonnet-20240229', label: 'Sonnet 3', description: '2024-02-29' },
      { value: 'claude-3-haiku-20240307', label: 'Haiku 3', description: '2024-03-07' },
    ],
  },
];

/** Find display label for any model value */
function getModelDisplayLabel(value: string): string {
  if (!value) return 'Default';
  for (const group of MODEL_GROUPS) {
    const found = group.models.find((m) => m.value === value);
    if (found) return found.label;
  }
  // Show raw value for unknown/custom models
  return value;
}

/** Extract a short display name from a full model ID (e.g. "claude-sonnet-4-5-20250929" → "Sonnet 4.5") */
function formatModelId(modelId: string): string {
  for (const group of MODEL_GROUPS) {
    const found = group.models.find((m) => m.value === modelId);
    if (found) return found.label;
  }
  // Fallback: strip "claude-" prefix and date suffix for readability
  return modelId
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-/g, ' ');
}

/** Check if model ID indicates Opus 4.6 */
function isOpus46(model: string | null | undefined, activeModel: string | null | undefined): boolean {
  if (!model && !activeModel) return false;
  const check = (m: string) => m === 'claude-opus-4-6' || m === 'opus' || m.includes('opus-4-6');
  return (model ? check(model) : false) || (activeModel ? check(activeModel) : false);
}

/** Bar config: level + active/default gradient colors */
interface BarDef {
  level: ThinkingEffort;
  color: string;        // explicit selection
  defaultColor: string; // SDK default (muted)
}

// Gradient via lightness only — hue & saturation constant per palette
// Active:  hsl(217, 91%, L)  — blue
// Default: hsl(152, 68%, L)  — green/emerald
const BARS_3: BarDef[] = [
  { level: 'low', color: 'hsl(217,91%,62%)', defaultColor: 'hsl(152,68%,50%)' },
  { level: 'medium', color: 'hsl(217,91%,53%)', defaultColor: 'hsl(152,68%,42%)' },
  { level: 'high', color: 'hsl(217,91%,44%)', defaultColor: 'hsl(152,68%,34%)' },
];
const BARS_4: BarDef[] = [
  { level: 'low', color: 'hsl(217,91%,62%)', defaultColor: 'hsl(152,68%,50%)' },
  { level: 'medium', color: 'hsl(217,91%,56%)', defaultColor: 'hsl(152,68%,45%)' },
  { level: 'high', color: 'hsl(217,91%,50%)', defaultColor: 'hsl(152,68%,39%)' },
  { level: 'max', color: 'hsl(217,91%,44%)', defaultColor: 'hsl(152,68%,34%)' },
];

const BAR_HEIGHT = 14; // uniform height for all bars

/** Index lookup for determining "active up to" fill */
const LEVEL_INDEX: Record<ThinkingEffort, number> = { low: 0, medium: 1, high: 2, max: 3 };

export function ModelSelector({ model, onModelChange, disabled, activeModel, effort, onEffortChange }: ModelSelectorProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxAvailable = isOpus46(model, activeModel);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-clear max effort when it becomes unavailable (model change or subscriber detection)
  useEffect(() => {
    if (effort === 'max' && !maxAvailable && onEffortChange) {
      onEffortChange(undefined);
    }
  }, [effort, maxAvailable, onEffortChange]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const handleSelect = useCallback(
    (value: string) => {
      onModelChange(value);
      setIsOpen(false);
    },
    [onModelChange]
  );

  const handleEffortClick = useCallback(
    (level: ThinkingEffort) => {
      if (!onEffortChange) return;
      // Toggle off if clicking the already-selected effort
      onEffortChange(effort === level ? undefined : level);
      // Do NOT close dropdown
    },
    [effort, onEffortChange]
  );

  // Prevent focus from moving to button on both desktop and mobile.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
  }, []);

  const displayLabel = getModelDisplayLabel(model);
  // Clamp effort at render time: treat 'max' as undefined when unavailable (fail-closed)
  const effectiveEffort = (effort === 'max' && !maxAvailable) ? undefined : effort;
  // SDK default is 'high' when no effort is explicitly set
  const isDefault = !effectiveEffort;
  const displayEffort = effectiveEffort ?? 'high';
  const effortLabel = isDefault
    ? `Default (${t(`effort.tooltipFull.${displayEffort}`)})`
    : t(`effort.tooltipFull.${displayEffort}`);
  const tooltip = t('effort.tooltip', { model: displayLabel, effort: effortLabel });
  const bars = maxAvailable ? BARS_4 : BARS_3;
  const selectedIdx = LEVEL_INDEX[displayEffort];

  return (
    <div ref={containerRef} className="relative">
      {/* Icon trigger button */}
      <button
        type="button"
        tabIndex={-1}
        onClick={handleToggle}
        onPointerDown={handlePointerDown}
        disabled={disabled}
        title={tooltip}
        aria-label={t('model.selectorAria', { label: displayLabel })}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          w-[28px] h-[28px] rounded-md transition-all
          flex items-center justify-center
          border border-gray-300 dark:border-[#455568]
          bg-white dark:bg-[#263240]
          text-gray-600 dark:text-gray-200
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400
          disabled:opacity-50 disabled:cursor-not-allowed
          hover:bg-gray-100 dark:hover:bg-[#253040]
          active:bg-gray-200 dark:active:bg-gray-600
          select-none
          ${isOpen ? 'bg-gray-100 dark:bg-[#253040] ring-2 ring-gray-400 ring-offset-1' : ''}
        `}
      >
        <Cpu className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Dropdown menu (opens upward) */}
      {isOpen && (
        <div
          role="listbox"
          aria-label={t('model.selectAria')}
          className="absolute bottom-full left-0 mb-1 w-64 max-h-96 overflow-y-auto bg-white dark:bg-[#263240] border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg z-50"
        >
          {/* Effort intensity bar */}
          {onEffortChange && (
            <div
              className="border-b border-gray-300 dark:border-[#3a4d5e]"
              aria-label={t('effort.selectorAria', { level: effortLabel ?? '' })}
            >
              {/* Group header — same style as model group headers */}
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('effort.label')}
              </div>

              {/* Bar + level label row — indented to align with model item labels */}
              <div className="px-3 py-2.5 flex items-center gap-2">
                {/* Spacer matching checkmark column (w-4) in model items */}
                <span className="w-4 shrink-0" />
                <div className="flex items-center gap-[3px]" role="radiogroup" aria-label={t('effort.groupAria')}>
                  {bars.map((bar, i) => {
                    const isActive = selectedIdx >= 0 && i <= selectedIdx;
                    return (
                      <button
                        key={bar.level}
                        type="button"
                        role="radio"
                        aria-checked={effectiveEffort === bar.level}
                        onClick={() => handleEffortClick(bar.level)}
                        title={t(`effort.tooltipFull.${bar.level}`)}
                        className={`w-[7px] rounded-[1.5px] transition-all cursor-pointer
                          ${!isActive ? 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500' : ''}
                        `}
                        style={{
                          height: `${BAR_HEIGHT}px`,
                          ...(isActive ? { backgroundColor: isDefault ? bar.defaultColor : bar.color } : {}),
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 select-none">
                  {effortLabel}
                </span>
              </div>
            </div>
          )}

          {MODEL_GROUPS.map((group, gi) => {
            const groupLabel = group.labelKey ? t(group.labelKey) : group.label;
            return (
            <div key={group.label}>
              {/* Group divider (not on first group) */}
              {gi > 0 && <div className="border-t border-gray-300 dark:border-[#3a4d5e]" />}

              {/* Group header */}
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {groupLabel}
              </div>

              {/* Model items */}
              {group.models.map((opt) => {
                const isSelected = opt.value === model;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors
                      hover:bg-gray-100 dark:hover:bg-[#253040]
                      ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    {/* Checkmark column */}
                    <span className="w-4 flex-shrink-0">
                      {isSelected && <Check className="w-4 h-4 text-blue-500" />}
                    </span>

                    {/* Label + description */}
                    <span className="flex-1 min-w-0">
                      <span className={`text-sm ${isSelected ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                        {opt.label}
                      </span>
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        {opt.value === '' && activeModel
                          ? formatModelId(activeModel)
                          : opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
