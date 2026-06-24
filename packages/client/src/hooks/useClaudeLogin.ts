import { useCallback, useEffect, useState } from 'react';
import type { AccountInfo } from '@hammoc/shared';
import { getSocket } from '../services/socket';
import { setLoginInProgress } from '../services/loginState';

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
    // Subscription-only login: when the server detects claude's 3-option method menu, auto-pick
    // option 1 (Claude account with subscription) rather than surfacing a chooser. Console uses a
    // different OAuth domain our URL detector doesn't match, and third-party (Bedrock/Vertex) is a
    // multi-step interactive credential wizard — neither fits this flow. API-billing users have the
    // onboarding "API key" step instead. The brief method-select phase is skipped straight to
    // awaiting-auth so no dead chooser flickers on screen.
    const onMethodPrompt = () => {
      setPhase('awaiting-auth');
      socket.emit('auth:select-method', { method: 1 });
    };
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

  // Flag the login as in-flight for any active phase so app-resume recovery won't force a
  // socket reconnect (which would kill the server-side login PTY) when the user tab-switches
  // to the OAuth page and back. Cleared on settle (done/error) and on unmount.
  useEffect(() => {
    const active = phase !== 'idle' && phase !== 'done' && phase !== 'error';
    setLoginInProgress(active);
  }, [phase]);
  useEffect(() => () => setLoginInProgress(false), []);

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
