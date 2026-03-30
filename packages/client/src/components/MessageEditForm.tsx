/**
 * MessageEditForm - Inline message editing component with accept/cancel controls
 * [Source: Story 25.6 - Task 3]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';

interface MessageEditFormProps {
  initialText: string;
  onSubmit: (newText: string) => void;
  onCancel: () => void;
  isSummaryEdit?: boolean;
}

export function MessageEditForm({ initialText, onSubmit, onCancel, isSummaryEdit = false }: MessageEditFormProps) {
  const { t } = useTranslation('chat');
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = text.trim().length === 0;

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const scrollH = Math.max(textarea.scrollHeight, 28);
    textarea.style.height = `${scrollH}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Auto-focus on mount + scroll into view when mobile keyboard resizes viewport
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();

    const vv = window.visualViewport;
    if (!vv) return;
    let fired = false;
    const handleResize = () => {
      if (fired) return;
      fired = true;
      textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
      vv.removeEventListener('resize', handleResize);
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!isEmpty) {
          onSubmit(text);
        }
      }
    },
    [onCancel, onSubmit, text, isEmpty],
  );

  return (
    <div className="flex flex-col gap-2" data-testid="message-edit-form">
      {isSummaryEdit && (
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium" data-testid="summary-edit-hint">
          {t('summarize.editHint')}
        </p>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full resize-none rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-[#1a2533] text-gray-900 dark:text-white p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 max-h-[60vh] overflow-y-auto"
        aria-label={t('messageEdit.textareaAriaLabel')}
        data-testid="message-edit-textarea"
      />
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('messageEdit.cancelAriaLabel')}
            data-testid="edit-cancel-button"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            {t('messageEdit.cancel')}
          </button>
          <button
            onClick={() => onSubmit(text)}
            disabled={isEmpty}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label={t('messageEdit.acceptAriaLabel')}
            data-testid="edit-accept-button"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            {t('messageEdit.accept')}
          </button>
        </div>
      </div>
      {isEmpty && (
        <p className="text-xs text-red-500 dark:text-red-400" role="alert">
          {t('messageEdit.emptyWarning')}
        </p>
      )}
    </div>
  );
}
