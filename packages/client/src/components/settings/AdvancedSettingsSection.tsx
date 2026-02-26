/**
 * AdvancedSettingsSection - Advanced settings for system prompt and SDK options
 * Shows the system prompt template with {variable} placeholders.
 * Variables like {gitBranch} are resolved at runtime by the server.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Terminal } from 'lucide-react';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useSessionStore } from '../../stores/sessionStore';
import { projectsApi } from '../../services/api/projects';

interface TemplateVariable {
  name: string;
  description: string;
}

export function AdvancedSettingsSection() {
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

  // Fetch default template from server when project is available
  useEffect(() => {
    if (!currentProjectSlug) return;
    setIsLoadingPrompt(true);
    projectsApi.getSystemPrompt(currentProjectSlug)
      .then((data) => {
        setDefaultTemplate(data.template);
        setResolvedPreview(data.resolved);
        setVariables(data.variables as TemplateVariable[]);
        if (!preferences.customSystemPrompt) {
          setPromptText(data.template);
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => setIsLoadingPrompt(false));
  }, [currentProjectSlug]); // eslint-disable-line react-hooks/exhaustive-deps

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
      toast.success('시스템 프롬프트가 저장되었습니다');
    }, 1000);
  }, [updatePreference, defaultTemplate]);

  const handleRestoreDefault = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updatePreference('customSystemPrompt', undefined);
    if (defaultTemplate) {
      setPromptText(defaultTemplate);
    }
    toast.success('기본 시스템 프롬프트로 복원되었습니다');
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
    toast.success(`${label}이(가) 변경되었습니다`);
  }, [updatePreference]);

  const isTerminalOverridden = overrides.includes('terminalEnabled');
  const terminalEnabled = preferences.terminalEnabled !== false;

  const handleTerminalToggle = useCallback(() => {
    if (isTerminalOverridden) return;
    const newValue = !terminalEnabled;
    updatePreference('terminalEnabled', newValue);
    toast.success(newValue ? '터미널이 활성화되었습니다' : '터미널이 비활성화되었습니다');
  }, [terminalEnabled, isTerminalOverridden, updatePreference]);

  return (
    <div className="space-y-8">
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
                터미널 기능
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                웹 기반 터미널 셸 기능을 활성화합니다
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
            환경 변수 TERMINAL_ENABLED에 의해 비활성화되어 있습니다
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
            시스템 프롬프트
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
              기본값으로 복원
            </button>
          )}
        </div>

        {/* Warning banner */}
        <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>주의:</strong> 시스템 프롬프트를 잘못 수정하면 응답 퀄리티가 크게 저하될 수 있습니다.
            수정 내용에 확신이 없다면 기본값을 유지하세요.
          </p>
        </div>

        {/* Customized indicator */}
        {isCustomized && (
          <div className="mb-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded text-xs text-blue-600 dark:text-blue-400">
            사용자 정의 프롬프트 사용 중
          </div>
        )}

        {isLoadingPrompt ? (
          <div className="w-full h-[260px] rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
            <span className="text-sm text-gray-400">프롬프트 로딩 중...</span>
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
              프로젝트를 선택하면 현재 시스템 프롬프트를 확인할 수 있습니다.
            </p>
          ) : (
            <span />
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {promptText.length}자
          </p>
        </div>

        {/* Available template variables */}
        {variables.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              사용 가능한 시스템 변수 (런타임에 자동 치환)
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
              {showPreview ? '미리보기 닫기' : '현재 프로젝트 기준 미리보기'}
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
          Max Thinking Tokens
        </label>
        <input
          id="max-thinking-tokens"
          type="number"
          min={1024}
          max={128000}
          step={1024}
          value={preferences.maxThinkingTokens ?? ''}
          onChange={(e) => handleNumberChange('maxThinkingTokens', e.target.value, 'Max Thinking Tokens')}
          placeholder="SDK 기본값"
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          모델의 사고(reasoning) 과정에 사용할 최대 토큰 수 (1,024 ~ 128,000)
        </p>
      </div>

      {/* Max Turns */}
      <div>
        <label
          htmlFor="max-turns"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          Max Turns
        </label>
        <input
          id="max-turns"
          type="number"
          min={1}
          max={100}
          step={1}
          value={preferences.maxTurns ?? ''}
          onChange={(e) => handleNumberChange('maxTurns', e.target.value, 'Max Turns')}
          placeholder="무제한"
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          한 번의 대화에서 허용할 최대 턴 수 (1 ~ 100)
        </p>
      </div>

      {/* Max Budget (USD) */}
      <div>
        <label
          htmlFor="max-budget"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          Max Budget (USD)
        </label>
        <input
          id="max-budget"
          type="number"
          min={0.01}
          max={100}
          step={0.01}
          value={preferences.maxBudgetUsd ?? ''}
          onChange={(e) => handleNumberChange('maxBudgetUsd', e.target.value, 'Max Budget')}
          placeholder="무제한"
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          한 번의 쿼리당 최대 비용 제한 (USD, 0.01 ~ 100)
        </p>
      </div>
    </div>
  );
}
