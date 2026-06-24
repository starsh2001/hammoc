/**
 * ClaudeLoginFlow (Story BS-7, refactored BS-9)
 *
 * Shared in-app Claude Code `/login` flow. Now backed by the `useClaudeLogin` hook
 * which manages WebSocket `auth:*` event lifecycle. This component is a UI wrapper
 * used in Onboarding (legacy, until removed) and Settings › Account.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, RefreshCw, LogIn, AlertCircle } from 'lucide-react';
import type { AccountInfo } from '@hammoc/shared';
import { useClaudeLogin } from '../hooks/useClaudeLogin';
import type { LoginMethod } from '../hooks/useClaudeLogin';

const METHODS: Array<{ id: LoginMethod; key: string }> = [
  { id: 1, key: 'subscription' },
  { id: 2, key: 'console' },
  { id: 3, key: 'thirdParty' },
];

interface Props {
  onComplete?: (account: AccountInfo | null) => void;
  onError?: (message: string) => void;
  autoStart?: boolean;
  className?: string;
}

export function ClaudeLoginFlow({ onComplete, onError, autoStart, className }: Props) {
  const { t } = useTranslation('auth');
  const [copied, setCopied] = useState(false);

  const handleComplete = useCallback(
    (account: AccountInfo | null) => {
      toast.success(t('loginFlow.completeToast'));
      onComplete?.(account);
    },
    [t, onComplete]
  );

  const handleError = useCallback(
    (message: string) => {
      toast.error(t('loginFlow.errorToast'));
      onError?.(message);
    },
    [t, onError]
  );

  const {
    phase, url, code, errorMsg, setCode,
    start, selectMethod, submitCode,
  } = useClaudeLogin({ onComplete: handleComplete, onError: handleError, autoStart });

  const copyUrl = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable — the link itself is still tappable */
    }
  }, [url]);

  const phaseLabel = (): string => {
    switch (phase) {
      case 'initializing':
        return t('loginFlow.phase.initializing');
      case 'method-select':
        return t('loginFlow.phase.methodSelect');
      case 'awaiting-auth':
        return t('loginFlow.phase.awaitingAuth');
      case 'code-input':
        return t('loginFlow.phase.codeInput');
      case 'completing':
        return t('loginFlow.phase.completing');
      case 'done':
        return t('loginFlow.phase.done');
      default:
        return '';
    }
  };

  const busy = phase === 'initializing' || phase === 'completing';

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {phase === 'idle' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('loginFlow.startHint')}</p>
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium
                       bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {t('loginFlow.startButton')}
          </button>
        </div>
      )}

      {phase !== 'idle' && phase !== 'error' && (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>{phaseLabel()}</span>
        </div>
      )}

      {phase === 'method-select' && (
        <div className="space-y-2" role="list">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="listitem"
              onClick={() => selectMethod(m.id)}
              className="w-full text-left px-3 py-2.5 rounded-md border border-gray-300 dark:border-[#455568]
                         hover:bg-gray-50 dark:hover:bg-[#263240] transition-colors"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {m.id}. {t(`loginFlow.method.${m.key}.label`)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t(`loginFlow.method.${m.key}.description`)}
              </div>
            </button>
          ))}
        </div>
      )}

      {(phase === 'awaiting-auth' || phase === 'code-input') && url && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('loginFlow.url.hint')}</p>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium
                         bg-blue-500 hover:bg-blue-600 text-white transition-colors break-all"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              {t('loginFlow.url.open')}
            </a>
            <button
              type="button"
              onClick={copyUrl}
              aria-label={t('loginFlow.url.copy')}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs
                         text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#455568]
                         hover:bg-gray-50 dark:hover:bg-[#263240] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t('loginFlow.url.copied') : t('loginFlow.url.copy')}
            </button>
          </div>
        </div>
      )}

      {phase === 'code-input' && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">
            {t('loginFlow.code.label')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCode();
              }}
              placeholder={t('loginFlow.code.placeholder')}
              autoFocus
              className="flex-1 px-3 py-2 rounded-md text-sm bg-white dark:bg-[#1c2129]
                         border border-gray-300 dark:border-[#455568] text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={submitCode}
              disabled={!code.trim()}
              className="px-3 py-2 rounded-md text-sm font-medium bg-blue-500 hover:bg-blue-600
                         disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {t('loginFlow.code.submit')}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400 break-words">
              {errorMsg || t('loginFlow.errorToast')}
            </p>
          </div>
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium
                       bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('loginFlow.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
