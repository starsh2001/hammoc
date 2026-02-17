/**
 * ProjectSettingsSection - Project-level settings with overrides
 * Story 10.3: Model override, Permission Mode override, Hidden toggle, Reset to global
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useSessionStore } from '../../stores/sessionStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { projectsApi } from '../../services/api/projects';
import { MODEL_GROUPS } from '../ModelSelector';
import type {
  PermissionMode,
  ProjectSettingsApiResponse,
  UpdateProjectSettingsRequest,
} from '@bmad-studio/shared';

const PERMISSION_OPTIONS: { value: PermissionMode; label: string; description: string }[] = [
  { value: 'plan', label: 'Plan', description: '코드 변경 전 계획을 먼저 제안합니다' },
  { value: 'default', label: 'Ask before edits', description: '파일 수정 전 항상 확인을 요청합니다' },
  { value: 'acceptEdits', label: 'Edit Automatically', description: '파일 수정을 자동으로 수행합니다' },
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
function getPermissionLabel(mode: PermissionMode): string {
  const found = PERMISSION_OPTIONS.find((o) => o.value === mode);
  return found?.label ?? mode;
}

export function ProjectSettingsSection() {
  const projects = useProjectStore((s) => s.projects);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const currentProjectSlug = useSessionStore((s) => s.currentProjectSlug);
  const globalPrefs = usePreferencesStore((s) => s.preferences);

  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>('');
  const [settings, setSettings] = useState<ProjectSettingsApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  // Set initial project selection
  useEffect(() => {
    if (projects.length === 0) return;
    if (selectedProjectSlug && projects.some((p) => p.projectSlug === selectedProjectSlug)) return;

    // Priority: current active project > first in list
    const initial = currentProjectSlug && projects.some((p) => p.projectSlug === currentProjectSlug)
      ? currentProjectSlug
      : projects[0].projectSlug;
    setSelectedProjectSlug(initial);
  }, [projects, currentProjectSlug, selectedProjectSlug]);

  // Fetch settings when project changes
  useEffect(() => {
    if (!selectedProjectSlug) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    projectsApi.getSettings(selectedProjectSlug)
      .then((data) => {
        if (!cancelled) {
          setSettings(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('설정을 불러오는 중 오류가 발생했습니다.');
          setSettings(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [selectedProjectSlug, fetchKey]);

  const handleUpdateSetting = useCallback(async (update: UpdateProjectSettingsRequest, toastMessage?: string) => {
    if (!selectedProjectSlug) return;
    try {
      setUpdating(true);
      const updated = await projectsApi.updateSettings(selectedProjectSlug, update);
      setSettings(updated);
      toast.success(toastMessage ?? '설정이 저장되었습니다.');

      // Sync sidebar if hidden changed
      if (update.hidden !== undefined) {
        fetchProjects();
      }
    } catch {
      toast.error('설정 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUpdating(false);
    }
  }, [selectedProjectSlug, fetchProjects]);

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

  const handleHiddenChange = useCallback(() => {
    if (!settings) return;
    handleUpdateSetting({ hidden: !settings.hidden });
  }, [settings, handleUpdateSetting]);

  const handleResetAll = useCallback(() => {
    const confirmed = window.confirm(
      '모든 프로젝트 설정을 초기화합니다.\n\n' +
      '\u2022 모델/Permission Mode 오버라이드가 제거됩니다\n' +
      '\u2022 프로젝트 숨기기가 해제됩니다\n\n' +
      '계속하시겠습니까?'
    );
    if (!confirmed) return;

    handleUpdateSetting({
      modelOverride: null,
      permissionModeOverride: null,
      hidden: false,
    }, '전역 설정으로 초기화되었습니다');
  }, [handleUpdateSetting]);

  // No projects state
  if (projects.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        프로젝트가 없습니다.
      </div>
    );
  }

  const overrides = settings?._overrides ?? [];
  const hasOverrides = overrides.length > 0 || settings?.hidden === true;
  const globalModel = globalPrefs.defaultModel ?? '';
  const globalPermission = globalPrefs.permissionMode ?? 'default';

  // Current model value for select
  const modelSelectValue = settings?.modelOverride !== undefined
    ? (settings.modelOverride ?? '')
    : GLOBAL_SENTINEL;

  // Current permission value for radio
  const permissionValue = settings?.permissionModeOverride !== undefined
    ? settings.permissionModeOverride
    : GLOBAL_SENTINEL;

  return (
    <div className="space-y-8">
      {/* Project Selector */}
      <div>
        <label
          htmlFor="project-select"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
        >
          프로젝트 선택
        </label>
        <select
          id="project-select"
          value={selectedProjectSlug}
          onChange={(e) => setSelectedProjectSlug(e.target.value)}
          disabled={updating}
          className="w-full max-w-md px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {projects.map((p) => (
            <option key={p.projectSlug} value={p.projectSlug}>
              {p.originalPath}{p.hidden ? ' (숨김)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">설정을 불러오는 중...</span>
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
            재시도
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
              모델 오버라이드
              {overrides.includes('modelOverride') && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">
                  (프로젝트 오버라이드)
                </span>
              )}
            </label>
            <select
              id="project-model"
              value={modelSelectValue}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={updating}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value={GLOBAL_SENTINEL}>
                전역 기본값 사용 (현재: {getModelDisplayLabel(globalModel)})
              </option>
              {MODEL_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
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
              Permission Mode 오버라이드
              {overrides.includes('permissionModeOverride') && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-normal">
                  (프로젝트 오버라이드)
                </span>
              )}
            </legend>
            <div className="space-y-2">
              {/* Global default option */}
              <label
                htmlFor="project-perm-global"
                className={`
                  flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${permissionValue === GLOBAL_SENTINEL
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
              >
                <input
                  type="radio"
                  id="project-perm-global"
                  name="projectPermissionMode"
                  value={GLOBAL_SENTINEL}
                  checked={permissionValue === GLOBAL_SENTINEL}
                  onChange={() => handlePermissionChange(GLOBAL_SENTINEL)}
                  disabled={updating}
                  className="mt-0.5"
                />
                <div>
                  <span className={`text-sm font-medium ${permissionValue === GLOBAL_SENTINEL ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                    전역 기본값 사용
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    현재: {getPermissionLabel(globalPermission as PermissionMode)}
                  </p>
                </div>
              </label>

              {/* Permission options */}
              {PERMISSION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`project-perm-${opt.value}`}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${permissionValue === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  <input
                    type="radio"
                    id={`project-perm-${opt.value}`}
                    name="projectPermissionMode"
                    value={opt.value}
                    checked={permissionValue === opt.value}
                    onChange={() => handlePermissionChange(opt.value)}
                    disabled={updating}
                    className="mt-0.5"
                    aria-describedby={`project-perm-desc-${opt.value}`}
                  />
                  <div>
                    <span className={`text-sm font-medium ${permissionValue === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                      {opt.label}
                    </span>
                    <p
                      id={`project-perm-desc-${opt.value}`}
                      className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                    >
                      {opt.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Hidden Toggle */}
          <div>
            <label
              htmlFor="project-hidden"
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                id="project-hidden"
                checked={settings.hidden ?? false}
                onChange={handleHiddenChange}
                disabled={updating}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                           text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-900 dark:text-white">
                이 프로젝트를 사이드바에서 숨기기
              </span>
            </label>
          </div>

          {/* Reset to Global Defaults */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
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
              전역 기본값으로 초기화
            </button>
            {!hasOverrides && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                현재 프로젝트 오버라이드가 없습니다.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
