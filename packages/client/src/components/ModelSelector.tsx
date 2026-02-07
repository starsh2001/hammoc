/**
 * ModelSelector - Icon button with dropdown for selecting the AI model
 *
 * Features:
 * - CPU/chip icon button that opens a grouped model list
 * - Checkmark on currently selected model
 * - All supported Claude models grouped by generation
 * - Opens upward (input area is at bottom)
 * - Outside click / Escape to close
 * - Disabled during streaming
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Cpu, Check } from 'lucide-react';

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  /** Actual model reported by SDK (shown in Default option description) */
  activeModel?: string | null;
}

interface ModelOption {
  value: string;
  label: string;
  description: string;
}

interface ModelGroup {
  label: string;
  models: ModelOption[];
}

const MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Default',
    models: [
      { value: '', label: 'Default', description: '' },
    ],
  },
  {
    label: 'Aliases (Latest)',
    models: [
      { value: 'sonnet', label: 'Sonnet', description: 'Latest Sonnet' },
      { value: 'opus', label: 'Opus', description: 'Latest Opus' },
      { value: 'haiku', label: 'Haiku', description: 'Latest Haiku' },
    ],
  },
  {
    label: 'Claude 4.x',
    models: [
      { value: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable' },
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

export function ModelSelector({ model, onModelChange, disabled, activeModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Prevent focus on mouse click to avoid scroll jump
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const displayLabel = getModelDisplayLabel(model);

  return (
    <div ref={containerRef} className="relative">
      {/* Icon trigger button */}
      <button
        type="button"
        tabIndex={-1}
        onClick={handleToggle}
        onMouseDown={handleMouseDown}
        disabled={disabled}
        title={`Model: ${displayLabel}`}
        aria-label={`모델: ${displayLabel}. 클릭하여 모델 변경`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          w-[40px] h-[40px] self-center -mt-1.5 rounded-lg transition-all
          flex items-center justify-center
          border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-800
          text-gray-600 dark:text-gray-300
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400
          disabled:opacity-50 disabled:cursor-not-allowed
          hover:bg-gray-100 dark:hover:bg-gray-700
          active:bg-gray-200 dark:active:bg-gray-600
          select-none
          ${isOpen ? 'bg-gray-100 dark:bg-gray-700 ring-2 ring-gray-400 ring-offset-1' : ''}
        `}
      >
        <Cpu className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Dropdown menu (opens upward) */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="모델 선택"
          className="absolute bottom-full left-0 mb-1 w-64 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50"
        >
          {MODEL_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {/* Group divider (not on first group) */}
              {gi > 0 && <div className="border-t border-gray-200 dark:border-gray-700" />}

              {/* Group header */}
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.label}
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
                      hover:bg-gray-100 dark:hover:bg-gray-700
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
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        {opt.value === '' && activeModel
                          ? formatModelId(activeModel)
                          : opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
