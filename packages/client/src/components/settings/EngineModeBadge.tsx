import { useTranslation } from 'react-i18next';

export type EngineModeBadgeTone = 'recommended' | 'beta';

const TONE_CLASSES: Record<EngineModeBadgeTone, string> = {
  recommended: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  beta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

/**
 * Small inline badge rendered next to an engine-mode option title.
 * SDK → "recommended" (emerald), CLI → "beta" (amber). Label is i18n-driven
 * (settings:global.engineModeBadge.*) so it stays localized across all languages.
 */
export function EngineModeBadge({ tone }: { tone: EngineModeBadgeTone }) {
  const { t } = useTranslation('settings');
  const labelKey =
    tone === 'recommended'
      ? 'global.engineModeBadge.recommended'
      : 'global.engineModeBadge.beta';
  return (
    <span
      data-testid={`engine-badge-${tone}`}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {t(labelKey)}
    </span>
  );
}
