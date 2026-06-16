/**
 * ProjectSettingsSection - Project-level settings with overrides
 * Story 10.3: Model override, Permission Mode override, Hidden toggle, Reset to global
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { projectsApi } from '../../services/api/projects';
import { getSocket } from '../../services/socket';
import { SettingsSyncNotice } from './SettingsSyncNotice';
import { EngineModeBadge } from './EngineModeBadge';
import { MODEL_GROUPS } from '../ModelSelector';
import type {
  EngineMode,
  PermissionMode,
  ProjectSettingsApiResponse,
  UpdateProjectSettingsRequest,
} from '@hammoc/shared';

const PERMISSION_OPTIONS: { value: PermissionMode; labelKey: string; descKey: string }[] = [
  { value: 'plan', labelKey: 'global.permissionModeLabel.plan', descKey: 'global.permissionDesc.plan' },
  { value: 'default', labelKey: 'global.permissionModeLabel.default', descKey: 'global.permissionDesc.default' },
  { value: 'acceptEdits', labelKey: 'global.permissionModeLabel.acceptEdits', descKey: 'global.permissionDesc.acceptEdits' },
];

const ENGINE_OPTIONS: { value: EngineMode; labelKey: string; descKey: string; badgeTone: 'recommended' | 'beta' }[] = [
  { value: 'sdk', labelKey: 'global.engineModeOption.sdk', descKey: 'global.engineModeDesc.sdk', badgeTone: 'recommended' },
  { value: 'cli', labelKey: 'global.engineModeOption.cli', descKey: 'global.engineModeDesc.cli', badgeTone: 'beta' },
];

/** Sentinel value for "use global default" option */
const GLOBAL_SENTINEL = '__global__';

/** Find display label for a model value */
function getModelDisplayLabel(value: string): string {
  if (!value) return 'Default';
  for (const group of MODEL_GROUPS) {
    const found = group.models.find((m) => m.value === value);
    if (found) return found.label;
  }
  return value;
}

/** Find display label for a permission mode */
function getPermissionLabel(mode: PermissionMode, t: (key: string) => string): string {
  const found = PERMISSION_OPTIONS.find((o) => o.value === mode);
  return found ? t(found.labelKey) : mode;
}

/** Find display label for an engine mode */
function getEngineLabel(mode: EngineMode, t: (key: string) => string): string {
  const found = ENGINE_OPTIONS.find((o) => o.value === mode);
  return found ? t(found.labelKey) : mode;
}

interface ProjectSettingsSectionProps {
  projectSlug: string;
}

