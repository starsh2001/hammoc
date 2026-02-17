/**
 * GlobalSettingsSection - Global settings form for SettingsPage
 * Story 10.2: Theme, Default Model, Permission Mode, Chat Timeout
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useChatStore } from '../../stores/chatStore';
import { useTheme, type Theme } from '../../hooks/useTheme';
import { MODEL_GROUPS } from '../ModelSelector';
import type { PermissionMode } from '@bmad-studio/shared';

const TIMEOUT_OPTIONS = [
  { value: 60000, label: '1분' },
  { value: 180000, label: '3분' },
  { value: 300000, label: '5분 (기본)' },
  { value: 600000, label: '10분' },
  { value: 1800000, label: '30분' },
];

const PERMISSION_OPTIONS: { value: PermissionMode; label: string; description: string }[] = [
  { value: 'plan', label: 'Plan', description: '코드 변경 전 계획을 먼저 제안합니다' },
  { value: 'default', label: 'Ask before edits', description: '파일 수정 전 항상 확인을 요청합니다' },
  { value: 'acceptEdits', label: 'Edit Automatically', description: '파일 수정을 자동으로 수행합니다' },
];

export function GlobalSettingsSection() {
  const { preferences, overrides, updatePreference } = usePreferencesStore();
  const { theme, setTheme } = useTheme();
  const permissionMode = useChatStore((s) => s.permissionMode);
  const setPermissionMode = useChatStore((s) => s.setPermissionMode);

  const isOverridden = useCallback((field: string) => overrides.includes(field), [overrides]);

  const handleThemeChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    toast.success('테마가 변경되었습니다');
  }, [setTheme]);

  const handleModelChange = useCallback((value: string) => {
    updatePreference('defaultModel', value);
    toast.success('기본 모델이 변경되었습니다');
  }, [updatePreference]);

  const handlePermissionChange = useCallback((value: PermissionMode) => {
    setPermissionMode(value);
    toast.success('Permission Mode가 변경되었습니다');
  }, [setPermissionMode]);

  const handleTimeoutChange = useCallback((value: number) => {
    updatePreference('chatTimeoutMs', value);
    toast.success('채팅 타임아웃이 변경되었습니다');
  }, [updatePreference]);

  const currentTimeout = preferences.chatTimeoutMs ?? 300000;

  return (
    <div className="space-y-8">
      {/* Theme Setting */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          테마
        </legend>
        <div className="flex flex-wrap gap-3">
          {([
            { value: 'dark' as const, label: '다크' },
            { value: 'light' as const, label: '라이트' },
            { value: 'system' as const, label: '시스템' },
          ]).map((opt) => (
            <label
              key={opt.value}
              htmlFor={`theme-${opt.value}`}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors
                ${theme === opt.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
            >
              <input
                type="radio"
                id={`theme-${opt.value}`}
                name="theme"
                value={opt.value}
                checked={theme === opt.value}
                onChange={() => handleThemeChange(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Default Model Setting */}
      <div>
        <label
          htmlFor="default-model"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          기본 모델
        </label>
        <select
          id="default-model"
          value={preferences.defaultModel ?? ''}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MODEL_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.models.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}{model.description ? ` — ${model.description}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Permission Mode Setting */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Permission Mode
        </legend>
        <div className="space-y-2">
          {PERMISSION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              htmlFor={`permission-${opt.value}`}
              className={`
                flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                ${permissionMode === opt.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
            >
              <input
                type="radio"
                id={`permission-${opt.value}`}
                name="permissionMode"
                value={opt.value}
                checked={permissionMode === opt.value}
                onChange={() => handlePermissionChange(opt.value)}
                className="mt-0.5"
                aria-describedby={`permission-desc-${opt.value}`}
              />
              <div>
                <span className={`text-sm font-medium ${permissionMode === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                  {opt.label}
                </span>
                <p
                  id={`permission-desc-${opt.value}`}
                  className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                >
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Chat Timeout Setting */}
      <div>
        <label
          htmlFor="chat-timeout"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          채팅 타임아웃
          {isOverridden('chatTimeoutMs') && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
              (환경변수로 설정됨)
            </span>
          )}
        </label>
        <select
          id="chat-timeout"
          value={currentTimeout}
          onChange={(e) => handleTimeoutChange(Number(e.target.value))}
          disabled={isOverridden('chatTimeoutMs')}
          aria-disabled={isOverridden('chatTimeoutMs')}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {TIMEOUT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          응답이 없을 때 자동으로 요청을 중단하는 시간입니다.
        </p>
      </div>
    </div>
  );
}
