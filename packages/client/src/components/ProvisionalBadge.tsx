/**
 * ProvisionalBadge — a small "provisional" chip marking a CLI screen-scrape card as PROVISIONAL: a live
 * estimate not yet replaced by the file-parsed authoritative copy. It sits BESIDE each card's title
 * (the tool name / "Claude" / the thinking header) so the per-card "이건 아직 확정 전" affordance reads
 * right where the eye already is — not floated at the card edge, not on a single status line.
 *
 * The card is ALSO dimmed (opacity, via the streaming wrapper) — this chip is the color-independent,
 * a11y-safe text affordance on top. Both disappear on the turn-end authoritative reload.
 */

import { useTranslation } from 'react-i18next';

export function ProvisionalBadge() {
  const { t } = useTranslation('chat');
  return (
    <span
      data-provisional-badge="true"
      className="shrink-0 select-none rounded-full bg-blue-500/90 px-1.5 py-px text-[10px] font-semibold uppercase leading-tight tracking-wide text-white"
      title={t('streamingMessage.provisionalAriaLabel')}
    >
      {t('streamingMessage.liveBadge')}
    </span>
  );
}
