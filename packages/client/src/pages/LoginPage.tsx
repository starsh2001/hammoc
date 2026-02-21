/**
 * LoginPage - User login & initial password setup page
 * [Source: Story 2.2 - Task 7, Story 2.3 - Task 6]
 */

import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function LoginPage() {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            BMad Studio
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {isSetupMode
              ? '시작하려면 패스워드를 설정하세요'
              : '로그인하여 시작하세요'}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 space-y-6"
        >
          {/* Password Input */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              패스워드
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDisabled}
              autoFocus
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isSetupMode ? '패스워드를 설정하세요 (4자 이상)' : '패스워드를 입력하세요'}
            />
          </div>

          {/* Confirm Password (setup mode only) */}
          {isSetupMode && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                패스워드 확인
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isDisabled}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="패스워드를 다시 입력하세요"
              />
            </div>
          )}

          {/* Remember Me Checkbox (login mode only) */}
          {!isSetupMode && (
            <div>
              <label
                htmlFor="rememberMe"
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
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
                             dark:border-gray-600 dark:bg-gray-700
                             dark:focus:ring-blue-600 dark:focus:ring-offset-gray-800
                             disabled:opacity-50 disabled:cursor-not-allowed"
                />
                자동 로그인 유지
              </label>
              <span id="rememberMe-description" className="sr-only">
                체크하면 브라우저를 닫아도 로그인이 30일간 유지됩니다
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
              로그인 시도 횟수를 초과했습니다. {countdown}초 후에 다시 시도해주세요.
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
                {isSetupMode ? '설정 중...' : '로그인 중...'}
              </>
            ) : (
              isSetupMode ? '설정 완료' : '로그인'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
