import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '../../../stores/preferencesStore';

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

export function DisplayNameStep({ onNext, onSkip }: Props) {
  const { t } = useTranslation('auth');
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      updatePreferences({ displayName: trimmed });
    }
    onNext();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('wizard.displayName.title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('wizard.displayName.description')}
        </p>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('wizard.displayName.placeholder')}
        className="w-full px-4 py-3 rounded-lg text-center text-lg
                   bg-white dark:bg-[#1c2129] border border-gray-300 dark:border-[#455568]
                   text-gray-900 dark:text-white
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   min-h-[44px]"
        aria-label={t('wizard.displayName.title')}
      />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full py-3 rounded-lg text-sm font-medium
                     bg-blue-500 hover:bg-blue-600 text-white transition-colors min-h-[44px]"
        >
          {t('wizard.next')}
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
  );
}
