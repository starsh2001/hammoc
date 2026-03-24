/**
 * AccountSettingsSection - Change password and logout
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../services/api/auth';
import { ApiError } from '../../services/api/client';

export function AccountSettingsSection() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError(t('account.passwordMismatch'));
      return;
    }

    setIsChanging(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmNewPassword });
      toast.success(t('account.changeSuccess'));
      // Server invalidates session, redirect to login
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('account.changeFailed'));
      }
    } finally {
      setIsChanging(false);
    }
  }, [currentPassword, newPassword, confirmNewPassword, navigate, t]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  return (
    <div className="space-y-8">
      {/* Change Password */}
      <form onSubmit={handleChangePassword} className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('account.changePassword')}
        </h3>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div>
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t('account.currentPassword')}
          </label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            autoComplete="current-password"
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t('account.newPassword')}
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={4}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label
            htmlFor="confirm-new-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t('account.confirmNewPassword')}
          </label>
          <input
            id="confirm-new-password"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={4}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={isChanging || !currentPassword || !newPassword || !confirmNewPassword}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white
                     bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        >
          {isChanging ? t('account.changing') : t('account.changePasswordButton')}
        </button>
      </form>

      <hr className="border-gray-300 dark:border-[#455568]" />

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                   text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800
                   hover:bg-red-50 dark:hover:bg-red-900/20
                   focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        {t('account.logout')}
      </button>
    </div>
  );
}
