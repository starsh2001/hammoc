/**
 * IssueFormDialog - Modal dialog for creating new issues
 * [Source: Story 21.2 - Task 11]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Paperclip, ImagePlus } from 'lucide-react';
import type { CreateIssueRequest } from '@hammoc/shared';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPT_STRING = ACCEPTED_TYPES.join(',');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

interface LocalFile {
  file: File;
  previewUrl: string;
}

interface IssueFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateIssueRequest, files?: File[]) => Promise<void>;
}

export function IssueFormDialog({ open, onClose, onSubmit }: IssueFormDialogProps) {
  const { t } = useTranslation('board');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('');
  const [issueType, setIssueType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSeverity('');
    setIssueType('');
    localFiles.forEach((lf) => URL.revokeObjectURL(lf.previewUrl));
    setLocalFiles([]);
    setFileError(null);
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

  const addFiles = useCallback((files: FileList | File[]) => {
    setFileError(null);
    const newFiles: LocalFile[] = [];

    for (const file of Array.from(files)) {
      if (localFiles.length + newFiles.length >= MAX_FILES) {
        setFileError(t('issue.maxAttachments'));
        break;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setFileError(t('issue.invalidFileType'));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError(t('issue.fileTooLarge'));
        continue;
      }
      newFiles.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (newFiles.length > 0) {
      setLocalFiles((prev) => [...prev, ...newFiles]);
    }
  }, [localFiles.length, t]);

  const removeFile = useCallback((index: number) => {
    setLocalFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setFileError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && ACCEPTED_TYPES.includes(item.type)) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }, [addFiles]);

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
      await onSubmit(data, localFiles.length > 0 ? localFiles.map((lf) => lf.file) : undefined);
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
      onPaste={handlePaste}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#263240] rounded-lg shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-[#3a4d5e] flex-shrink-0">
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {/* Title */}
          <div>
            <label
              htmlFor="issue-title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#455568] rounded-lg bg-white dark:bg-[#253040] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="issue-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
            >
              {t('issue.description')}
            </label>
            <textarea
              id="issue-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('issue.descriptionPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#455568] rounded-lg bg-white dark:bg-[#253040] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
            />
          </div>

          {/* Severity & Type row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label
                htmlFor="issue-severity"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
              >
                {t('issue.severity')}
              </label>
              <select
                id="issue-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#455568] rounded-lg bg-white dark:bg-[#253040] text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
              >
                {t('issue.type')}
              </label>
              <select
                id="issue-type"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#455568] rounded-lg bg-white dark:bg-[#253040] text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('common:notSelected')}</option>
                <option value="bug">{t('issue.typeBug')}</option>
                <option value="improvement">{t('issue.typeImprovement')}</option>
              </select>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t('issue.attachments')}
            </label>

            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-[#455568] rounded-lg p-3 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <ImagePlus className="w-5 h-5 mx-auto text-gray-500 dark:text-gray-400 mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-300">{t('issue.dropzone')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_STRING}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* File error */}
            {fileError && (
              <p className="mt-1 text-xs text-red-500">{fileError}</p>
            )}

            {/* Preview grid */}
            {localFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {localFiles.map((lf, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={lf.previewUrl}
                      alt={lf.file.name}
                      className="w-16 h-16 object-cover rounded-lg border border-gray-300 dark:border-[#455568]"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={t('issue.removeAttachment')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-[10px] text-gray-400 truncate w-16 text-center mt-0.5">{lf.file.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] rounded-lg transition-colors disabled:opacity-50"
            >
              {t('common:button.cancel')}
            </button>
            <button
              type="submit"
              disabled={!isTitleValid || isSubmitting}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {localFiles.length > 0 && <Paperclip className="w-3.5 h-3.5" />}
              {t('issue.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
