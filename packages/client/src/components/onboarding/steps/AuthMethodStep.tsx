import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Key } from 'lucide-react';

interface Props {
  onSelectClaude: () => void;
  onSelectApiKey: () => void;
}

export function AuthMethodStep({ onSelectClaude, onSelectApiKey }: Props) {
  const { t } = useTranslation('auth');
  const firstCardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstCardRef.current?.focus();
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('wizard.authMethod.title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('wizard.authMethod.description')}
        </p>
      </div>

      <div className="space-y-3">
        <button
          ref={firstCardRef}
          type="button"
          onClick={onSelectClaude}
          className="w-full p-4 rounded-lg border-2 border-gray-200 dark:border-[#455568]
                     hover:border-blue-500 dark:hover:border-blue-500
                     bg-white dark:bg-[#1c2129] transition-colors text-left
                     focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {t('wizard.authMethod.claude.label')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('wizard.authMethod.claude.description')}
              </div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onSelectApiKey}
          className="w-full p-4 rounded-lg border-2 border-gray-200 dark:border-[#455568]
                     hover:border-blue-500 dark:hover:border-blue-500
                     bg-white dark:bg-[#1c2129] transition-colors text-left
                     focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {t('wizard.authMethod.apiKey.label')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('wizard.authMethod.apiKey.description')}
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
