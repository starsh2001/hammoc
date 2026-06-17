import { useTranslation } from 'react-i18next';

interface EngineModePoint {
  label: string;
  value: string;
}

/**
 * Renders an engine-mode option's description as a one-line summary followed by a
 * bulleted, comparison-oriented detail list. Both the Global settings engine picker
 * and the per-project override reuse this so the two engines line up on the same
 * axes (response / features / environment / maturity), making them easy to compare.
 *
 * All copy is i18n-driven (settings:global.engineModeDesc.{sdk,cli}.{summary,points})
 * so it stays localized across every language. The Array.isArray guard keeps it safe
 * if a locale is missing the points array or a fallback returns a plain string.
 */
export function EngineModeDescription({
  descKey,
  id,
  className = '',
}: {
  descKey: string;
  id: string;
  className?: string;
}) {
  const { t } = useTranslation('settings');
  const summary = t(`${descKey}.summary`);
  const points = t(`${descKey}.points`, { returnObjects: true }) as unknown as EngineModePoint[];

  return (
    <div id={id} className={className}>
      <p className="text-xs text-gray-500 dark:text-gray-300 leading-snug">{summary}</p>
      {Array.isArray(points) && points.length > 0 && (
        <ul className="mt-2 space-y-1">
          {points.map((point, index) => (
            <li
              key={index}
              className="flex gap-1.5 text-xs leading-snug text-gray-500 dark:text-gray-300"
            >
              <span aria-hidden className="select-none text-gray-400 dark:text-gray-500">
                •
              </span>
              <span>
                <span className="font-medium text-gray-700 dark:text-gray-200">{point.label}</span>
                {' — '}
                {point.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
