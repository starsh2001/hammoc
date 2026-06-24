import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { useClaudeLogin } from '../../../hooks/useClaudeLogin';
import type { LoginMethod } from '../../../hooks/useClaudeLogin';

const METHODS: Array<{ id: LoginMethod; key: string }> = [
  { id: 1, key: 'subscription' },
  { id: 2, key: 'console' },
  { id: 3, key: 'thirdParty' },
];

interface Props {
  onNext: () => void;
}

export function ClaudeLoginStep({ onNext }: Props) {
  const { t } = useTranslation('auth');
  const [copied, setCopied] = useState(false);
  const focusRef = useRef<HTMLButtonElement>(null);

  const handleComplete = useCallback(() => {
    toast.success(t('loginFlow.completeToast'));
    onNext();
  }, [t, onNext]);

  const handleError = useCallback(
    () => { toast.error(t('loginFlow.errorToast')); },
    [t]
  );

  const {
    phase, url, code, errorMsg, setCode,
    start, selectMethod, submitCode,
  } = useClaudeLogin({ onComplete: handleComplete, onError: handleError, autoStart: true });

  useEffect(() => {
    focusRef.current?.focus();
  }, [phase]);

  const copyUrl = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* fallback: link is tappable */ }
  }, [url]);

  const busy = phase === 'initializing' || phase === 'completing';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('wizard.claudeLogin.title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {phase === 'method-select' && t('loginFlow.phase.methodSelect')}
          {(phase === 'awaiting-auth' || phase === 'code-input') && t('loginFlow.phase.awaitingAuth')}
          {busy && t('loginFlow.phase.initializing')}
        </p>
      </div>

      {/* Method selection */}
      {phase === 'method-select' && (
        <div className="space-y-3">
          {METHODS.map((m, i) => (
            <button
              key={m.id}
              ref={i === 0 ? focusRef : undefined}
              type="button"
              onClick={() => selectMethod(m.id)}
              className="w-full text-left p-4 rounded-lg border border-gray-200 dark:border-[#455568]
                         hover:border-blue-500 dark:hover:border-blue-500
                         bg-white dark:bg-[#1c2129] transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {t(`loginFlow.method.${m.key}.label`)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t(`loginFlow.method.${m.key}.description`)}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* OAuth URL */}
      {(phase === 'awaiting-auth' || phase === 'code-input') && url && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium
                         bg-blue-500 hover:bg-blue-600 text-white transition-colors min-h-[44px]"
            >
              <ExternalLink className="w-4 h-4" />
              {t('loginFlow.url.open')}
            </a>
            <button
              type="button"
              onClick={copyUrl}
              aria-label={t('loginFlow.url.copy')}
              className="px-3 py-3 rounded-lg border border-gray-300 dark:border-[#455568]
                         hover:bg-gray-50 dark:hover:bg-[#263240] transition-colors min-h-[44px]"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            {t('loginFlow.url.hint')}
          </p>
        </div>
      )}

      {/* Code input */}
      {phase === 'code-input' && (
        <div className="space-y-3">
          <label htmlFor="wiz-auth-code" className="block text-sm font-medium text-gray-700 dark:text-gray-200 text-center">
            {t('loginFlow.code.label')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="wiz-auth-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCode(); }}
              placeholder={t('loginFlow.code.placeholder')}
              autoFocus
              className="flex-1 px-4 py-3 rounded-lg bg-white dark:bg-[#1c2129]
                         border border-gray-300 dark:border-[#455568] text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            />
            <button
              type="button"
              onClick={submitCode}
              disabled={!code.trim()}
              className="px-4 py-3 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600
                         disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors min-h-[44px]"
            >
              {t('loginFlow.code.submit')}
            </button>
          </div>
        </div>
      )}

      {/* Busy indicator */}
      {busy && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>{phase === 'completing' ? t('loginFlow.phase.completing') : t('loginFlow.phase.initializing')}</span>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400 break-words">
              {errorMsg || t('loginFlow.errorToast')}
            </p>
          </div>
          <button
            ref={focusRef}
            type="button"
            onClick={start}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium
                       bg-blue-500 hover:bg-blue-600 text-white transition-colors min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            {t('loginFlow.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
