/**
 * LoginPage - User login & initial password setup page
 * [Source: Story 2.2 - Task 7, Story 2.3 - Task 6]
 */

import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [countdown, setCountdown] = useState(0);

  const {
    isAuthenticated, isLoading, isPasswordConfigured, error, rateLimitInfo,
    login, setupPassword, checkAuth, clearError,
  } = useAuthStore();

  const isSetupMode = isPasswordConfigured === false;

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Rate limit countdown
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading || countdown > 0) return;

    if (isSetupMode) {
      const success = await setupPassword(password, confirmPassword);
      if (success) {
        navigate('/', { replace: true });
      }
    } else {
      const success = await login(password, rememberMe);
      if (success) {
        navigate('/', { replace: true });
      }
    }
  };

  const isDisabled = isLoading || countdown > 0;

  // Show nothing while checking initial auth status
  if (isPasswordConfigured === null && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#1c2129]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#1c2129] px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Title */}
        <div className="text-center">
          <img
            src="/logo-splash.png"
            alt="Hammoc"
            className="mx-auto w-40 h-auto mb-2"
          />
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            {isSetupMode
              ? t('login.setupSubtitle')
              : t('login.loginSubtitle')}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#1c2632] shadow-md rounded-lg p-8 space-y-6"
        >
          {/* Password Input */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2"
            >
              {t('login.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDisabled}
              autoFocus
              className="w-full px-4 py-2 border border-gray-300 dark:border-[#2d3a4a] rounded-md
                         bg-white dark:bg-[#253040] text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isSetupMode ? t('login.setupPlaceholder') : t('login.loginPlaceholder')}
            />
          </div>

          {/* Confirm Password (setup mode only) */}
          {isSetupMode && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2"
              >
                {t('login.confirmLabel')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isDisabled}
                className="w-full px-4 py-2 border border-gray-300 dark:border-[#2d3a4a] rounded-md
                           bg-white dark:bg-[#253040] text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={t('login.confirmPlaceholder')}
              />
            </div>
          )}

          {/* Remember Me Checkbox (login mode only) */}
          {!isSetupMode && (
            <div>
              <label
                htmlFor="rememberMe"
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer"
              >
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isDisabled}
                  aria-describedby="rememberMe-description"
                  className="w-4 h-4 text-blue-500 border-gray-300 rounded
                             focus:ring-blue-500 focus:ring-2 focus:ring-offset-2
                             dark:border-[#2d3a4a] dark:bg-[#253040]
                             dark:focus:ring-blue-600 dark:focus:ring-offset-[#263240]
                             disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {t('login.rememberMe')}
              </label>
              <span id="rememberMe-description" className="sr-only">
                {t('login.rememberMeDescription')}
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && countdown === 0 && (
            <div className="text-red-600 dark:text-red-400 text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Rate Limit Countdown */}
          {countdown > 0 && (
            <div className="text-orange-600 dark:text-orange-400 text-sm" role="alert">
              {t('login.rateLimitExceeded', { seconds: countdown })}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isDisabled}
            className="w-full flex items-center justify-center px-4 py-2
                       bg-blue-500 dark:bg-blue-600 text-white font-medium rounded-md
                       hover:bg-blue-600 dark:hover:bg-blue-700
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-200"
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
    </div>
  );
}
