/**
 * AdvancedSettingsSection - Advanced settings for system prompt and SDK options
 * Shows the system prompt template with {variable} placeholders.
 * Variables like {gitBranch} are resolved at runtime by the server.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RotateCcw, Terminal, RefreshCw, Download } from 'lucide-react';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useSessionStore } from '../../stores/sessionStore';
import { preferencesApi } from '../../services/api/preferences';
import { projectsApi } from '../../services/api/projects';
import { api } from '../../services/api/client.js';

interface TemplateVariable {
  name: string;
  description: string;
}

export function AdvancedSettingsSection() {
  const { t } = useTranslation('settings');
  const { preferences, overrides, updatePreference } = usePreferencesStore();
  const currentProjectSlug = useSessionStore((s) => s.currentProjectSlug);

  // Default template and variables fetched from server
  const [defaultTemplate, setDefaultTemplate] = useState<string | null>(null);
  const [resolvedPreview, setResolvedPreview] = useState<string | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Local state for system prompt with debounced save
  const [promptText, setPromptText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCustomized = preferences.customSystemPrompt != null;

  // Fetch default template (project-independent)
  useEffect(() => {
    setIsLoadingPrompt(true);
    preferencesApi.getSystemPromptTemplate()
      .then((data) => {
        setDefaultTemplate(data.template);
        setVariables(data.variables as TemplateVariable[]);
        if (!preferences.customSystemPrompt) {
          setPromptText(data.template);
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => setIsLoadingPrompt(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch resolved preview when project is available
  useEffect(() => {
    if (!currentProjectSlug) return;
    projectsApi.getSystemPrompt(currentProjectSlug)
      .then((data) => {
        setResolvedPreview(data.resolved);
      })
      .catch(() => {
        // Silently fail
      });
  }, [currentProjectSlug]);

  // Sync local state when preferences load from server
  useEffect(() => {
    if (preferences.customSystemPrompt != null) {
      setPromptText(preferences.customSystemPrompt);
    } else if (defaultTemplate) {
      setPromptText(defaultTemplate);
    }
  }, [preferences.customSystemPrompt, defaultTemplate]);

  const handlePromptChange = useCallback((value: string) => {
    setPromptText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Save only if different from default template
      if (value === defaultTemplate) {
        updatePreference('customSystemPrompt', undefined);
      } else {
        updatePreference('customSystemPrompt', value || undefined);
      }
      toast.success(t('toast.systemPromptSaved'));
    }, 1000);
  }, [updatePreference, defaultTemplate]);

  const handleRestoreDefault = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updatePreference('customSystemPrompt', undefined);
    if (defaultTemplate) {
      setPromptText(defaultTemplate);
    }
    toast.success(t('toast.systemPromptRestored'));
  }, [updatePreference, defaultTemplate]);

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

  const isTerminalOverridden = overrides.includes('terminalEnabled');
  const terminalEnabled = preferences.terminalEnabled !== false;

  const handleTerminalToggle = useCallback(() => {
    if (isTerminalOverridden) return;
    const newValue = !terminalEnabled;
    updatePreference('terminalEnabled', newValue);
    toast.success(t(newValue ? 'toast.terminalEnabled' : 'toast.terminalDisabled'));
  }, [terminalEnabled, isTerminalOverridden, updatePreference]);

  // Server info
  const [isDevMode, setIsDevMode] = useState<boolean | null>(null);
  const [serverVersion, setServerVersion] = useState('');

  useEffect(() => {
    api.get<{ isDevMode: boolean; version: string }>('/server/info')
      .then((data) => {
        setIsDevMode(data.isDevMode);
        setServerVersion(data.version);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Build/update progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [buildElapsed, setBuildElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update check state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  /** Shared polling logic: start timer + poll build-status until idle/failed */
  const startPollingBuildStatus = useCallback((successMessage: string) => {
    setBuildElapsed(0);
    timerRef.current = setInterval(() => {
      setBuildElapsed((prev) => prev + 1);
    }, 1000);

    let consecutiveErrors = 0;
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.get<{ status: string; error?: string }>('/server/build-status');
        consecutiveErrors = 0;
        if (result.status === 'failed') {
          stopPolling();
          toast.error(t('toast.buildFailed', { error: result.error?.slice(0, 200) ?? t('toast.buildFailedUnknown') }));
          setIsProcessing(false);
        } else if (result.status === 'idle') {
          stopPolling();
          toast.success(successMessage);
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors > 40) {
          stopPolling();
          toast.error(t('toast.serverTimeout'));
          setIsProcessing(false);
        }
      }
    }, 3000);
  }, [stopPolling]);

  const handleServerRestart = useCallback(async () => {
    if (!window.confirm(t('confirm.serverRestart'))) return;
    setIsProcessing(true);
    try {
      await api.post('/server/restart');
      startPollingBuildStatus(t('toast.buildComplete'));
    } catch {
      toast.error(t('toast.serverRestartFailed'));
      setIsProcessing(false);
    }
  }, [startPollingBuildStatus]);

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

  const handleUpdate = useCallback(async () => {
    if (!window.confirm(t('confirm.updateVersion', { version: latestVersion }))) return;
    setIsProcessing(true);
    try {
      await api.post('/server/update');
      startPollingBuildStatus(t('toast.updateComplete'));
    } catch {
      toast.error(t('toast.updateFailed'));
      setIsProcessing(false);
    }
  }, [latestVersion, startPollingBuildStatus]);

  return (
    <div className="space-y-8">
      {/* Server Management - conditional on dev/user mode */}
      {isDevMode !== null && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            {isDevMode
              ? <RefreshCw className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              : <Download className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            }
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t(isDevMode ? 'advanced.serverRestart' : 'advanced.softwareUpdate')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40'
                }`}
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              {isProcessing ? t('advanced.building', { elapsed: buildElapsed }) : t('advanced.serverRebuild')}
            </button>
          ) : (
            /* User mode: check update & apply */
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={isProcessing || isCheckingUpdate}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                  border border-gray-300 dark:border-gray-600
                  ${isCheckingUpdate
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
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
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                    }`}
                >
                  <Download className={`w-4 h-4 ${isProcessing ? 'animate-bounce' : ''}`} />
                  {isProcessing
                    ? t('advanced.updating', { elapsed: buildElapsed })
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

      {/* Terminal Enable/Disable Toggle (Story 17.5) */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <div>
              <label
                htmlFor="terminal-enabled"
                className="block text-sm font-medium text-gray-900 dark:text-white"
              >
                {t('advanced.terminalFeature')}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('advanced.terminalDesc')}
              </p>
            </div>
          </div>
          <button
            id="terminal-enabled"
            type="button"
            role="switch"
            aria-checked={terminalEnabled}
            disabled={isTerminalOverridden}
            onClick={handleTerminalToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${terminalEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}
              ${isTerminalOverridden ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${terminalEnabled ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
        {isTerminalOverridden && (
          <p className="mt-1.5 ml-8 text-xs text-amber-600 dark:text-amber-400">
            {t('advanced.terminalOverrideWarning')}
          </p>
        )}
      </div>

      {/* System Prompt Template */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="custom-system-prompt"
            className="block text-sm font-medium text-gray-900 dark:text-white"
          >
            {t('advanced.systemPrompt')}
          </label>
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

        {/* Warning banner */}
        <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>{t('advanced.systemPromptWarning')}</strong> {t('advanced.systemPromptWarningDetail')}
          </p>
        </div>

        {/* Customized indicator */}
        {isCustomized && (
          <div className="mb-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded text-xs text-blue-600 dark:text-blue-400">
            {t('advanced.customPromptActive')}
          </div>
        )}

        {isLoadingPrompt ? (
          <div className="w-full h-[260px] rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
            <span className="text-sm text-gray-400">{t('advanced.promptLoading')}</span>
          </div>
        ) : (
          <textarea
            id="custom-system-prompt"
            value={promptText}
            onChange={(e) => handlePromptChange(e.target.value)}
            rows={16}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        )}
        <div className="mt-1 flex items-center justify-between">
          {!currentProjectSlug ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('advanced.promptNoProject')}
            </p>
          ) : (
            <span />
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('advanced.charCount', { count: promptText.length })}
          </p>
        </div>

        {/* Available template variables */}
        {variables.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('advanced.templateVariables')}
            </p>
            <div className="space-y-1">
              {variables.map((v) => (
                <div key={v.name} className="flex items-start gap-2 text-xs">
                  <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-blue-600 dark:text-blue-400 font-mono shrink-0">
                    {`{${v.name}}`}
                  </code>
                  <span className="text-gray-500 dark:text-gray-400">{v.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolved preview toggle */}
        {resolvedPreview && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
            >
              {t(showPreview ? 'advanced.previewClose' : 'advanced.previewOpen')}
            </button>
            {showPreview && (
              <pre className="mt-2 p-3 text-xs font-mono bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-60 overflow-y-auto">
                {resolvedPreview}
              </pre>
            )}
          </div>
        )}
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
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('advanced.maxBudgetDesc')}
        </p>
      </div>
    </div>
  );
}
