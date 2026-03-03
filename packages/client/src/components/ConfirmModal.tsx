/**
 * ConfirmModal - Non-blocking confirmation dialog
 * Replaces window.confirm() to avoid blocking the main thread
 */

import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
  children?: ReactNode;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  variant = 'default',
  children,
}: ConfirmModalProps) {
  const { t } = useTranslation('common');
  const resolvedConfirmText = confirmText ?? t('button.confirm');
  const resolvedCancelText = cancelText ?? t('button.cancel');
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when modal opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel]
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
        onCancel();
      }
    },
    [onCancel]
  );

  if (!isOpen) return null;

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 focus:ring-red-500'
      : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:ring-blue-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-sm mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="confirm-modal-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
            aria-label={t('button.close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p
            id="confirm-modal-message"
            className="text-gray-700 dark:text-gray-300"
          >
            {message}
          </p>
          {children && <div className="mt-3">{children}</div>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            {resolvedCancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${confirmButtonClass}`}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
