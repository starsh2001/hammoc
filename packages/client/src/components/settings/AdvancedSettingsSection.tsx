/**
 * AdvancedSettingsSection - Advanced settings for system prompt and SDK options
 * Shows the system prompt template with {variable} placeholders.
 * Variables like {gitBranch} are resolved at runtime by the server.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RotateCcw, RefreshCw, Download, ChevronRight, X } from 'lucide-react';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useSessionStore } from '../../stores/sessionStore';
import { preferencesApi } from '../../services/api/preferences';
import { projectsApi } from '../../services/api/projects';
import { api } from '../../services/api/client.js';
import { SettingsSyncNotice } from './SettingsSyncNotice';
import { CliModeSettingsPanel } from './CliModeSettingsPanel';
import { DebugSettingsPanel } from './DebugSettingsPanel';

/**
 * Poll server health after restart/update.
 * Runs outside React lifecycle so it survives component unmounts
 * (e.g. when auth redirect unmounts the settings page).
 * Uses /health (not /api/*) to bypass service worker NetworkFirst cache.
 */
function pollServerHealth(successMessage: string, onServerDown?: () => void): void {
  let consecutiveErrors = 0;
  let serverWentDown = false;

  const poll = setInterval(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`/health?_=${Date.now()}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('not ok');
      if (!serverWentDown) return;
      clearInterval(poll);
      toast.success(successMessage);
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      clearTimeout(timeout);
      if (!serverWentDown) {
        serverWentDown = true;
        onServerDown?.();
      }
      consecutiveErrors++;
      if (consecutiveErrors > 60) {
        clearInterval(poll);
        toast.error('Server restart timed out');
      }
    }
  }, 3000);
}

interface TemplateVariable {
  name: string;
  description: string;
}

export function AdvancedSettingsSection() {
  const { t } = useTranslation('settings');
  const { preferences, updatePreference } = usePreferencesStore();
  const currentProjectSlug = useSessionStore((s) => s.currentProjectSlug);

  // Fixed sections text from server
  const [fixedSectionsText, setFixedSectionsText] = useState<string>('');
  const [resolvedPreview, setResolvedPreview] = useState<string | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);

  // Local state for user area with debounced save
  const [promptText, setPromptText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPromptFocusedRef = useRef(false);
  const isCustomized = preferences.customSystemPrompt != null;
  const showMigrationBanner = (preferences as Record<string, unknown>)._systemPromptMigrated === true;

  // Fetch fixed sections from server
  useEffect(() => {
    setIsLoadingPrompt(true);
    if (currentProjectSlug) {
      projectsApi.getSystemPrompt(currentProjectSlug)
        .then((data) => {
          const parts = [data.sections.common, data.sections.engineSpecific];
          if (data.sections.bmad) parts.push(data.sections.bmad);
          setFixedSectionsText(parts.join('\n'));
          setResolvedPreview(data.resolved);
          setVariables(data.variables as TemplateVariable[]);
        })
        .catch(() => {})
        .finally(() => setIsLoadingPrompt(false));
    } else {
      preferencesApi.getSystemPromptTemplate()
        .then((data) => {
          const parts = [data.sections.common, data.sections.sdk];
          setFixedSectionsText(parts.join('\n'));
          setVariables(data.variables as TemplateVariable[]);
        })
        .catch(() => {})
        .finally(() => setIsLoadingPrompt(false));
    }
  }, [currentProjectSlug]);

  // Fetch resolved preview when project changes or user area changes
  useEffect(() => {
    if (!currentProjectSlug) return;
    projectsApi.getSystemPrompt(currentProjectSlug)
      .then((data) => {
        setResolvedPreview(data.resolved);
      })
      .catch(() => {});
  }, [currentProjectSlug, preferences.customSystemPrompt]);

  // Sync local state when preferences change (multi-device sync)
  useEffect(() => {
    if (isPromptFocusedRef.current) return;
    setPromptText(preferences.customSystemPrompt ?? '');
  }, [preferences.customSystemPrompt]);

  const handlePromptChange = useCallback((value: string) => {
    setPromptText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updatePreference('customSystemPrompt', value || undefined);
      toast.success(t('toast.systemPromptSaved'));
    }, 1000);
  }, [updatePreference]);

  const handleRestoreDefault = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updatePreference('customSystemPrompt', undefined);
    updatePreference('_systemPromptMigrated' as keyof typeof preferences, undefined);
    setPromptText('');
    toast.success(t('toast.systemPromptRestored'));
  }, [updatePreference]);

  const handleDismissMigration = useCallback(() => {
    updatePreference('_systemPromptMigrated' as keyof typeof preferences, undefined);
  }, [updatePreference]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleNumberChange = useCallback((
    key: 'maxThinkingTokens' | 'maxTurns' | 'maxBudgetUsd',
    value: string,
    label: string,
  ) => {
    const num = value === '' ? undefined : Number(value);
    updatePreference(key, num);
    toast.success(t('toast.settingChanged', { label }));
  }, [updatePreference]);

  // Server info
  const [isDevMode, setIsDevMode] = useState<boolean | null>(null);
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [serverVersion, setServerVersion] = useState('');

  useEffect(() => {
    api.get<{ isDevMode: boolean; isDebugMode?: boolean; version: string }>('/server/info')
      .then((data) => {
        setIsDevMode(data.isDevMode);
        setIsDebugMode(data.isDebugMode ?? false);
        setServerVersion(data.version);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Build/update progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processPhase, setProcessPhase] = useState<'building' | 'restarting'>('building');
  const [buildElapsed, setBuildElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update check state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Cleanup elapsed timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleServerRestart = useCallback(() => {
    if (!window.confirm(t('confirm.serverRestart'))) return;
    setIsProcessing(true);
    setProcessPhase('building');
    setBuildElapsed(0);
    timerRef.current = setInterval(() => setBuildElapsed((prev) => prev + 1), 1000);
    api.post('/server/restart').catch(() => {});
    pollServerHealth(t('toast.buildComplete'), () => setProcessPhase('restarting'));
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setIsCheckingUpdate(true);
    try {
      const result = await api.get<{ currentVersion: string; latestVersion: string; updateAvailable: boolean }>('/server/check-update');
      setLatestVersion(result.latestVersion);
      setUpdateAvailable(result.updateAvailable);
      if (!result.updateAvailable) {
        toast.success(t('toast.alreadyLatest'));
      }
    } catch {
      toast.error(t('toast.updateCheckFailed'));
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  const handleUpdate = useCallback(() => {
    if (!window.confirm(t('confirm.updateVersion', { version: latestVersion }))) return;
    setIsProcessing(true);
    setProcessPhase('building');
    setBuildElapsed(0);
    timerRef.current = setInterval(() => setBuildElapsed((prev) => prev + 1), 1000);
    api.post('/server/update').catch(() => {});
    pollServerHealth(t('toast.updateComplete'), () => setProcessPhase('restarting'));
  }, [latestVersion]);

  return (
    <div className="space-y-8">
      <SettingsSyncNotice />

      {/* Server Management - conditional on dev/user mode */}
      {isDevMode !== null && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            {isDevMode
              ? <RefreshCw className="w-5 h-5 text-gray-500 dark:text-gray-300" aria-hidden="true" />
              : <Download className="w-5 h-5 text-gray-500 dark:text-gray-300" aria-hidden="true" />
            }
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t(isDevMode ? 'advanced.serverRestart' : 'advanced.softwareUpdate')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-300">
                {t(isDevMode ? 'advanced.serverRestartDesc' : 'advanced.currentVersion', isDevMode ? undefined : { version: serverVersion })}
              </p>
            </div>
          </div>

          {isDevMode ? (
            /* Dev mode: rebuild & restart */
            <button
              type="button"
              onClick={handleServerRestart}
              disabled={isProcessing}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                ${isProcessing
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-300 cursor-not-allowed'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40'
                }`}
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              {isProcessing ? t(`advanced.${processPhase}`, { elapsed: buildElapsed }) : t('advanced.serverRebuild')}
            </button>
          ) : (
            /* User mode: check update & apply */
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={isProcessing || isCheckingUpdate}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                  border border-gray-300 dark:border-[#455568]
                  ${isCheckingUpdate
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-300 cursor-not-allowed'
                    : 'bg-white dark:bg-[#263240] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#253040]'
                  }`}
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                {isCheckingUpdate ? t('advanced.checking') : t('advanced.checkUpdate')}
              </button>

              {updateAvailable && latestVersion && (
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={isProcessing}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                    ${isProcessing
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-300 cursor-not-allowed'
                      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                    }`}
                >
                  <Download className={`w-4 h-4 ${isProcessing ? 'animate-bounce' : ''}`} />
                  {isProcessing
                    ? t(`advanced.${processPhase === 'restarting' ? 'restarting' : 'updating'}`, { elapsed: buildElapsed })
                    : t('advanced.updateTo', { version: latestVersion })
                  }
                </button>
              )}

              {latestVersion && !updateAvailable && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  {t('advanced.latestVersion')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Common group (both engines) ===== */}
      <div className="pt-2 border-t border-gray-200 dark:border-[#3a4d5e]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('advanced.groupCommon')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{t('advanced.groupCommonDesc')}</p>
      </div>

      {/* System Prompt */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-900 dark:text-white">
            {t('advanced.systemPrompt')}
          </label>
          <div className="flex items-center gap-2">
            {isCustomized && (
              <button
                type="button"
                onClick={handleRestoreDefault}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
                           text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300
                           bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50
                           border border-blue-200 dark:border-blue-700 rounded-md transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {t('advanced.restoreDefault')}
              </button>
            )}
          </div>
        </div>

        {/* Migration banner */}
        {showMigrationBanner && (
          <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-start gap-2">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
              {t('advanced.migrationBanner')}
            </p>
            <button
              type="button"
              onClick={handleDismissMigration}
              className="shrink-0 p-0.5 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isLoadingPrompt ? (
          <div className="w-full h-[260px] rounded-lg border border-gray-300 dark:border-[#455568] bg-gray-50 dark:bg-[#263240] flex items-center justify-center">
            <span className="text-sm text-gray-400">{t('advanced.promptLoading')}</span>
          </div>
        ) : (
          <>
            {/* Read-only fixed sections accordion */}
            <div className="mb-3 border border-gray-300 dark:border-[#455568] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setSectionsExpanded(!sectionsExpanded)}
                aria-expanded={sectionsExpanded}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium
                           text-gray-600 dark:text-gray-300
                           bg-gray-50 dark:bg-[#1e2a35] hover:bg-gray-100 dark:hover:bg-[#253040]
                           transition-colors"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${sectionsExpanded ? 'rotate-90' : ''}`} />
                {t('advanced.fixedSectionsLabel')}
                <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                  {t('advanced.fixedSectionsNote')}
                </span>
              </button>
              {sectionsExpanded && (
                <pre
                  aria-readonly="true"
                  className="px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-[#1e2a35]
                             text-gray-500 dark:text-gray-400 whitespace-pre-wrap
                             max-h-60 overflow-y-auto border-t border-gray-200 dark:border-[#3a4d5e]"
                >
                  {fixedSectionsText}
                </pre>
              )}
            </div>

            {/* User area separator */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('advanced.userAreaLabel')}
              </span>
              {isCustomized && (
                <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded text-[10px] text-blue-600 dark:text-blue-400">
                  {t('advanced.customPromptActive')}
                </span>
              )}
            </div>

            {/* User-editable textarea */}
            <textarea
              id="custom-system-prompt"
              value={promptText}
              onChange={(e) => handlePromptChange(e.target.value)}
              onFocus={() => { isPromptFocusedRef.current = true; }}
              onBlur={() => { isPromptFocusedRef.current = false; }}
              placeholder={t('advanced.userAreaPlaceholder')}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-white dark:bg-[#263240] text-gray-900 dark:text-white font-mono text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </>
        )}
        <div className="mt-1 flex items-center justify-between">
          {!currentProjectSlug ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('advanced.promptNoProject')}
            </p>
          ) : (
            <span />
          )}
          <p
            className="text-xs text-gray-500 dark:text-gray-300 cursor-default"
            title={t('advanced.charCountBreakdown', {
              system: fixedSectionsText.length,
              user: promptText.length,
            })}
          >
            {t('advanced.charCount', { count: fixedSectionsText.length + promptText.length })}
          </p>
        </div>

        {/* Available template variables */}
        {variables.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-[#263240]/50 border border-gray-300 dark:border-[#3a4d5e] rounded-lg">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">
              {t('advanced.templateVariables')}
            </p>
            <div className="space-y-1">
              {variables.map((v) => (
                <div key={v.name} className="flex items-start gap-2 text-xs">
                  <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-[#253040] rounded text-blue-600 dark:text-blue-400 font-mono shrink-0">
                    {`{${v.name}}`}
                  </code>
                  <span className="text-gray-500 dark:text-gray-300">{v.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview Full Prompt */}
        {currentProjectSlug && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                if (!showPreview) {
                  projectsApi.getSystemPrompt(currentProjectSlug)
                    .then((data) => setResolvedPreview(data.resolved))
                    .catch(() => {});
                }
                setShowPreview(!showPreview);
              }}
              className="text-xs text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 underline"
            >
              {t(showPreview ? 'advanced.previewClose' : 'advanced.previewOpen')}
            </button>
            {showPreview && resolvedPreview && (
              <pre className="mt-2 p-3 text-xs font-mono bg-gray-100 dark:bg-[#1c2129] border border-gray-300 dark:border-[#3a4d5e] rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-600 dark:text-gray-300 max-h-60 overflow-y-auto">
                {resolvedPreview}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* File Checkpointing */}
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          {t('advanced.fileCheckpointing')}
        </p>
        <div className="space-y-3">
          {/* Chat checkpointing */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.enableChatCheckpointing ?? true}
              onChange={(e) => {
                updatePreference('enableChatCheckpointing', e.target.checked);
                toast.success(t('toast.settingChanged', { label: t('advanced.chatCheckpointing') }));
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-white">{t('advanced.chatCheckpointing')}</span>
              <p className="text-xs text-gray-500 dark:text-gray-300">{t('advanced.chatCheckpointingDesc')}</p>
            </div>
          </label>

          {/* Queue checkpointing */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.enableQueueCheckpointing ?? false}
              onChange={(e) => {
                updatePreference('enableQueueCheckpointing', e.target.checked);
                toast.success(t('toast.settingChanged', { label: t('advanced.queueCheckpointing') }));
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-white">{t('advanced.queueCheckpointing')}</span>
              <p className="text-xs text-gray-500 dark:text-gray-300">{t('advanced.queueCheckpointingDesc')}</p>
            </div>
          </label>
        </div>
      </div>

      {/* Card entrance animation: streaming cards bubble in one by one (both engines) */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.cardEntranceAnimation ?? true}
            onChange={(e) => {
              updatePreference('cardEntranceAnimation', e.target.checked);
              toast.success(t('toast.settingChanged', { label: t('advanced.cardEntranceAnimation') }));
            }}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-900 dark:text-white">{t('advanced.cardEntranceAnimation')}</span>
            <p className="text-xs text-gray-500 dark:text-gray-300">{t('advanced.cardEntranceAnimationDesc')}</p>
          </div>
        </label>
      </div>

      {/* Auto-compaction master switch — autoCompactEnabled preference (both engines) */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.autoCompactEnabled ?? true}
            onChange={(e) => {
              updatePreference('autoCompactEnabled', e.target.checked);
              toast.success(t('toast.settingChanged', { label: t('advanced.autoCompactEnabled') }));
            }}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-900 dark:text-white">{t('advanced.autoCompactEnabled')}</span>
            <p className="text-xs text-gray-500 dark:text-gray-300">{t('advanced.autoCompactEnabledDesc')}</p>
          </div>
        </label>
      </div>

      {/* ===== SDK-only group ===== */}
      <div className="pt-2 border-t border-gray-200 dark:border-[#3a4d5e]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('advanced.groupSdk')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{t('advanced.groupSdkDesc')}</p>
      </div>

      {/* Max Thinking Tokens */}
      <div>
        <label
          htmlFor="max-thinking-tokens"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          {t('advanced.maxThinkingTokens')}
        </label>
        <input
          id="max-thinking-tokens"
          type="number"
          min={1024}
          max={128000}
          step={1024}
          value={preferences.maxThinkingTokens ?? ''}
          onChange={(e) => handleNumberChange('maxThinkingTokens', e.target.value, t('advanced.maxThinkingTokens'))}
          placeholder={t('advanced.sdkDefault')}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                     bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('advanced.maxThinkingTokensDesc')}
        </p>
      </div>

      {/* Max Turns */}
      <div>
        <label
          htmlFor="max-turns"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          {t('advanced.maxTurns')}
        </label>
        <input
          id="max-turns"
          type="number"
          min={1}
          max={100}
          step={1}
          value={preferences.maxTurns ?? ''}
          onChange={(e) => handleNumberChange('maxTurns', e.target.value, t('advanced.maxTurns'))}
          placeholder={t('advanced.unlimited')}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                     bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('advanced.maxTurnsDesc')}
        </p>
      </div>

      {/* Max Budget (USD) */}
      <div>
        <label
          htmlFor="max-budget"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          {t('advanced.maxBudget')}
        </label>
        <input
          id="max-budget"
          type="number"
          min={0.01}
          max={100}
          step={0.01}
          value={preferences.maxBudgetUsd ?? ''}
          onChange={(e) => handleNumberChange('maxBudgetUsd', e.target.value, t('advanced.maxBudget'))}
          placeholder={t('advanced.unlimited')}
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                     bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('advanced.maxBudgetDesc')}
        </p>
      </div>

      {/* Thinking block visibility (Opus 4.7+ flipped API default to 'omitted'; same on 4.8) */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.showThinkingBlocks ?? true}
            onChange={(e) => {
              updatePreference('showThinkingBlocks', e.target.checked);
              toast.success(t('toast.settingChanged', { label: t('advanced.showThinkingBlocks') }));
            }}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-900 dark:text-white">{t('advanced.showThinkingBlocks')}</span>
            <p className="text-xs text-gray-500 dark:text-gray-300">{t('advanced.showThinkingBlocksDesc')}</p>
          </div>
        </label>
      </div>

      {/* ===== CLI-only group (moved from Global settings) ===== */}
      <div className="pt-2 border-t border-gray-200 dark:border-[#3a4d5e]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('advanced.groupCli')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{t('advanced.groupCliDesc')}</p>
      </div>
      <CliModeSettingsPanel />

      {/* ===== Debug / Diagnostics group (Story BS-6) — gated by HAMMOC_DEBUG ===== */}
      {/* Completely absent from the DOM unless the server reports isDebugMode. */}
      {isDebugMode && (
        <>
          <div className="pt-2 border-t border-gray-200 dark:border-[#3a4d5e]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('advanced.groupDebug')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{t('advanced.groupDebugDesc')}</p>
          </div>
          <DebugSettingsPanel />
        </>
      )}
    </div>
  );
}
