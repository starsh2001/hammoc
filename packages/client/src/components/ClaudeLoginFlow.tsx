/**
 * ClaudeLoginFlow (Story BS-7)
 *
 * Shared in-app Claude Code `/login` flow. Drives the server's disposable login PTY over
 * WebSocket (`auth:*` events) and renders each phase: method selection → OAuth URL →
 * code input → completing → done. Used both in Onboarding (as a checklist item) and in
 * Settings › Account (inline, logged-out state). Parent integration is via the
 * `onComplete` / `onError` callback props.
 *
 * The OAuth URL is rendered as a tappable link (mobile-accessible — the server suppresses
 * the CLI's own browser auto-open with BROWSER=none, so the URL must be opened here).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, RefreshCw, LogIn, AlertCircle } from 'lucide-react';
import type { AccountInfo } from '@hammoc/shared';
import { getSocket } from '../services/socket';

type LoginMethod = 1 | 2 | 3;

type Phase =
  | 'idle'
  | 'initializing'
  | 'method-select'
  | 'awaiting-auth'
  | 'code-input'
  | 'completing'
  | 'done'
  | 'error';

interface Props {
  /** Called when login completes; receives the freshly fetched account (or null on fetch failure). */
  onComplete?: (account: AccountInfo | null) => void;
  /** Called when login fails or times out. */
  onError?: (message: string) => void;
  /** Start the flow automatically on mount instead of showing the "Sign in" button first. */
  autoStart?: boolean;
  className?: string;
}

const METHODS: Array<{ id: LoginMethod; key: string }> = [
  { id: 1, key: 'subscription' },
  { id: 2, key: 'console' },
  { id: 3, key: 'thirdParty' },
];

export function ClaudeLoginFlow({ onComplete, onError, autoStart, className }: Props) {
  const { t } = useTranslation('auth');
  const [phase, setPhase] = useState<Phase>(autoStart ? 'initializing' : 'idle');
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const start = useCallback(() => {
    setUrl(null);
    setCode('');
    setErrorMsg(null);
    setPhase('initializing');
    getSocket().emit('auth:start');
  }, []);

  // Wire the server → client login events for the duration of the flow.
  useEffect(() => {
    const socket = getSocket();
    const onMethodPrompt = () => setPhase('method-select');
    const onUrl = (data: { url: string }) => {
      setUrl(data.url);
      setPhase('awaiting-auth');
    };
    const onCodePrompt = () => setPhase('code-input');
    const onAuthComplete = (data: { account: AccountInfo | null }) => {
      setPhase('done');
      toast.success(t('loginFlow.completeToast'));
      onComplete?.(data.account);
    };
    const onAuthError = (data: { message: string }) => {
      setErrorMsg(data.message);
      setPhase('error');
      toast.error(t('loginFlow.errorToast'));
      onError?.(data.message);
    };

    socket.on('auth:method-prompt', onMethodPrompt);
    socket.on('auth:url', onUrl);
    socket.on('auth:code-prompt', onCodePrompt);
    socket.on('auth:complete', onAuthComplete);
    socket.on('auth:error', onAuthError);
    return () => {
      socket.off('auth:method-prompt', onMethodPrompt);
      socket.off('auth:url', onUrl);
      socket.off('auth:code-prompt', onCodePrompt);
      socket.off('auth:complete', onAuthComplete);
      socket.off('auth:error', onAuthError);
    };
  }, [t, onComplete, onError]);

  // autoStart: kick off once on mount.
  useEffect(() => {
    if (autoStart) getSocket().emit('auth:start');
  }, [autoStart]);

  const selectMethod = useCallback((method: LoginMethod) => {
    setPhase('awaiting-auth');
    getSocket().emit('auth:select-method', { method });
  }, []);

  const submitCode = useCallback(() => {
    const clean = code.trim();
    if (!clean) return;
    setPhase('completing');
    getSocket().emit('auth:submit-code', { code: clean });
  }, [code]);

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
      {/* Idle: entry button */}
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

      {/* Progress indicator (AC14) */}
      {phase !== 'idle' && phase !== 'error' && (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>{phaseLabel()}</span>
        </div>
      )}

      {/* Method selection (AC11) */}
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

      {/* OAuth URL (AC12) */}
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

      {/* Code input (AC13) */}
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

      {/* Error / timeout with retry (AC15) */}
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
