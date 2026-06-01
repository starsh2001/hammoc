/**
 * Story 31.2 (Task C.3 / AC5): user-defined shell command block.
 *
 * Adding a command is gated behind a strong security warning + an explicit
 * acknowledgement checkbox; the Add button stays disabled until the command is
 * non-empty AND the checkbox is checked (AC5.a). Existing commands show their
 * acknowledged state (un-acknowledged ones are excluded from the generated
 * script per AC5.b) and a secret-warning badge when the server flagged them
 * (AC5.c — non-blocking notice).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ShieldAlert, KeyRound } from 'lucide-react';

interface CustomCommandBlockProps {
  commands: Array<{ command: string; acknowledged: boolean }>;
  /** Indices the server's secret heuristic flagged (AC5.c). */
  secretWarningIndices: number[];
  onAdd: (command: string, acknowledged: boolean) => void;
  onUpdate: (index: number, patch: Partial<{ command: string; acknowledged: boolean }>) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

export function CustomCommandBlock({
  commands,
  secretWarningIndices,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: CustomCommandBlockProps) {
  const { t } = useTranslation('settings');
  const [draft, setDraft] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const canAdd = draft.trim().length > 0 && acknowledged && !disabled;

  const submit = () => {
    if (!canAdd) return;
    onAdd(draft, true);
    setDraft('');
    setAcknowledged(false);
  };

  return (
    <section data-testid="context-builder-custom-commands">
      <h4 className="mb-2 text-sm font-semibold text-gray-100">
        {t('harness.contextBuilder.commands.title')}
      </h4>

      {commands.length > 0 && (
        <ul className="mb-3 space-y-1" data-testid="context-builder-command-items">
          {commands.map((cc, idx) => {
            const flagged = secretWarningIndices.includes(idx);
            return (
              <li
                key={`${cc.command}-${idx}`}
                className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800/40 px-2 py-1.5"
                data-testid={`context-builder-command-item-${idx}`}
              >
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-gray-200" title={cc.command}>
                  {cc.command}
                </code>
                {flagged && (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300"
                    title={t('harness.contextBuilder.commands.secretWarning')}
                    data-testid={`context-builder-command-secret-${idx}`}
                  >
                    <KeyRound size={11} /> {t('harness.contextBuilder.commands.secretBadge')}
                  </span>
                )}
                {!cc.acknowledged && (
                  <button
                    type="button"
                    className="shrink-0 rounded border border-amber-600 px-1.5 py-0.5 text-xs text-amber-300 hover:bg-amber-900/30"
                    onClick={() => onUpdate(idx, { acknowledged: true })}
                    disabled={disabled}
                    data-testid={`context-builder-command-ack-${idx}`}
                  >
                    {t('harness.contextBuilder.commands.acknowledgeExisting')}
                  </button>
                )}
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-50"
                  onClick={() => onRemove(idx)}
                  disabled={disabled}
                  aria-label={t('harness.contextBuilder.commands.remove')}
                  data-testid={`context-builder-command-remove-${idx}`}
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add form — gated behind the acknowledgement checkbox (AC5.a). */}
      <div className="rounded border border-amber-800/60 bg-amber-950/20 p-3">
        <div className="mb-2 flex items-start gap-2 text-xs text-amber-300">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>{t('harness.contextBuilder.commands.warning')}</span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder={t('harness.contextBuilder.commands.placeholder')}
          className="mb-2 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 font-mono text-xs text-gray-100 placeholder:text-gray-600"
          data-testid="context-builder-command-input"
        />
        <label className="mb-2 flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={disabled}
            data-testid="context-builder-command-acknowledge"
          />
          {t('harness.contextBuilder.commands.acknowledge')}
        </label>
        <button
          type="button"
          className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40"
          onClick={submit}
          disabled={!canAdd}
          data-testid="context-builder-command-add"
        >
          <Plus size={13} /> {t('harness.contextBuilder.commands.add')}
        </button>
      </div>
    </section>
  );
}
