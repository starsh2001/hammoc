import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderSearch, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../../stores/projectStore';
import { DirectoryBrowserDialog } from '../../files/DirectoryBrowserDialog';

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

export function FirstProjectStep({ onNext, onSkip }: Props) {
  const { t } = useTranslation('auth');
  const [path, setPath] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isCreating, createError, pathValidation, isValidating,
    createProject, validatePath, clearCreateError, clearPathValidation,
  } = useProjectStore();

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      clearCreateError();
      clearPathValidation();
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    };
  }, [clearCreateError, clearPathValidation]);

  const handlePathChange = useCallback((value: string) => {
    setPath(value);
    setLocalError(null);
    clearPathValidation();
    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    const trimmed = value.trim();
    if (!trimmed) return;
    validateTimerRef.current = setTimeout(() => { validatePath(trimmed); }, 400);
  }, [clearPathValidation, validatePath]);

  const handleSubmit = useCallback(async () => {
    const trimmed = path.trim();
    if (!trimmed) {
      setLocalError(t('newProjectDialog.pathRequired'));
      return;
    }

    let validation = pathValidation;
    if (!validation || validation.valid === undefined) {
      validation = await validatePath(trimmed);
    }

    if (!validation.valid) {
      setLocalError(validation.error || t('newProjectDialog.pathInvalid'));
      return;
    }

    const result = await createProject(trimmed, false);
    if (result) onNext();
  }, [path, pathValidation, validatePath, createProject, onNext, t]);

  const displayError = localError || createError ||
    (pathValidation && !pathValidation.valid && !pathValidation.isProject ? pathValidation.error : null);

  return (
    <>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('wizard.firstProject.title')}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            {t('wizard.firstProject.description')}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={path}
              onChange={(e) => handlePathChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder={
                navigator.platform.toLowerCase().includes('win')
                  ? 'C:\\Users\\user\\my-project'
                  : '/Users/user/my-project'
              }
              disabled={isCreating}
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-white dark:bg-[#1c2129] text-gray-900 dark:text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 min-h-[44px]"
              aria-describedby={displayError ? 'project-path-error' : undefined}
              aria-invalid={!!displayError}
            />
            <button
              type="button"
              onClick={() => setBrowserOpen(true)}
              disabled={isCreating}
              className="px-3 py-3 rounded-lg border border-gray-300 dark:border-[#455568]
                         hover:bg-gray-50 dark:hover:bg-[#263240] transition-colors
                         disabled:opacity-50 min-h-[44px]"
              aria-label={t('newProjectDialog.browseAria')}
            >
              <FolderSearch className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {isValidating && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('newProjectDialog.pathValidating')}
            </p>
          )}

          {displayError && (
            <p id="project-path-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
              {displayError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isCreating || isValidating || !path.trim()}
            className="w-full flex items-center justify-center py-3 rounded-lg text-sm font-medium
                       bg-blue-500 hover:bg-blue-600 text-white transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isCreating ? t('button.creating') : t('wizard.firstProject.create')}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                       transition-colors min-h-[44px]"
          >
            {t('wizard.skip')}
          </button>
        </div>
      </div>

      {browserOpen && (
        <DirectoryBrowserDialog
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
          onSelect={(p) => handlePathChange(p)}
        />
      )}
    </>
  );
}
