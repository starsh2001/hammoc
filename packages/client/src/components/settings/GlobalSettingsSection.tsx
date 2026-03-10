/**
 * GlobalSettingsSection - Global settings form for SettingsPage
 * Story 10.2: Theme, Default Model, Permission Mode, Chat Timeout
 * Epic 22: i18n support with useTranslation
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useChatStore } from '../../stores/chatStore';
import { useTheme, type Theme } from '../../hooks/useTheme';
import { MODEL_GROUPS } from '../ModelSelector';
import type { PermissionMode, SupportedLanguage } from '@hammoc/shared';
import { SUPPORTED_LANGUAGES } from '@hammoc/shared';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  'zh-CN': '中文(简体)',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  pt: 'Português',
};

export function GlobalSettingsSection() {
  const { t, i18n } = useTranslation('settings');
  const { preferences, overrides, updatePreference, setLanguage } = usePreferencesStore();
  const { theme, setTheme } = useTheme();
  const permissionModePref = preferences.permissionMode ?? 'default';
  const setPermissionMode = useChatStore((s) => s.setPermissionMode);

  const isOverridden = useCallback((field: string) => overrides.includes(field), [overrides]);

  const handleThemeChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    toast.success(t('toast.themeChanged'));
  }, [setTheme, t]);

  const handleModelChange = useCallback((value: string) => {
    updatePreference('defaultModel', value);
    toast.success(t('toast.modelChanged'));
  }, [updatePreference, t]);

  const handlePermissionChange = useCallback((value: PermissionMode | 'latest') => {
    updatePreference('permissionMode', value);
    // When a fixed mode is selected, also update the current session
    if (value !== 'latest') {
      setPermissionMode(value);
    }
    toast.success(t('toast.permissionChanged'));
  }, [updatePreference, setPermissionMode, t]);

  const handleTimeoutChange = useCallback((value: number) => {
    updatePreference('chatTimeoutMs', value);
    toast.success(t('toast.timeoutChanged'));
  }, [updatePreference, t]);

  const handleLanguageChange = useCallback((value: string) => {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(value)) return;
    setLanguage(value as SupportedLanguage);
    toast.success(t('toast.languageChanged'));
  }, [setLanguage, t]);

  const currentTimeout = preferences.chatTimeoutMs ?? 300000;

  return (
    <div className="space-y-8">
      {/* Theme Setting */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('global.theme')}
        </legend>
        <div className="flex flex-wrap gap-3">
          {([
            { value: 'dark' as const, labelKey: 'global.themeOption.dark' },
            { value: 'light' as const, labelKey: 'global.themeOption.light' },
            { value: 'system' as const, labelKey: 'global.themeOption.system' },
          ]).map((opt) => (
            <label
              key={opt.value}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors
                ${theme === opt.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-[#2d3a4a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#263240]'
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
              {t(opt.labelKey)}
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
          {t('global.defaultModel')}
        </label>
        <select
          id="default-model"
          value={preferences.defaultModel ?? ''}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2d3a4a]
                     bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MODEL_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.labelKey ? t(group.labelKey) : group.label}>
              {group.models.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}{model.description ? ` — ${model.description}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Language Setting (Epic 22) */}
      <div>
        <label
          htmlFor="language"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          {t('global.language')}
        </label>
        <select
          id="language"
          value={preferences.language ?? i18n.language ?? 'en'}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2d3a4a]
                     bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_LABELS[lang]}
            </option>
          ))}
        </select>
      </div>

      {/* Permission Mode Setting */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('global.permissionMode')}
        </legend>
        <div className="space-y-2">
          {([
            { value: 'latest' as const, labelKey: 'global.permissionModeLabel.latest', descKey: 'global.permissionDesc.latest' },
            { value: 'plan' as const, labelKey: 'global.permissionModeLabel.plan', descKey: 'global.permissionDesc.plan' },
            { value: 'default' as const, labelKey: 'global.permissionModeLabel.default', descKey: 'global.permissionDesc.default' },
            { value: 'acceptEdits' as const, labelKey: 'global.permissionModeLabel.acceptEdits', descKey: 'global.permissionDesc.acceptEdits' },
            { value: 'bypassPermissions' as const, labelKey: 'global.permissionModeLabel.bypass', descKey: 'global.permissionDesc.bypass' },
          ]).map((opt) => (
            <label
              key={opt.value}
              className={`
                flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                ${permissionModePref === opt.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-[#2d3a4a] hover:bg-gray-50 dark:hover:bg-[#263240]'
                }
              `}
            >
              <input
                type="radio"
                name="permissionMode"
                value={opt.value}
                checked={permissionModePref === opt.value}
                onChange={() => handlePermissionChange(opt.value)}
                className="sr-only"
                aria-describedby={`permission-desc-${opt.value}`}
              />
              <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                permissionModePref === opt.value
                  ? 'border-blue-500'
                  : 'border-gray-400 dark:border-gray-500'
              }`}>
                {permissionModePref === opt.value && (
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                )}
              </div>
              <div>
                <span className={`text-sm font-medium ${permissionModePref === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                  {t(opt.labelKey)}
                </span>
                <p
                  id={`permission-desc-${opt.value}`}
                  className="text-xs text-gray-500 dark:text-gray-300 mt-0.5"
                >
                  {t(opt.descKey)}
                </p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Markdown Default Mode */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('global.markdownMode')}
        </legend>
        <div className="flex flex-wrap gap-3">
          {([
            { value: 'edit' as const, labelKey: 'global.markdownOption.edit' },
            { value: 'preview' as const, labelKey: 'global.markdownOption.preview' },
          ]).map((opt) => (
            <label
              key={opt.value}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors
                ${(preferences.markdownDefaultMode ?? 'edit') === opt.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-[#2d3a4a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#263240]'
                }
              `}
            >
              <input
                type="radio"
                id={`md-mode-${opt.value}`}
                name="markdownDefaultMode"
                value={opt.value}
                checked={(preferences.markdownDefaultMode ?? 'edit') === opt.value}
                onChange={() => {
                  updatePreference('markdownDefaultMode', opt.value);
                  toast.success(t('toast.markdownModeChanged'));
                }}
                className="sr-only"
              />
              {t(opt.labelKey)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('global.markdownDesc')}
        </p>
      </fieldset>

      {/* File Explorer Default View Mode */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('global.fileExplorerView')}
        </legend>
        <div className="flex flex-wrap gap-3">
          {([
            { value: 'grid' as const, labelKey: 'global.fileExplorerOption.grid' },
            { value: 'list' as const, labelKey: 'global.fileExplorerOption.list' },
          ]).map((opt) => (
            <label
              key={opt.value}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors
                ${(preferences.fileExplorerViewMode ?? 'grid') === opt.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-[#2d3a4a] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#263240]'
                }
              `}
            >
              <input
                type="radio"
                id={`explorer-view-${opt.value}`}
                name="fileExplorerViewMode"
                value={opt.value}
                checked={(preferences.fileExplorerViewMode ?? 'grid') === opt.value}
                onChange={() => {
                  updatePreference('fileExplorerViewMode', opt.value);
                  toast.success(t('toast.fileExplorerViewChanged'));
                }}
                className="sr-only"
              />
              {t(opt.labelKey)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('global.fileExplorerDesc')}
        </p>
      </fieldset>

      {/* Chat Timeout Setting */}
      <div>
        <label
          htmlFor="chat-timeout"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          {t('global.chatTimeout')}
          {isOverridden('chatTimeoutMs') && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
              {t('global.chatTimeoutOverride')}
            </span>
          )}
        </label>
        <select
          id="chat-timeout"
          value={currentTimeout}
          onChange={(e) => handleTimeoutChange(Number(e.target.value))}
          disabled={isOverridden('chatTimeoutMs')}
          aria-disabled={isOverridden('chatTimeoutMs')}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2d3a4a]
                     bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {([
            { value: 60000, labelKey: 'global.timeoutOption.1m' },
            { value: 180000, labelKey: 'global.timeoutOption.3m' },
            { value: 300000, labelKey: 'global.timeoutOption.5mDefault' },
            { value: 600000, labelKey: 'global.timeoutOption.10m' },
            { value: 1800000, labelKey: 'global.timeoutOption.30m' },
          ]).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('global.chatTimeoutDesc')}
        </p>
      </div>

    </div>
  );
}