export function ProjectSettingsSection({ projectSlug }: ProjectSettingsSectionProps) {
  const { t } = useTranslation('settings');
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const globalPrefs = usePreferencesStore((s) => s.preferences);

  const [settings, setSettings] = useState<ProjectSettingsApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  // Fetch settings when project changes
  useEffect(() => {
    if (!projectSlug) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    projectsApi.getSettings(projectSlug)
      .then((data) => {
        if (!cancelled) {
          setSettings(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('project.loadError'));
          setSettings(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [projectSlug, fetchKey, t]);

  // Multi-device sync: apply settings changes made on another browser. The server
  // broadcasts to every browser except the origin; we apply only the payload that
  // matches the project currently shown here. All controls here are radio/select/
  // toggle (no text input), so a live replace can't clobber in-progress typing.
  useEffect(() => {
    if (!projectSlug) return;
    const socket = getSocket();
    const handler = (data: { projectSlug: string; settings: ProjectSettingsApiResponse }) => {
      if (data.projectSlug === projectSlug) {
        setSettings(data.settings);
      }
    };
    socket.on('project:settings-changed', handler);
    return () => {
      socket.off('project:settings-changed', handler);
    };
  }, [projectSlug]);

  const handleUpdateSetting = useCallback(async (update: UpdateProjectSettingsRequest, toastMessage?: string) => {
    if (!projectSlug) return;
    try {
      setUpdating(true);
      const updated = await projectsApi.updateSettings(projectSlug, update);
      setSettings(updated);
      toast.success(toastMessage ?? t('toast.settingSaved'));

      // Sync sidebar if hidden changed
      if (update.hidden !== undefined) {
        fetchProjects();
      }
    } catch {
      toast.error(t('toast.settingSavedFailed'));
    } finally {
      setUpdating(false);
    }
  }, [projectSlug, fetchProjects, t]);

  const handleModelChange = useCallback((value: string) => {
    handleUpdateSetting({
      modelOverride: value === GLOBAL_SENTINEL ? null : value,
    });
  }, [handleUpdateSetting]);

  const handlePermissionChange = useCallback((value: string) => {
    handleUpdateSetting({
      permissionModeOverride: value === GLOBAL_SENTINEL ? null : value as PermissionMode,
    });
  }, [handleUpdateSetting]);

  const handleEngineModeChange = useCallback((value: string) => {
    handleUpdateSetting({
      engineModeOverride: value === GLOBAL_SENTINEL ? null : value as EngineMode,
    });
  }, [handleUpdateSetting]);

  const handleHiddenChange = useCallback(() => {
    if (!settings) return;
    handleUpdateSetting({ hidden: !settings.hidden });
  }, [settings, handleUpdateSetting]);

  const handleResetAll = useCallback(() => {
    const confirmed = window.confirm(t('confirm.resetAllSettings'));
    if (!confirmed) return;

    handleUpdateSetting({
      modelOverride: null,
      permissionModeOverride: null,
      engineModeOverride: null,
      hidden: false,
    }, t('toast.resetToGlobal'));
  }, [handleUpdateSetting, t]);

  const overrides = settings?._overrides ?? [];
  const hasOverrides = overrides.length > 0 || settings?.hidden === true;
  const globalModel = globalPrefs.defaultModel ?? '';
  const globalPermission = globalPrefs.permissionMode ?? 'default';
  const globalEngine = globalPrefs.engineMode ?? 'sdk';

  // Current model value for select
  const modelSelectValue = settings?.modelOverride !== undefined
    ? (settings.modelOverride ?? '')
    : GLOBAL_SENTINEL;

  // Current permission value for radio
  const permissionValue = settings?.permissionModeOverride !== undefined
    ? settings.permissionModeOverride
    : GLOBAL_SENTINEL;

  // Current engine value for radio
  const engineValue = settings?.engineModeOverride !== undefined
    ? settings.engineModeOverride
    : GLOBAL_SENTINEL;

  return (
    <div className="space-y-8">
      <SettingsSyncNotice />

      {/* Loading State */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t('project.loading')}</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {error}
          <button
            type="button"
            onClick={() => setFetchKey((k) => k + 1)}
            className="ml-2 underline hover:no-underline"
          >
            {t('project.retry')}
          </button>
        </div>
      )}

      {/* Settings Form */}
      {settings && !loading && !error && (
        <>
          {/* Model Override */}
          <div>
            <label
              htmlFor="project-model"
              className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
            >
              {t('project.modelOverride')}
              {overrides.includes('modelOverride') && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">
                  {t('project.projectOverride')}
                </span>
              )}
            </label>
            <select
              id="project-model"
              value={modelSelectValue}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={updating}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-[#455568]
                         bg-white dark:bg-[#263240] text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value={GLOBAL_SENTINEL}>
                {t('project.useGlobalDefault', { value: getModelDisplayLabel(globalModel) })}
              </option>
              {MODEL_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.labelKey ? t(group.labelKey) : group.label}>
                  {group.models.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}{model.description ? ` \u2014 ${model.description}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Permission Mode Override */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              {t('project.permissionOverride')}
              {overrides.includes('permissionModeOverride') && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">
                  {t('project.projectOverride')}
                </span>
              )}
            </legend>
            <div className="space-y-2">
              {/* Global default option */}
              <label
                className={`
                  relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${permissionValue === GLOBAL_SENTINEL
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240]'
                  }
                `}
              >
                <input
                  type="radio"
                  name="projectPermissionMode"
                  value={GLOBAL_SENTINEL}
                  checked={permissionValue === GLOBAL_SENTINEL}
                  onChange={() => handlePermissionChange(GLOBAL_SENTINEL)}
                  disabled={updating}
                  className="sr-only"
                />
                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  permissionValue === GLOBAL_SENTINEL
                    ? 'border-blue-500'
                    : 'border-gray-400 dark:border-gray-500'
                } ${updating ? 'opacity-50' : ''}`}>
                  {permissionValue === GLOBAL_SENTINEL && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <div>
                  <span className={`text-sm font-medium ${permissionValue === GLOBAL_SENTINEL ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                    {t('project.useGlobalDefault', { value: getPermissionLabel(globalPermission as PermissionMode, t) })}
                  </span>
                </div>
              </label>

              {/* Permission options */}
              {PERMISSION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`
                    relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${permissionValue === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240]'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="projectPermissionMode"
                    value={opt.value}
                    checked={permissionValue === opt.value}
                    onChange={() => handlePermissionChange(opt.value)}
                    disabled={updating}
                    className="sr-only"
                    aria-describedby={`project-perm-desc-${opt.value}`}
                  />
                  <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    permissionValue === opt.value
                      ? 'border-blue-500'
                      : 'border-gray-400 dark:border-gray-500'
                  } ${updating ? 'opacity-50' : ''}`}>
                    {permissionValue === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div>
                    <span className={`text-sm font-medium ${permissionValue === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                      {t(opt.labelKey)}
                    </span>
                    <p
                      id={`project-perm-desc-${opt.value}`}
                      className="text-xs text-gray-500 dark:text-gray-300 mt-0.5"
                    >
                      {t(opt.descKey)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Engine Mode Override (Epic 33 — per-project engine choice) */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              {t('project.engineModeOverride')}
              {overrides.includes('engineModeOverride') && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">
                  {t('project.projectOverride')}
                </span>
              )}
            </legend>
            <div className="space-y-2">
              {/* Global default option */}
              <label
                className={`
                  relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${engineValue === GLOBAL_SENTINEL
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240]'
                  }
                `}
              >
                <input
                  type="radio"
                  name="projectEngineMode"
                  value={GLOBAL_SENTINEL}
                  checked={engineValue === GLOBAL_SENTINEL}
                  onChange={() => handleEngineModeChange(GLOBAL_SENTINEL)}
                  disabled={updating}
                  className="sr-only"
                />
                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  engineValue === GLOBAL_SENTINEL
                    ? 'border-blue-500'
                    : 'border-gray-400 dark:border-gray-500'
                } ${updating ? 'opacity-50' : ''}`}>
                  {engineValue === GLOBAL_SENTINEL && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <div>
                  <span className={`text-sm font-medium ${engineValue === GLOBAL_SENTINEL ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                    {t('project.useGlobalDefault', { value: getEngineLabel(globalEngine, t) })}
                  </span>
                </div>
              </label>

              {/* Engine options */}
              {ENGINE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`
                    relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${engineValue === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-[#455568] hover:bg-gray-50 dark:hover:bg-[#263240]'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="projectEngineMode"
                    value={opt.value}
                    checked={engineValue === opt.value}
                    onChange={() => handleEngineModeChange(opt.value)}
                    disabled={updating}
                    className="sr-only"
                    aria-describedby={`project-engine-desc-${opt.value}`}
                  />
                  <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    engineValue === opt.value
                      ? 'border-blue-500'
                      : 'border-gray-400 dark:border-gray-500'
                  } ${updating ? 'opacity-50' : ''}`}>
                    {engineValue === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm font-medium ${engineValue === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                        {t(opt.labelKey)}
                      </span>
                      <EngineModeBadge tone={opt.badgeTone} />
                    </span>
                    <p
                      id={`project-engine-desc-${opt.value}`}
                      className="text-xs text-gray-500 dark:text-gray-300 mt-0.5"
                    >
                      {t(opt.descKey)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Hidden Toggle */}
          <div>
            <label
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={settings.hidden ?? false}
                onChange={handleHiddenChange}
                disabled={updating}
                className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                           text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900 dark:text-white">
                {t('project.hideInSidebar')}
              </span>
            </label>
          </div>

          {/* Reset to Global Defaults */}
          <div className="pt-4 border-t border-gray-300 dark:border-[#3a4d5e]">
            <button
              type="button"
              onClick={handleResetAll}
              disabled={!hasOverrides || updating}
              aria-disabled={!hasOverrides || updating}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                         text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700
                         hover:bg-red-50 dark:hover:bg-red-900/20
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('project.resetToGlobal')}
            </button>
            {!hasOverrides && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
                {t('project.noOverrides')}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
