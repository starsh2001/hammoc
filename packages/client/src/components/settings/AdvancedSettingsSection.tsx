/**
 * AdvancedSettingsSection - Advanced settings for system prompt and SDK options
 * Custom system prompt (replace mode), Max Thinking Tokens, Max Turns, Max Budget
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePreferencesStore } from '../../stores/preferencesStore';

export function AdvancedSettingsSection() {
  const { preferences, updatePreference } = usePreferencesStore();

  // Local state for system prompt with debounced save
  const [promptText, setPromptText] = useState(preferences.customSystemPrompt ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when preferences load from server
  useEffect(() => {
    setPromptText(preferences.customSystemPrompt ?? '');
  }, [preferences.customSystemPrompt]);

  const handlePromptChange = useCallback((value: string) => {
    setPromptText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updatePreference('customSystemPrompt', value || undefined);
      toast.success('시스템 프롬프트가 저장되었습니다');
    }, 1000);
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
    toast.success(`${label}이(가) 변경되었습니다`);
  }, [updatePreference]);

  return (
    <div className="space-y-8">
      {/* Custom System Prompt */}
      <div>
        <label
          htmlFor="custom-system-prompt"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          커스텀 시스템 프롬프트
        </label>
        <div className="mb-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            기본 Claude Code 시스템 프롬프트를 완전히 교체합니다. 빈 값이면 기본 프롬프트가 사용됩니다.
            워크스페이스 컨텍스트(Git 상태, 파일 참조 포맷)는 항상 자동으로 추가됩니다.
          </p>
        </div>
        <textarea
          id="custom-system-prompt"
          value={promptText}
          onChange={(e) => handlePromptChange(e.target.value)}
          rows={10}
          placeholder="예: You are a senior TypeScript developer. Always respond in Korean..."
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 text-right">
          {promptText.length}자
        </p>
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
