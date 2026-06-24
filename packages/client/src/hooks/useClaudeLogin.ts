import { useCallback, useEffect, useState } from 'react';
import type { AccountInfo } from '@hammoc/shared';
import { getSocket } from '../services/socket';

export type LoginMethod = 1 | 2 | 3;

export type LoginPhase =
  | 'idle'
  | 'initializing'
  | 'method-select'
  | 'awaiting-auth'
  | 'code-input'
  | 'completing'
  | 'done'
  | 'error';

export interface UseClaudeLoginOptions {
  onComplete?: (account: AccountInfo | null) => void;
  onError?: (message: string) => void;
  autoStart?: boolean;
}

export interface UseClaudeLoginReturn {
  phase: LoginPhase;
  url: string | null;
  code: string;
  errorMsg: string | null;
  setCode: (code: string) => void;
  start: () => void;
  selectMethod: (method: LoginMethod) => void;
  submitCode: () => void;
}

export function useClaudeLogin({
  onComplete,
  onError,
  autoStart,
}: UseClaudeLoginOptions = {}): UseClaudeLoginReturn {
  const [phase, setPhase] = useState<LoginPhase>(autoStart ? 'initializing' : 'idle');
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const start = useCallback(() => {
    setUrl(null);
    setCode('');
    setErrorMsg(null);
    setPhase('initializing');
    getSocket().emit('auth:start');
  }, []);

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
      onComplete?.(data.account);
    };
    const onAuthError = (data: { message: string }) => {
      setErrorMsg(data.message);
      setPhase('error');
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
  }, [onComplete, onError]);

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

  return { phase, url, code, errorMsg, setCode, start, selectMethod, submitCode };
}
