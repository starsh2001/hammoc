/**
 * RewindConfirmDialog - Confirmation dialog for Rewind/Regenerate actions
 * [Source: Story 25.2 - Task 3]
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';

interface RewindConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (undoMode: 'conversation' | 'conversationAndCode') => void;
  actionType: 'rewind' | 'regenerate' | 'edit';
  messageCount?: number;
  isGitInitialized?: boolean;
  isProcessing?: boolean;
}

export function RewindConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  messageCount = 0,
  isGitInitialized = false,
  isProcessing = false,
}: RewindConfirmDialogProps) {
  const { t } = useTranslation('chat');
  const [undoMode, setUndoMode] = useState<'conversation' | 'conversationAndCode'>('conversation');
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setUndoMode('conversation');
    }
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const titleKey =
    actionType === 'rewind'
      ? 'rewindDialog.rewindTitle'
      : actionType === 'regenerate'
        ? 'rewindDialog.regenerateTitle'
        : 'rewindDialog.editTitle';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rewind-dialog-title"
      data-testid="rewind-confirm-dialog"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-sm mx-4 bg-white dark:bg-[#263240] rounded-lg shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#253040]">
          <h2
            id="rewind-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {t(titleKey)}
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

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Warning */}
          {messageCount > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400" data-testid="rewind-warning">
              {t('rewindDialog.warning', { count: messageCount })}
            </p>
          )}

          {/* Radio options */}
          <div className="space-y-3">
            {/* Conversation only */}
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#253040]">
              <input
                type="radio"
                name="undoMode"
                value="conversation"
                checked={undoMode === 'conversation'}
                onChange={() => setUndoMode('conversation')}
                className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500"
                data-testid="radio-conversation"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('rewindDialog.conversationOnly')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('rewindDialog.conversationOnlyDesc')}
                </div>
              </div>
            </label>

            {/* Conversation + Code */}
            <label
              className={`flex items-start gap-3 p-2 rounded-lg ${
                isGitInitialized
                  ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#253040]'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              title={!isGitInitialized ? t('rewindDialog.gitNotInitialized') : undefined}
            >
              <input
                type="radio"
                name="undoMode"
                value="conversationAndCode"
                checked={undoMode === 'conversationAndCode'}
                onChange={() => setUndoMode('conversationAndCode')}
                disabled={!isGitInitialized}
                className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500"
                data-testid="radio-conversation-and-code"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('rewindDialog.conversationAndCode')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('rewindDialog.conversationAndCodeDesc')}
                </div>
                {!isGitInitialized && (
                  <div className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                    {t('rewindDialog.gitNotInitialized')}
                  </div>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-[#253040]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#253040] hover:bg-gray-200 dark:hover:bg-[#2d3a4a] rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            {t('rewindDialog.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(undoMode)}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="rewind-confirm-button"
          >
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('rewindDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
