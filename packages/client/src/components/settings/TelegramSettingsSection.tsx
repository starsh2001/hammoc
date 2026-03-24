/**
 * TelegramSettingsSection - Telegram notification settings for SettingsPage
 * Story 10.4: Bot token masking, test notification, per-type toggles, env var fallback
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, RefreshCw, Send, Loader2 } from 'lucide-react';
import { preferencesApi } from '../../services/api/preferences';
import type { TelegramSettingsApiResponse, UpdateTelegramSettingsRequest } from '@hammoc/shared';

type EditingField = 'botToken' | 'chatId' | null;

export function TelegramSettingsSection() {
  const [settings, setSettings] = useState<TelegramSettingsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Editing state
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState('');

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const { t } = useTranslation('settings');

  // Fetch settings
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    preferencesApi.getTelegram()
      .then((data) => { if (!cancelled) { setSettings(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [fetchKey]);

  // Clear test result after 5s
  useEffect(() => {
    if (!testResult) return;
    const timer = setTimeout(() => setTestResult(null), 5000);
    return () => clearTimeout(timer);
  }, [testResult]);

  const handleUpdate = useCallback(async (update: UpdateTelegramSettingsRequest, toastMsg?: string) => {
    try {
      setUpdating(true);
      const updated = await preferencesApi.updateTelegram(update);
      setSettings(updated);
      toast.success(toastMsg ?? t('toast.settingSaved'));
    } catch {
      toast.error(t('toast.settingSaveFailed'));
    } finally {
      setUpdating(false);
    }
  }, []);

  const handleStartEdit = useCallback((field: EditingField) => {
    setEditingField(field);
    setEditValue('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingField || !editValue.trim()) return;
    await handleUpdate(
      { [editingField]: editValue.trim() },
      editingField === 'botToken' ? t('toast.botTokenSaved') : t('toast.chatIdSaved'),
    );
    setEditingField(null);
    setEditValue('');
  }, [editingField, editValue, handleUpdate]);

  const handleDelete = useCallback(async (field: 'botToken' | 'chatId') => {
    await handleUpdate(
      { [field]: null },
      field === 'botToken' ? t('toast.botTokenDeleted') : t('toast.chatIdDeleted'),
    );
  }, [handleUpdate]);

  const handleTest = useCallback(async () => {
    if (testing || cooldown) return;
    setTesting(true);
    setTestResult(null);

    // Build overrides from currently editing fields
    const overrides: { botToken?: string; chatId?: string } = {};
    if (editingField === 'botToken' && editValue.trim()) {
      overrides.botToken = editValue.trim();
    }
    if (editingField === 'chatId' && editValue.trim()) {
      overrides.chatId = editValue.trim();
    }

    try {
      const result = await preferencesApi.testTelegram(
        Object.keys(overrides).length > 0 ? overrides : undefined,
      );
      setTestResult(result);
      if (result.success) {
        toast.success(t('toast.testSent'));
      } else {
        toast.error(t('toast.testFailed'));
      }
    } catch {
      setTestResult({ success: false, error: t('toast.testServerError') });
      toast.error(t('toast.testFailed'));
    } finally {
      setTesting(false);
      setCooldown(true);
      setTimeout(() => setCooldown(false), 5000);
    }
  }, [testing, cooldown, editingField, editValue]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (error || !settings) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">
          {t('telegram.loadError')}
        </p>
        <button
          onClick={() => setFetchKey((k) => k + 1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-gray-100 dark:bg-[#253040] text-gray-700 dark:text-gray-200
                     hover:bg-gray-200 dark:hover:bg-[#2d3a4a] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('telegram.retry')}
        </button>
      </div>
    );
  }

  const canToggle = settings.hasBotToken && settings.hasChatId;
  const canTest = settings.hasBotToken && settings.hasChatId
    || (editingField === 'botToken' && editValue.trim() && settings.hasChatId)
    || (editingField === 'chatId' && editValue.trim() && settings.hasBotToken);

  return (
    <div className="space-y-8">
      {/* Setup Guide */}
      <div className="bg-gray-50 dark:bg-[#263240] rounded-lg p-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('telegram.setupGuide')}
        </p>
        <ol className="text-sm text-gray-600 dark:text-gray-300 mt-2 ml-4 list-decimal space-y-1">
          <li>
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('telegram.botTokenAriaLabel')}
              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              @BotFather
              <ExternalLink className="w-3 h-3" />
            </a>
            {t('telegram.setupStep1Suffix')}
          </li>
          <li>
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('telegram.chatIdAriaLabel')}
              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              @userinfobot
              <ExternalLink className="w-3 h-3" />
            </a>
            {t('telegram.setupStep2Suffix')}
          </li>
        </ol>
      </div>

      {/* Bot Token */}
      <div>
        <label
          htmlFor="bot-token"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          Bot Token
          {settings.envOverrides.includes('botToken') && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
              {t('telegram.envOverride')}
            </span>
          )}
        </label>
        {editingField === 'botToken' ? (
          <div className="flex items-center gap-2">
            <input
              id="bot-token"
              type="password"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={t('telegram.enterBotToken')}
              autoFocus
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveEdit}
              disabled={!editValue.trim() || updating}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common:button.save')}
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
            >
              {t('common:button.cancel')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id="bot-token"
              type="password"
              value={settings.maskedBotToken || ''}
              readOnly
              placeholder={t('telegram.notConfigured')}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-gray-50 dark:bg-[#1c2129] text-gray-500 dark:text-gray-300 cursor-default"
            />
            <button
              onClick={() => handleStartEdit('botToken')}
              disabled={updating}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#455568]
                         hover:bg-gray-100 dark:hover:bg-[#253040] disabled:opacity-50 transition-colors"
            >
              {t('telegram.change')}
            </button>
            {settings.hasBotToken && !settings.envOverrides.includes('botToken') && (
              <button
                onClick={() => handleDelete('botToken')}
                disabled={updating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                {t('common:button.delete')}
              </button>
            )}
          </div>
        )}
        {settings.envOverrides.includes('botToken') && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
            {t('telegram.envPriority')}
          </p>
        )}
      </div>

      {/* Chat ID */}
      <div>
        <label
          htmlFor="chat-id"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          Chat ID
          {settings.envOverrides.includes('chatId') && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
              {t('telegram.envOverride')}
            </span>
          )}
        </label>
        {editingField === 'chatId' ? (
          <div className="flex items-center gap-2">
            <input
              id="chat-id"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={t('telegram.enterChatId')}
              autoFocus
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveEdit}
              disabled={!editValue.trim() || updating}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common:button.save')}
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
            >
              {t('common:button.cancel')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id="chat-id"
              type="text"
              value={settings.chatId || ''}
              readOnly
              placeholder={t('telegram.notConfigured')}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-gray-50 dark:bg-[#1c2129] text-gray-500 dark:text-gray-300 cursor-default"
            />
            <button
              onClick={() => handleStartEdit('chatId')}
              disabled={updating}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#455568]
                         hover:bg-gray-100 dark:hover:bg-[#253040] disabled:opacity-50 transition-colors"
            >
              {t('telegram.change')}
            </button>
            {settings.hasChatId && !settings.envOverrides.includes('chatId') && (
              <button
                onClick={() => handleDelete('chatId')}
                disabled={updating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                {t('common:button.delete')}
              </button>
            )}
          </div>
        )}
        {settings.envOverrides.includes('chatId') && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
            {t('telegram.envPriority')}
          </p>
        )}
      </div>

      {/* Base URL */}
      <div>
        <label
          htmlFor="base-url"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          {t('telegram.baseUrl')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="base-url"
            type="text"
            value={settings.baseUrl || ''}
            onChange={(e) => {
              setSettings({ ...settings, baseUrl: e.target.value });
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              // Remove trailing slash
              const normalized = value.replace(/\/+$/, '');
              handleUpdate({ baseUrl: normalized || null });
            }}
            placeholder={t('telegram.baseUrlPlaceholder')}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('telegram.baseUrlHint')}
        </p>
      </div>

      {/* Enable Toggle */}
      <div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="telegram-enabled"
            checked={settings.enabled}
            onChange={() => handleUpdate(
              { enabled: !settings.enabled },
              t(settings.enabled ? 'toast.telegramDisabled' : 'toast.telegramEnabled'),
            )}
            disabled={!canToggle || updating}
            aria-disabled={!canToggle}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                       text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label
            htmlFor="telegram-enabled"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            {t('telegram.enableNotifications')}
          </label>
        </div>
        {!canToggle && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300 ml-7">
            {t('telegram.enableHint')}
          </p>
        )}
      </div>

      {/* Always Notify Toggle */}
      <div className={!settings.enabled ? 'opacity-50' : ''}>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="always-notify"
            checked={settings.alwaysNotify}
            onChange={() => handleUpdate({ alwaysNotify: !settings.alwaysNotify })}
            disabled={!settings.enabled || updating}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                       text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label
            htmlFor="always-notify"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            {t('telegram.alwaysNotify')}
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300 ml-7">
          {t('telegram.alwaysNotifyHint')}
        </p>
      </div>

      {/* Notification Type Toggles */}
      <fieldset className={!settings.enabled ? 'opacity-50' : ''}>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('telegram.notificationType')}
        </legend>
        <div className="space-y-3 ml-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-permission"
              checked={settings.notifyPermission}
              onChange={() => handleUpdate({ notifyPermission: !settings.notifyPermission })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyPermission')}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-complete"
              checked={settings.notifyComplete}
              onChange={() => handleUpdate({ notifyComplete: !settings.notifyComplete })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyComplete')}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-error"
              checked={settings.notifyError}
              onChange={() => handleUpdate({ notifyError: !settings.notifyError })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyError')}
            </span>
          </label>
        </div>
      </fieldset>

      {/* Queue Notification Toggles */}
      <fieldset className={!settings.enabled ? 'opacity-50' : ''}>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('telegram.queueNotificationType')}
        </legend>
        <div className="space-y-3 ml-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-start"
              checked={settings.notifyQueueStart}
              onChange={() => handleUpdate({ notifyQueueStart: !settings.notifyQueueStart })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyQueueStart')}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-complete"
              checked={settings.notifyQueueComplete}
              onChange={() => handleUpdate({ notifyQueueComplete: !settings.notifyQueueComplete })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyQueueComplete')}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-error"
              checked={settings.notifyQueueError}
              onChange={() => handleUpdate({ notifyQueueError: !settings.notifyQueueError })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyQueueError')}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-input"
              checked={settings.notifyQueueInputRequired}
              onChange={() => handleUpdate({ notifyQueueInputRequired: !settings.notifyQueueInputRequired })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {t('telegram.notifyQueueInput')}
            </span>
          </label>
        </div>
      </fieldset>

      {/* Test Notification Button */}
      <div>
        <button
          onClick={handleTest}
          disabled={!canTest || testing || cooldown || updating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-blue-600 hover:bg-blue-700 text-white
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {testing ? t('telegram.testSending') : t('telegram.testSend')}
        </button>

        {/* Test Result */}
        <div aria-live="polite" className="mt-2 min-h-[1.5rem]">
          {testResult && (
            <p className={`text-sm ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {testResult.success
                ? t('telegram.testSuccess')
                : t('telegram.testFailure', { error: testResult.error })
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
