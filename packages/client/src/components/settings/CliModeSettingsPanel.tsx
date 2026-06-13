/**
 * CliModeSettingsPanel - CLI engine mode sub-settings (Epic 33, Story 33.2)
 *
 * Renders the CLI-mode display preferences (thinking summaries / generation progress /
 * synthetic typing) plus a claude binary path override. Always rendered in global settings,
 * directly below the engine-mode toggle.
 *
 * These selections are persisted only; the CLI engine actually consumes them in Story 33.3
 * (no engine/pool/websocket wiring here — SDK and CLI runtime behaviour stay unchanged).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePreferencesStore } from '../../stores/preferencesStore';

// Checkbox sub-settings (key 1:1 with the i18n segment — mirrors showThinkingBlocks ↔ advanced.showThinkingBlocks).
const CLI_CHECKBOXES: {
  key: 'cliShowThinkingSummaries' | 'cliShowGenerationProgress' | 'cliSyntheticTyping' | 'cliPtyMirror';
  labelKey: string;
  descKey: string;
  defaultOn: boolean;
}[] = [
  { key: 'cliShowThinkingSummaries', labelKey: 'global.cliShowThinkingSummaries', descKey: 'global.cliShowThinkingSummariesDesc', defaultOn: true },
  { key: 'cliShowGenerationProgress', labelKey: 'global.cliShowGenerationProgress', descKey: 'global.cliShowGenerationProgressDesc', defaultOn: true },
  { key: 'cliPtyMirror', labelKey: 'global.cliPtyMirror', descKey: 'global.cliPtyMirrorDesc', defaultOn: true },
  // Keep cliSyntheticTyping LAST: its "card stagger" sub-field renders right after this list, so the
  // parent toggle must be the final row for the nested (left-rule) sub-field to read as ITS child —
  // otherwise the sub-field hangs under whatever toggle follows (it looked like it belonged to PTY mirror).
  { key: 'cliSyntheticTyping', labelKey: 'global.cliSyntheticTyping', descKey: 'global.cliSyntheticTypingDesc', defaultOn: false },
];

/**
 * Number preference field backed by a local draft string.
 *
 * Binding a number input straight to the stored value and committing only when the
 * in-progress keystroke already satisfies [min,max] makes the box un-editable: lowering
 * 200→80 must pass through "8" (< min) and clearing passes through "" (NaN), both of which
 * the old guard dropped — so the controlled value snapped straight back and typing looked
 * frozen. Here the user types freely while focused; we clamp + commit on blur/Enter and
 * revert a blank/NaN draft to the last stored value.
 */
function NumberPrefField({
  id,
  label,
  desc,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string;
  label: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Re-sync when the stored value changes elsewhere (server reconcile / external reset).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value)); // revert blank / NaN
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-900 dark:text-white mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                   bg-white dark:bg-[#263240] text-gray-900 dark:text-white text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{desc}</p>
    </div>
  );
}

export function CliModeSettingsPanel() {
  const { t } = useTranslation('settings');
  const { preferences, updatePreference } = usePreferencesStore();

  // Local state for the binary path with a debounced save (mirrors customSystemPrompt
  // in AdvancedSettingsSection — avoid a PATCH per keystroke).
  const [binaryPath, setBinaryPath] = useState(preferences.cliBinaryPath ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when preferences load/reconcile from the server.
  useEffect(() => {
    setBinaryPath(preferences.cliBinaryPath ?? '');
  }, [preferences.cliBinaryPath]);

  const handleBinaryPathChange = useCallback((value: string) => {
    setBinaryPath(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Empty string clears the override (undefined → null PATCH → auto-detect).
      updatePreference('cliBinaryPath', value || undefined);
      toast.success(t('toast.settingChanged', { label: t('global.cliBinaryPath') }));
    }, 1000);
  }, [updatePreference, t]);

  // Cleanup the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-900 dark:text-white mb-1">
        {t('global.cliSettingsTitle')}
      </legend>
      <p className="text-xs text-gray-500 dark:text-gray-300 mb-3">
        {t('global.cliSettingsDesc')}
      </p>

      <div className="space-y-3">
        {CLI_CHECKBOXES.map(({ key, labelKey, descKey, defaultOn }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences[key] ?? defaultOn}
              onChange={(e) => {
                updatePreference(key, e.target.checked);
                toast.success(t('toast.settingChanged', { label: t(labelKey) }));
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-white">{t(labelKey)}</span>
              <p className="text-xs text-gray-500 dark:text-gray-300">{t(descKey)}</p>
            </div>
          </label>
        ))}

        {/* Card reveal interval — a sub-option of "타이핑·카드 연출": a left rule under the parent
            toggle reads as nesting (the bare indent looked orphaned). Only shown while it is on. */}
        {(preferences.cliSyntheticTyping ?? false) && (
          <div className="ml-7 border-l-2 border-gray-200 dark:border-[#455568] pl-3">
            <NumberPrefField
              id="cli-card-stagger"
              label={t('global.cliCardStaggerMs')}
              desc={t('global.cliCardStaggerMsDesc')}
              value={preferences.cliCardStaggerMs ?? 500}
              min={0}
              max={5000}
              step={50}
              onCommit={(n) => updatePreference('cliCardStaggerMs', n)}
            />
          </div>
        )}

        {/* Mirror refresh interval — shown only while the mirror is ON (cliPtyMirror default ON).
            Lower = smoother, higher = calmer / less bandwidth. Same widget shape as cliCardStaggerMs. */}
        {(preferences.cliPtyMirror ?? true) && (
          <NumberPrefField
            id="cli-mirror-throttle"
            label={t('global.cliMirrorThrottleMs')}
            desc={t('global.cliMirrorThrottleMsDesc')}
            value={preferences.cliMirrorThrottleMs ?? 200}
            min={50}
            max={2000}
            step={50}
            onCommit={(n) => updatePreference('cliMirrorThrottleMs', n)}
          />
        )}

        {/* Resume confirm-menu auto-pick (large-session resume) — a 3-way select, not a toggle */}
        <div>
          <label htmlFor="cli-resume-choice" className="block text-sm text-gray-900 dark:text-white mb-1">
            {t('global.cliResumeChoice')}
          </label>
          <select
            id="cli-resume-choice"
            value={preferences.cliResumeChoice ?? 'ask'}
            onChange={(e) => {
              updatePreference('cliResumeChoice', e.target.value as 'ask' | 'summary' | 'full');
              toast.success(t('toast.settingChanged', { label: t('global.cliResumeChoice') }));
            }}
            className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#263240] text-gray-900 dark:text-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ask">{t('global.cliResumeChoiceAsk')}</option>
            <option value="summary">{t('global.cliResumeChoiceSummary')}</option>
            <option value="full">{t('global.cliResumeChoiceFull')}</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
            {t('global.cliResumeChoiceDesc')}
          </p>
        </div>

        {/* Binary path override — debounced text input */}
        <div>
          <label
            htmlFor="cli-binary-path"
            className="block text-sm text-gray-900 dark:text-white mb-1"
          >
            {t('global.cliBinaryPath')}
          </label>
          <input
            id="cli-binary-path"
            type="text"
            value={binaryPath}
            onChange={(e) => handleBinaryPathChange(e.target.value)}
            placeholder={t('global.cliBinaryPathPlaceholder')}
            className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                       bg-white dark:bg-[#263240] text-gray-900 dark:text-white font-mono text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
            {t('global.cliBinaryPathDesc')}
          </p>
        </div>
      </div>
    </fieldset>
  );
}
