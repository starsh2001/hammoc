import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { LoadingSpinner } from '../../LoadingSpinner';

interface Props {
  onNext: () => void;
}

export function PasswordStep({ onNext }: Props) {
  const { t } = useTranslation('auth');
  const {
    isPasswordConfigured, isLoading, error, rateLimitInfo,
    login, setupPassword, clearError,
  } = useAuthStore();

  const isSetupMode = isPasswordConfigured === false;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (rateLimitInfo?.retryAfter) {
      setCountdown(rateLimitInfo.retryAfter);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            clearError();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [rateLimitInfo, clearError]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (isLoading || countdown > 0) return;

    if (isSetupMode) {
      const success = await setupPassword(password, confirmPassword);
      if (success) onNext();
    } else {
      const success = await login(password, true);
      if (success) onNext();
    }
  };

  const isDisabled = isLoading || countdown > 0;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isSetupMode ? t('wizard.password.setupTitle') : t('wizard.password.loginTitle')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {isSetupMode ? t('wizard.password.setupDescription') : t('wizard.password.loginDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="wiz-password" className="sr-only">
            {t('login.passwordLabel')}
          </label>
          <input
            ref={inputRef}
            id="wiz-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isDisabled}
            placeholder={isSetupMode ? t('login.setupPlaceholder') : t('login.loginPlaceholder')}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#1c2129] text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50 min-h-[44px]"
            aria-describedby={error ? 'wiz-password-error' : undefined}
          />
        </div>

        {isSetupMode && (
          <div>
            <label htmlFor="wiz-confirm" className="sr-only">
              {t('login.confirmLabel')}
            </label>
            <input
              id="wiz-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isDisabled}
              placeholder={t('login.confirmPlaceholder')}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-white dark:bg-[#1c2129] text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 min-h-[44px]"
            />
          </div>
        )}

        {error && countdown === 0 && (
          <p id="wiz-password-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        {countdown > 0 && (
          <p className="text-sm text-orange-600 dark:text-orange-400" role="alert">
            {t('login.rateLimitExceeded', { seconds: countdown })}
          </p>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className="w-full flex items-center justify-center py-3 rounded-lg text-sm font-medium
                     bg-blue-500 hover:bg-blue-600 text-white transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              {isSetupMode ? t('login.settingUp') : t('login.loggingIn')}
            </>
          ) : (
            isSetupMode ? t('login.setupComplete') : t('login.loginButton')
          )}
        </button>
      </form>
    </div>
  );
}
