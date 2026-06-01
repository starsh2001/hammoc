/**
 * Story 31.2 (Task C.2): built-in dynamic-variable toggle list.
 *
 * Renders the 5 built-in variables (CONTEXT_BUILDER_VARIABLES — single source of
 * truth) as on/off rows. `recentCommits` carries a numeric count input. Each row
 * shows a pill-styled label + description, visually consistent with the Epic 29
 * snippet-substitution UX.
 */

import { useTranslation } from 'react-i18next';
import {
  CONTEXT_BUILDER_VARIABLES,
} from '../../../../stores/contextBuilderStore';
import type { ContextBuilderVariableId } from '@hammoc/shared';

interface VariableToggleListProps {
  variables: Record<ContextBuilderVariableId, boolean>;
  recentCommitsCount: number;
  onToggle: (id: ContextBuilderVariableId, on: boolean) => void;
  onCountChange: (n: number) => void;
  disabled?: boolean;
}

export function VariableToggleList({
  variables,
  recentCommitsCount,
  onToggle,
  onCountChange,
  disabled,
}: VariableToggleListProps) {
  const { t } = useTranslation('settings');

  return (
    <section data-testid="context-builder-variables">
      <h4 className="mb-2 text-sm font-semibold text-gray-100">
        {t('harness.contextBuilder.variables.title')}
      </h4>
      <p className="mb-2 text-xs text-gray-500">{t('harness.contextBuilder.variables.help')}</p>

      <ul className="space-y-1">
        {CONTEXT_BUILDER_VARIABLES.map(({ id, hasCount }) => {
          const on = variables[id] ?? false;
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded border border-gray-700 bg-gray-800/40 px-3 py-2"
              data-testid={`context-builder-variable-${id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-700 px-1.5 py-0.5 font-mono text-xs text-blue-200">
                    {t(`harness.contextBuilder.variable.${id}.label`)}
                  </span>
                  {hasCount && on && (
                    <label className="flex items-center gap-1 text-xs text-gray-400">
                      N=
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={recentCommitsCount}
                        onChange={(e) => onCountChange(Number(e.target.value))}
                        disabled={disabled}
                        className="w-14 rounded border border-gray-600 bg-gray-900 px-1 py-0.5 text-xs text-gray-100"
                        data-testid="context-builder-variable-recentCommits-count"
                      />
                    </label>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t(`harness.contextBuilder.variable.${id}.description`)}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t(`harness.contextBuilder.variable.${id}.label`)}
                onClick={() => onToggle(id, !on)}
                disabled={disabled}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  on ? 'bg-blue-600' : 'bg-gray-600'
                }`}
                data-testid={`context-builder-variable-toggle-${id}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    on ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
