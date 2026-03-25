/**
 * RewindConfirmDialog - Confirmation dialog for conversation/code rewind
 * Displays 5 rewind options with file change preview from SDK dryRun result
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, MessageSquare, FileCode, ListCollapse, X } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import type { RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';

export type RewindOption =
  | 'restore-all'
  | 'restore-conversation'
  | 'restore-code'
  | 'summarize'
  | 'cancel';

export interface RewindConfirmDialogProps {
  isOpen: boolean;
  onSelect: (option: RewindOption) => void;
  onClose: () => void;
  dryRunResult: RewindFilesResult | null;
}

interface OptionConfig {
  key: RewindOption;
  icon: typeof RotateCcw;
  titleKey: string;
  descKey: string;
  requiresCode: boolean;
}

const OPTIONS: OptionConfig[] = [
  {
    key: 'restore-all',
    icon: RotateCcw,
    titleKey: 'rewindDialog.restoreAll',
    descKey: 'rewindDialog.restoreAllDesc',
    requiresCode: true,
  },
  {
    key: 'restore-conversation',
    icon: MessageSquare,
    titleKey: 'rewindDialog.restoreConversation',
    descKey: 'rewindDialog.restoreConversationDesc',
    requiresCode: false,
  },
  {
    key: 'restore-code',
    icon: FileCode,
    titleKey: 'rewindDialog.restoreCode',
    descKey: 'rewindDialog.restoreCodeDesc',
    requiresCode: true,
  },
  {
    key: 'summarize',
    icon: ListCollapse,
    titleKey: 'rewindDialog.summarize',
    descKey: 'rewindDialog.summarizeDesc',
    requiresCode: false,
  },
  {
    key: 'cancel',
    icon: X,
    titleKey: 'rewindDialog.cancel',
    descKey: '',
    requiresCode: false,
  },
];

export function RewindConfirmDialog({
  isOpen,
  onSelect,
  onClose,
  dryRunResult,
}: RewindConfirmDialogProps) {
  const { t } = useTranslation('chat');
  const modalRef = useRef<HTMLDivElement>(null);

  const canRewind = dryRunResult?.canRewind ?? false;

  const isOptionDisabled = useCallback(
    (option: OptionConfig): boolean => {
      if (!option.requiresCode) return false;
      return !canRewind;
    },
    [canRewind]
  );

  // Auto-focus first enabled option on open
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const firstEnabled = modalRef.current.querySelector(
      'button[data-option]:not(:disabled)'
    ) as HTMLButtonElement | null;
    firstEnabled?.focus();
  }, [isOpen, canRewind]);

  // Keyboard handling: Escape and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;

        const focusable = Array.from(
          modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const disabledReason =
    dryRunResult && !canRewind
      ? dryRunResult.error || t('rewindDialog.noCheckpoint')
      : '';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rewind-dialog-title"
      aria-describedby="rewind-dialog-preview"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md mx-4 bg-white dark:bg-[#263240] rounded-lg shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-[#3a4d5e]">
          <h2
            id="rewind-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('rewindDialog.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] focus:outline-none focus:ring-2 focus:ring-gray-500"
            aria-label={t('rewindDialog.cancel')}
          >
            <X size={20} />
          </button>
        </div>

        {/* File Preview */}
        <div id="rewind-dialog-preview" className="px-4 pt-3 pb-1">
          {dryRunResult === null ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span>{t('rewindDialog.loading')}</span>
            </div>
          ) : canRewind && dryRunResult.filesChanged && dryRunResult.filesChanged.length > 0 ? (
            <div className="text-sm">
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('rewindDialog.filesAffected')}
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5 mb-1">
                {dryRunResult.filesChanged.map((file) => (
                  <div
                    key={file}
                    className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate"
                  >
                    {file}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 text-xs py-1">
                <span className="text-green-600 dark:text-green-400">
                  +{t('rewindDialog.insertions', { count: dryRunResult.insertions ?? 0 })}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  -{t('rewindDialog.deletions', { count: dryRunResult.deletions ?? 0 })}
                </span>
              </div>
            </div>
          ) : !canRewind && dryRunResult.error ? (
            <div className="text-sm text-amber-600 dark:text-amber-400 py-2">
              {dryRunResult.error}
            </div>
          ) : null}
        </div>

        {/* Options */}
        <div className="p-4 space-y-2">
          {OPTIONS.map((option) => {
            const disabled = isOptionDisabled(option);
            const Icon = option.icon;
            const isCancel = option.key === 'cancel';

            return (
              <button
                key={option.key}
                type="button"
                data-option={option.key}
                disabled={disabled}
                onClick={() =>
                  isCancel ? onClose() : onSelect(option.key)
                }
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : isCancel
                      ? 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#253040]'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#253040]'
                }`}
                title={disabled ? disabledReason : undefined}
              >
                <Icon
                  size={18}
                  className={
                    disabled
                      ? 'text-gray-400 dark:text-gray-600 shrink-0'
                      : isCancel
                        ? 'text-gray-400 dark:text-gray-500 shrink-0'
                        : 'text-blue-500 dark:text-blue-400 shrink-0'
                  }
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t(option.titleKey)}</div>
                  {option.descKey && (
                    <div
                      className={`text-xs ${
                        disabled
                          ? 'text-gray-400 dark:text-gray-600'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {t(option.descKey)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
