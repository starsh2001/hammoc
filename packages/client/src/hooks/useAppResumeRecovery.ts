/**
 * useAppResumeRecovery - Recovers app state when browser resumes from background
 *
 * On mobile, browsers suspend JS execution when backgrounded for a long time.
 * When the user returns, the socket connection is dead and auth may be stale.
 * This hook detects the resume via multiple browser events and:
 * 1. Force-reconnects the socket (disconnect + connect to reset backoff)
 * 2. Detects stale half-open connections (connected but actually dead)
 * 3. Re-validates auth if enough time has passed
 * 4. Delayed message fetch as safety net for JSONL flush timing
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getSocket, forceReconnect } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';
import { debugLog } from '../utils/debugLogger';
import i18n from '../i18n';

/** Re-check auth if page was hidden for more than 5 minutes */
const AUTH_RECHECK_THRESHOLD_MS = 5 * 60 * 1000;

/** Force reconnect if page was hidden for more than 3 seconds (may be half-open) */
const FORCE_RECONNECT_THRESHOLD_MS = 3 * 1000;

/** Delay before retry fetch after resume (gives JSONL time to flush) */
const RESUME_FETCH_DELAY_MS = 5 * 1000;

export function useAppResumeRecovery(): void {
  const hiddenAtRef = useRef<number | null>(null);
  const resumeFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /**
     * Schedule a delayed fetchMessages as a safety net.
     * The stream:status handler's immediate fetch may get stale data if JSONL
     * hasn't flushed yet. This delayed retry covers that gap.
     *
     * Always runs when not streaming — we can't reliably detect whether the
     * immediate fetch succeeded because completeStreaming() can increase
     * message count even when JSONL data is still stale.
     */
    const scheduleResumeFetch = () => {
      // Cancel any existing timer
      if (resumeFetchTimerRef.current) {
        clearTimeout(resumeFetchTimerRef.current);
      }

      resumeFetchTimerRef.current = setTimeout(() => {
        resumeFetchTimerRef.current = null;

        // Skip if streaming — stream:status handler manages this
        if (useChatStore.getState().isStreaming) {
          debugLog.reconnect('resumeFetch: skipped (streaming)');
          return;
        }

        const msgState = useMessageStore.getState();
        const { currentProjectSlug, currentSessionId } = msgState;
        if (currentProjectSlug && currentSessionId) {
          debugLog.reconnect('resumeFetch: syncing messages', {
            projectSlug: currentProjectSlug,
            sessionId: currentSessionId,
          });
          toast.loading(i18n.t('notification:streaming.syncing'), { id: 'resume-sync' });
          msgState.fetchMessages(currentProjectSlug, currentSessionId, { silent: true })
            .then(() => {
              toast.success(i18n.t('notification:streaming.syncComplete'), { id: 'resume-sync', duration: 1500 });
            })
            .catch(() => {
              toast.error(i18n.t('notification:streaming.syncFailed'), { id: 'resume-sync', duration: 3000 });
            });
        }
      }, RESUME_FETCH_DELAY_MS);
    };

    /**
     * Core recovery logic — called from visibilitychange, pageshow, and online events.
     * Idempotent: forceReconnect() is safe to call multiple times in quick succession.
     */
    const performRecovery = (source: string) => {
      const hiddenAt = hiddenAtRef.current;
      const hiddenDuration = hiddenAt ? Date.now() - hiddenAt : 0;
      const socket = getSocket();

      if (!socket.connected) {
        // Socket is disconnected — force clean reconnect to reset backoff timer
        debugLog.reconnect(`${source}: socket disconnected → forceReconnect`, {
          hiddenDuration,
        });
        forceReconnect();
        scheduleResumeFetch();
      } else if (hiddenDuration > FORCE_RECONNECT_THRESHOLD_MS) {
        // Socket claims connected but was hidden for a while — could be half-open.
        // Force reconnect; server's ActiveStream buffer will replay any missed events.
        debugLog.reconnect(`${source}: stale connection → forceReconnect`, {
          hiddenDuration,
        });
        forceReconnect();
        scheduleResumeFetch();
      }

      // Re-validate auth if hidden long enough
      if (hiddenAt && hiddenDuration > AUTH_RECHECK_THRESHOLD_MS) {
        useAuthStore.getState().recheckAuth();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Page became visible again
      performRecovery('visibilitychange');
      hiddenAtRef.current = null;
    };

    // pageshow fires when page is restored from BFCache (back-forward cache).
    // Safari commonly uses BFCache, where visibilitychange may not fire.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        performRecovery('pageshow');
      }
    };

    // online fires when the browser detects network connectivity restored.
    // Covers Wi-Fi reconnect, mobile data switch, airplane mode off, etc.
    const handleOnline = () => {
      performRecovery('online');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      if (resumeFetchTimerRef.current) {
        clearTimeout(resumeFetchTimerRef.current);
        resumeFetchTimerRef.current = null;
      }
    };
  }, []);
}
