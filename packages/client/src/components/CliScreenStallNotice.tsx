/**
 * CliScreenStallNotice — soft CLI "screen looks frozen" affordance.
 *
 * The server runs a screen-frame watchdog (cliScreenStallMs): during an active CLI turn the
 * reconstructed claude screen changes ~1×/second while healthy (spinner glyph + ticking clock), so a
 * long flat-line of NO change is a reliable "claude froze" signal — far more reliable than the removed
 * inactivity timeout, which watched JSONL activity that legitimately pauses during thinking. When the
 * watchdog fires it emits `cli:screen-stall {stalled:true}` (cleared on the next change / turn end),
 * which useStreaming stores as `cliScreenStalled`.
 *
 * This is ADVISORY only — the server never auto-aborts. We surface a small banner with a Stop button
 * so the user decides. Self-gating: renders nothing unless a turn is streaming AND currently stalled.
 */
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../stores/chatStore';

export function CliScreenStallNotice() {
  const { t } = useTranslation('chat');
  const stalled = useChatStore((s) => s.cliScreenStalled);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const abortResponse = useChatStore((s) => s.abortResponse);

  if (!stalled || !isStreaming) return null;

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-2 max-w-[80%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        <span>{t('streaming.screenStalled')}</span>
        <button
          type="button"
          onClick={() => abortResponse()}
          className="shrink-0 rounded-md border border-amber-400 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-500/50 dark:text-amber-200 dark:hover:bg-amber-500/20"
        >
          {t('streaming.screenStallStop')}
        </button>
      </div>
    </div>
  );
}
