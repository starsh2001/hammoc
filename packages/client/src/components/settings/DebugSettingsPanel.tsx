/**
 * DebugSettingsPanel - diagnostic toggles surfaced under the HAMMOC_DEBUG gate (Story BS-6).
 *
 * Rendered inside AdvancedSettingsSection ONLY when the server reports isDebugMode (i.e.
 * HAMMOC_DEBUG=1). Lets an operator flip every diagnostic option at runtime instead of
 * setting individual env vars and restarting the server.
 *
 * Two effect classes:
 *  - Session-start (CLI trace / PTY dump / tool trace): take effect on the NEXT CLI session,
 *    so each shows a "next session" badge.
 *  - Runtime (server/client log level, test endpoints): take effect immediately.
 *
 * Reads/writes preferences directly (same pattern as CliModeSettingsPanel — no props).
 */

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LogLevel } from '@hammoc/shared';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { getDebugLogLevel } from '../../utils/debugLogger';

type LogLevelName = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
const LOG_LEVEL_OPTIONS: LogLevelName[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];

// Session-start toggles — each carries a "next session" badge because the CLI engine only
// reads these at spawn time.
const SESSION_TOGGLES: {
  key: 'debugCliTrace' | 'debugPtyDump' | 'debugToolTrace';
  labelKey: string;
  descKey: string;
}[] = [
  { key: 'debugCliTrace', labelKey: 'advanced.debugCliTrace', descKey: 'advanced.debugCliTraceDesc' },
  { key: 'debugPtyDump', labelKey: 'advanced.debugPtyDump', descKey: 'advanced.debugPtyDumpDesc' },
  { key: 'debugToolTrace', labelKey: 'advanced.debugToolTrace', descKey: 'advanced.debugToolTraceDesc' },
];

function NextSessionBadge() {
  const { t } = useTranslation('settings');
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
      {t('advanced.nextSession')}
    </span>
  );
}

export function DebugSettingsPanel() {
  const { t } = useTranslation('settings');
  const { preferences, updatePreference } = usePreferencesStore();

  // Server log level: show the stored preference, defaulting to INFO when unset (the env-derived
  // level is not round-tripped to the client; the preference becomes authoritative once set).
  const serverLevel: LogLevelName = preferences.debugServerLogLevel ?? 'INFO';
  // Client log level: stored preference, or the live logger's active level (env/dev-derived).
  const clientLevel: LogLevelName =
    preferences.debugClientLogLevel ?? (LogLevel[getDebugLogLevel()] as LogLevelName);

  const selectClass =
    'w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568] ' +
    'bg-white dark:bg-[#263240] text-gray-900 dark:text-white text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-3">
      {/* Session-start toggles */}
      {SESSION_TOGGLES.map(({ key, labelKey, descKey }) => (
        <label key={key} className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences[key] ?? false}
            onChange={(e) => {
              updatePreference(key, e.target.checked);
              toast.success(t('toast.settingChanged', { label: t(labelKey) }));
            }}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-900 dark:text-white">
              {t(labelKey)} <NextSessionBadge />
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-300">{t(descKey)}</p>
          </div>
        </label>
      ))}

      {/* Server log level — immediate effect */}
      <div>
        <label htmlFor="debug-server-log-level" className="block text-sm text-gray-900 dark:text-white mb-1">
          {t('advanced.debugServerLogLevel')}
        </label>
        <select
          id="debug-server-log-level"
          value={serverLevel}
          onChange={(e) => {
            updatePreference('debugServerLogLevel', e.target.value as LogLevelName);
            toast.success(t('toast.settingChanged', { label: t('advanced.debugServerLogLevel') }));
          }}
          className={selectClass}
        >
          {LOG_LEVEL_OPTIONS.map((lvl) => (
            <option key={lvl} value={lvl}>{lvl}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('advanced.debugServerLogLevelDesc')}
        </p>
      </div>

      {/* Client log level — immediate effect */}
      <div>
        <label htmlFor="debug-client-log-level" className="block text-sm text-gray-900 dark:text-white mb-1">
          {t('advanced.debugClientLogLevel')}
        </label>
        <select
          id="debug-client-log-level"
          value={clientLevel}
          onChange={(e) => {
            updatePreference('debugClientLogLevel', e.target.value as LogLevelName);
            toast.success(t('toast.settingChanged', { label: t('advanced.debugClientLogLevel') }));
          }}
          className={selectClass}
        >
          {LOG_LEVEL_OPTIONS.map((lvl) => (
            <option key={lvl} value={lvl}>{lvl}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {t('advanced.debugClientLogLevelDesc')}
        </p>
      </div>

      {/* Test endpoints — immediate effect */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={preferences.debugTestEndpoints ?? false}
          onChange={(e) => {
            updatePreference('debugTestEndpoints', e.target.checked);
            toast.success(t('toast.settingChanged', { label: t('advanced.debugTestEndpoints') }));
          }}
          className="w-4 h-4 rounded border-gray-300 dark:border-[#455568] text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm text-gray-900 dark:text-white">{t('advanced.debugTestEndpoints')}</span>
          <p className="text-xs text-gray-500 dark:text-gray-300">{t('advanced.debugTestEndpointsDesc')}</p>
        </div>
      </label>
    </div>
  );
}
