/**
 * useAppResumeRecovery - Recovers app state when browser resumes from background
 *
 * On mobile, browsers suspend JS execution when backgrounded for a long time.
 * When the user returns, the socket connection is dead and auth may be stale.
 * This hook detects the resume via visibilitychange and:
 * 1. Reconnects the socket if disconnected
 * 2. Re-validates auth if enough time has passed
 */

import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';

/** Re-check auth if page was hidden for more than 5 minutes */
const AUTH_RECHECK_THRESHOLD_MS = 5 * 60 * 1000;

export function useAppResumeRecovery(): void {
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Page became visible again
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      // 1. Reconnect socket if disconnected
      const socket = getSocket();
      if (!socket.connected) {
        socket.connect();
      }

      // 2. Re-validate auth if hidden long enough
      if (hiddenAt && Date.now() - hiddenAt > AUTH_RECHECK_THRESHOLD_MS) {
        useAuthStore.getState().recheckAuth();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
