/**
 * NewProjectDialog - Project creation dialog component
 * [Source: Story 3.6 - Task 6]
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, FolderPlus, AlertTriangle, Loader2 } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';

interface NewProjectDialogProps {
  /** Dialog open state */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Success callback with project slug and isExisting flag */
  onSuccess: (projectSlug: string, isExisting: boolean) => void;
}

export function NewProjectDialog({ isOpen, onClose, onSuccess }: NewProjectDialogProps) {
  const [path, setPath] = useState('');
  const [setupBmad, setSetupBmad] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const {
    isCreating,
    createError,
    pathValidation,
    isValidating,
    createProject,
    validatePath,
    clearCreateError,
    clearPathValidation,
    abortCreation,
  } = useProjectStore();

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setPath('');
      setSetupBmad(true);
      setLocalError(null);
      clearCreateError();
      clearPathValidation();
    }
  }, [isOpen, clearCreateError, clearPathValidation]);

  // Handle path change
  const handlePathChange = useCallback(
    (value: string) => {
      setPath(value);
      setLocalError(null);
      clearPathValidation();
    },
    [clearPathValidation]
  );

  // Handle path blur - validate
  const handlePathBlur = useCallback(async () => {
    if (path.trim()) {
      await validatePath(path.trim());
    }
  }, [path, validatePath]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    const trimmedPath = path.trim();

    if (!trimmedPath) {
      setLocalError('프로젝트 경로를 입력해 주세요.');
      return;
    }

    // Validate first if not already validated
    let validation = pathValidation;
    if (!validation || validation.valid === undefined) {
      validation = await validatePath(trimmedPath);
    }

    if (!validation.valid) {
      setLocalError(validation.error || '유효하지 않은 경로입니다.');
      return;
    }

    // Create project
    const result = await createProject(trimmedPath, setupBmad);

    if (result) {
      onSuccess(result.project.projectSlug, result.isExisting);
      onClose();
    }
  }, [path, pathValidation, validatePath, createProject, setupBmad, onSuccess, onClose]);

  // Handle navigate to existing project
  const handleNavigateToExisting = useCallback(() => {
    if (pathValidation?.projectSlug) {
      onSuccess(pathValidation.projectSlug, true);
      onClose();
    }
  }, [pathValidation, onSuccess, onClose]);

  // Handle cancel with confirmation if creating
  const handleCancel = useCallback(() => {
    if (isCreating) {
      // Show confirmation if operation is in progress
      if (window.confirm('프로젝트 생성이 진행 중입니다. 취소하시겠습니까?')) {
        abortCreation();
        onClose();
      }
    } else {
      onClose();
    }
  }, [isCreating, onClose, abortCreation]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, handleCancel]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  if (!isOpen) return null;

  const showExistingWarning = pathValidation?.isProject && pathValidation?.projectSlug;
  // Show pathValidation.error only when it's not an existing project
  const validationError =
    pathValidation && !pathValidation.valid && !showExistingWarning ? pathValidation.error : null;
  const displayError = localError || createError || validationError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
    >
      {/* Responsive dialog container */}
      <div
        ref={dialogRef}
        className="w-full bg-white dark:bg-gray-800 shadow-xl
                   rounded-t-2xl max-h-[90vh] overflow-y-auto
                   sm:rounded-lg sm:max-w-md sm:mx-4
                   animate-slide-up sm:animate-none"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="new-project-title"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <FolderPlus className="w-5 h-5" aria-hidden="true" />
            새 프로젝트
          </h2>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="닫기"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Path Input */}
          <div>
            <label
              htmlFor="project-path"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              프로젝트 경로
            </label>
            <input
              ref={inputRef}
              id="project-path"
              type="text"
              value={path}
              onChange={(e) => handlePathChange(e.target.value)}
              onBlur={handlePathBlur}
              placeholder={
                navigator.platform.toLowerCase().includes('win')
                  ? 'C:\\Users\\user\\my-project'
                  : '/Users/user/my-project'
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         min-h-[44px]"
              disabled={isCreating}
              aria-describedby={displayError ? 'path-error' : undefined}
              aria-invalid={!!displayError}
            />
            {isValidating && (
              <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                경로 확인 중...
              </p>
            )}
          </div>

          {/* Existing Project Warning */}
          {showExistingWarning && (
            <div
              className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    이 경로는 이미 프로젝트로 등록되어 있습니다.
                  </p>
                  <button
                    onClick={handleNavigateToExisting}
                    className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 underline hover:no-underline
                               min-h-[44px] py-2"
                  >
                    기존 프로젝트로 이동하기
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {displayError && !showExistingWarning && (
            <p id="path-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
              {displayError}
            </p>
          )}

          {/* BMad Setup Checkbox */}
          <div className="flex items-center gap-2 min-h-[44px]">
            <input
              id="setup-bmad"
              type="checkbox"
              checked={setupBmad}
              onChange={(e) => setSetupBmad(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={isCreating}
            />
            <label htmlFor="setup-bmad" className="text-sm text-gray-700 dark:text-gray-300">
              BMad 자동 설정 (.bmad-core 폴더 생성)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                       min-h-[44px] min-w-[80px]"
            disabled={isCreating}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isCreating || isValidating || !path.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2
                       min-h-[44px] min-w-[80px]"
          >
            {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
            {isCreating ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
