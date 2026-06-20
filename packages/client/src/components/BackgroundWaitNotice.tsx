import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { usePreferencesStore } from '../stores/preferencesStore';

const DEFAULT_STOP_DELAY_MS = 60_000;

export function BackgroundWaitNotice() {
  const { t } = useTranslation('chat');
  const waiting = useChatStore((s) => s.backgroundWaiting);
  const since = useChatStore((s) => s.backgroundWaitingSince);
  const pendingCount = useChatStore((s) => s.backgroundPendingCount);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const abortResponse = useChatStore((s) => s.abortResponse);
  const stopDelayMs = usePreferencesStore((s) => s.preferences.backgroundStopDelayMs) ?? DEFAULT_STOP_DELAY_MS;

  const [elapsed, setElapsed] = useState(0);
  const [showStop, setShowStop] = useState(stopDelayMs === 0);

  useEffect(() => {
    if (!waiting || !since) {
      setElapsed(0);
      setShowStop(stopDelayMs === 0);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const elapsed = now - since;
      setElapsed(Math.floor(elapsed / 1000));
      if (stopDelayMs === 0 || elapsed >= stopDelayMs) {
        setShowStop(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [waiting, since, stopDelayMs]);

  if (!waiting || !isStreaming) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-2 max-w-[80%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        <span>{t('streaming.backgroundWaiting', { time: timeStr, count: pendingCount })}</span>
        {showStop && (
          <button
            type="button"
            onClick={() => abortResponse()}
            className="shrink-0 rounded-md border border-amber-400 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-500/50 dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            {t('streaming.backgroundStop')}
          </button>
        )}
      </div>
    </div>
  );
}
