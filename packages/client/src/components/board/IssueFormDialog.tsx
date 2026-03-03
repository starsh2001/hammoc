/**
 * IssueFormDialog - Modal dialog for creating new issues
 * [Source: Story 21.2 - Task 11]
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';
import type { CreateIssueRequest } from '@bmad-studio/shared';

interface IssueFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateIssueRequest) => Promise<void>;
}

export function IssueFormDialog({ open, onClose, onSubmit }: IssueFormDialogProps) {
  const { t } = useTranslation('board');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('');
  const [issueType, setIssueType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSeverity('');
    setIssueType('');
  };

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  const isTitleValid = title.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTitleValid || isSubmitting) return;

    const data: CreateIssueRequest = {
      title: title.trim(),
    };
    if (description.trim()) data.description = description.trim();
    if (severity) data.severity = severity as CreateIssueRequest['severity'];
    if (issueType) data.issueType = issueType as CreateIssueRequest['issueType'];

    setIsSubmitting(true);
    try {
      await onSubmit(data);
      resetForm();
      onClose();
    } catch {
      // Error is handled by the store's setErrorWithAutoClear
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('issue.add')}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('issue.add')}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            aria-label={t('common:button.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="issue-title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('issue.title')}
            </label>
            <input
              id="issue-title"
              type="text"
              required
              autoFocus
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('issue.titlePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="issue-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('issue.description')}
            </label>
            <textarea
              id="issue-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('issue.descriptionPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
            />
          </div>

          {/* Severity & Type row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label
                htmlFor="issue-severity"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t('issue.severity')}
              </label>
              <select
                id="issue-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('common:notSelected')}</option>
                <option value="low">{t('issue.severityLow')}</option>
                <option value="medium">{t('issue.severityMedium')}</option>
                <option value="high">{t('issue.severityHigh')}</option>
                <option value="critical">{t('issue.severityCritical')}</option>
              </select>
            </div>

            <div className="flex-1">
              <label
                htmlFor="issue-type"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t('issue.type')}
              </label>
              <select
                id="issue-type"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('common:notSelected')}</option>
                <option value="bug">{t('issue.typeBug')}</option>
                <option value="improvement">{t('issue.typeImprovement')}</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('common:button.cancel')}
            </button>
            <button
              type="submit"
              disabled={!isTitleValid || isSubmitting}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('issue.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
