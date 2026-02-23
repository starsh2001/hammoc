/**
 * TelegramSettingsSection - Telegram notification settings for SettingsPage
 * Story 10.4: Bot token masking, test notification, per-type toggles, env var fallback
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ExternalLink, RefreshCw, Send, Loader2 } from 'lucide-react';
import { preferencesApi } from '../../services/api/preferences';
import type { TelegramSettingsApiResponse, UpdateTelegramSettingsRequest } from '@bmad-studio/shared';

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
      toast.success(toastMsg ?? '설정이 저장되었습니다.');
    } catch {
      toast.error('설정 저장에 실패했습니다.');
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
      editingField === 'botToken' ? 'Bot Token이 저장되었습니다.' : 'Chat ID가 저장되었습니다.',
    );
    setEditingField(null);
    setEditValue('');
  }, [editingField, editValue, handleUpdate]);

  const handleDelete = useCallback(async (field: 'botToken' | 'chatId') => {
    await handleUpdate(
      { [field]: null },
      field === 'botToken' ? 'Bot Token이 삭제되었습니다.' : 'Chat ID가 삭제되었습니다.',
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
        toast.success('테스트 알림이 전송되었습니다!');
      } else {
        toast.error('테스트 알림 전송 실패');
      }
    } catch {
      setTestResult({ success: false, error: '서버 연결 오류' });
      toast.error('테스트 알림 전송 실패');
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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Telegram 설정을 불러오는 중 오류가 발생했습니다.
        </p>
        <button
          onClick={() => setFetchKey((k) => k + 1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                     hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          재시도
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
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Telegram 알림을 설정하려면:
        </p>
        <ol className="text-sm text-gray-600 dark:text-gray-400 mt-2 ml-4 list-decimal space-y-1">
          <li>
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram BotFather 열기 (새 탭)"
              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              @BotFather
              <ExternalLink className="w-3 h-3" />
            </a>
            에서 봇을 생성하고 Bot Token을 받으세요
          </li>
          <li>
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram userinfobot 열기 (새 탭)"
              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              @userinfobot
              <ExternalLink className="w-3 h-3" />
            </a>
            에서 Chat ID를 확인하세요
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
              (환경변수로 설정됨)
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
              placeholder="Bot Token을 입력하세요"
              autoFocus
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveEdit}
              disabled={!editValue.trim() || updating}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              저장
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id="bot-token"
              type="password"
              value={settings.maskedBotToken || ''}
              readOnly
              placeholder="설정되지 않음"
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-default"
            />
            <button
              onClick={() => handleStartEdit('botToken')}
              disabled={updating}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600
                         hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              변경
            </button>
            {settings.hasBotToken && !settings.envOverrides.includes('botToken') && (
              <button
                onClick={() => handleDelete('botToken')}
                disabled={updating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        )}
        {settings.envOverrides.includes('botToken') && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            preferences 설정이 환경변수보다 우선됩니다.
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
              (환경변수로 설정됨)
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
              placeholder="Chat ID를 입력하세요"
              autoFocus
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveEdit}
              disabled={!editValue.trim() || updating}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              저장
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              id="chat-id"
              type="text"
              value={settings.chatId || ''}
              readOnly
              placeholder="설정되지 않음"
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-default"
            />
            <button
              onClick={() => handleStartEdit('chatId')}
              disabled={updating}
              className="px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600
                         hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              변경
            </button>
            {settings.hasChatId && !settings.envOverrides.includes('chatId') && (
              <button
                onClick={() => handleDelete('chatId')}
                disabled={updating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        )}
        {settings.envOverrides.includes('chatId') && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            preferences 설정이 환경변수보다 우선됩니다.
          </p>
        )}
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
              settings.enabled ? 'Telegram 알림이 비활성화되었습니다.' : 'Telegram 알림이 활성화되었습니다.',
            )}
            disabled={!canToggle || updating}
            aria-disabled={!canToggle}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                       text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label
            htmlFor="telegram-enabled"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            Telegram 알림 활성화
          </label>
        </div>
        {!canToggle && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-7">
            Bot Token과 Chat ID를 먼저 설정하세요.
          </p>
        )}
      </div>

      {/* Notification Type Toggles */}
      <fieldset className={!settings.enabled ? 'opacity-50' : ''}>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          알림 유형
        </legend>
        <div className="space-y-3 ml-1">
          <label htmlFor="notify-permission" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-permission"
              checked={settings.notifyPermission}
              onChange={() => handleUpdate({ notifyPermission: !settings.notifyPermission })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              권한 요청 알림 — 🔐 권한 확인이나 ❓ 질문이 필요할 때
            </span>
          </label>
          <label htmlFor="notify-complete" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-complete"
              checked={settings.notifyComplete}
              onChange={() => handleUpdate({ notifyComplete: !settings.notifyComplete })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              완료 알림 — ✅ 스트리밍이 완료되었을 때
            </span>
          </label>
          <label htmlFor="notify-error" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-error"
              checked={settings.notifyError}
              onChange={() => handleUpdate({ notifyError: !settings.notifyError })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              에러 알림 — ❌ 스트리밍 중 에러가 발생했을 때
            </span>
          </label>
        </div>
      </fieldset>

      {/* Queue Notification Toggles */}
      <fieldset className={!settings.enabled ? 'opacity-50' : ''}>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          큐 알림 유형
        </legend>
        <div className="space-y-3 ml-1">
          <label htmlFor="notify-queue-start" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-start"
              checked={settings.notifyQueueStart}
              onChange={() => handleUpdate({ notifyQueueStart: !settings.notifyQueueStart })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              큐 시작 알림 — 큐 실행이 시작될 때
            </span>
          </label>
          <label htmlFor="notify-queue-complete" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-complete"
              checked={settings.notifyQueueComplete}
              onChange={() => handleUpdate({ notifyQueueComplete: !settings.notifyQueueComplete })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              큐 완료 알림 — 모든 항목이 처리된 후
            </span>
          </label>
          <label htmlFor="notify-queue-error" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-error"
              checked={settings.notifyQueueError}
              onChange={() => handleUpdate({ notifyQueueError: !settings.notifyQueueError })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              큐 에러 알림 — QUEUE_STOP 또는 SDK 에러 시
            </span>
          </label>
          <label htmlFor="notify-queue-input" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="notify-queue-input"
              checked={settings.notifyQueueInputRequired}
              onChange={() => handleUpdate({ notifyQueueInputRequired: !settings.notifyQueueInputRequired })}
              disabled={updating}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                         text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              큐 입력 요청 알림 — 사용자 응답이 필요할 때
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
          {testing ? '전송 중...' : '테스트 알림 보내기'}
        </button>

        {/* Test Result */}
        <div aria-live="polite" className="mt-2 min-h-[1.5rem]">
          {testResult && (
            <p className={`text-sm ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {testResult.success
                ? '✅ 성공'
                : `❌ 실패: ${testResult.error}`
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
