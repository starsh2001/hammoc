import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { usePreferencesStore } from '../../../stores/preferencesStore';

export function CompletionStep() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);

  useEffect(() => {
    updatePreferences({ onboardingComplete: true });

    const timer = setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 text-center py-8">
      <div className="wizard-checkmark-enter inline-flex items-center justify-center
                      w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
        <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ animationDelay: '200ms' }}>
        {t('wizard.done.title')}
      </h1>
      <p className="text-gray-600 dark:text-gray-300">
        {t('wizard.done.description')}
      </p>
    </div>
  );
}
