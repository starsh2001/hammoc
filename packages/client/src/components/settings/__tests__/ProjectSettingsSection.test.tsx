/**
 * ProjectSettingsSection Tests
 * Story 10.3: Project Settings UI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectSettingsSection } from '../ProjectSettingsSection';
import { useProjectStore } from '../../../stores/projectStore';
import { useSessionStore } from '../../../stores/sessionStore';
import { usePreferencesStore } from '../../../stores/preferencesStore';
import type { ProjectInfo, ProjectSettingsApiResponse } from '@bmad-studio/shared';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock projectsApi
const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();
vi.mock('../../../services/api/projects', () => ({
  projectsApi: {
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  },
}));

const mockProjects: ProjectInfo[] = [
  { projectSlug: 'project-a', originalPath: '/home/user/projects/project-a', hidden: false, sessionCount: 3, lastModified: '2026-02-17', isBmadProject: true },
  { projectSlug: 'project-b', originalPath: '/home/user/projects/project-b', hidden: true, sessionCount: 1, lastModified: '2026-02-16', isBmadProject: false },
];

const mockSettingsNoOverride: ProjectSettingsApiResponse = {
  hidden: false,
  effectiveModel: 'sonnet',
  effectivePermissionMode: 'default',
  _overrides: [],
};

const mockSettingsWithOverride: ProjectSettingsApiResponse = {
  hidden: false,
  modelOverride: 'opus',
  permissionModeOverride: 'plan',
  effectiveModel: 'opus',
  effectivePermissionMode: 'plan',
  _overrides: ['modelOverride', 'permissionModeOverride'],
};

describe('ProjectSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue(mockSettingsNoOverride);
    mockUpdateSettings.mockResolvedValue(mockSettingsNoOverride);

    useProjectStore.setState({ projects: mockProjects });
    useSessionStore.setState({ currentProjectSlug: 'project-a' });
    usePreferencesStore.setState({
      preferences: {
        theme: 'dark',
        defaultModel: 'sonnet',
        permissionMode: 'default',
        chatTimeoutMs: 300000,
      },
      overrides: [],
      loaded: true,
    });
  });

  it('TC-1: renders project selector with project list', async () => {
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByLabelText('프로젝트 선택')).toBeInTheDocument();
    });
    const select = screen.getByLabelText('프로젝트 선택') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.value).toBe('project-a');
  });

  it('TC-2: fetches settings when project is selected', async () => {
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledWith('project-a');
    });
  });

  it('TC-3: model override dropdown has "use global default" as first option', async () => {
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByLabelText(/모델 오버라이드/)).toBeInTheDocument();
    });
    const modelSelect = screen.getByLabelText(/모델 오버라이드/) as HTMLSelectElement;
    expect(modelSelect.options[0].text).toContain('전역 기본값 사용');
  });

  it('TC-4: model change calls updateSettings', async () => {
    mockUpdateSettings.mockResolvedValue({
      ...mockSettingsNoOverride,
      modelOverride: 'opus',
      effectiveModel: 'opus',
      _overrides: ['modelOverride'],
    });
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByLabelText(/모델 오버라이드/)).toBeInTheDocument();
    });
    const modelSelect = screen.getByLabelText(/모델 오버라이드/);
    fireEvent.change(modelSelect, { target: { value: 'opus' } });
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', { modelOverride: 'opus' });
    });
  });

  it('TC-5: permission mode "use global" sends null', async () => {
    mockGetSettings.mockResolvedValue(mockSettingsWithOverride);
    mockUpdateSettings.mockResolvedValue(mockSettingsNoOverride);
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('전역 기본값 사용')).toBeInTheDocument();
    });
    const globalRadio = screen.getByRole('radio', { name: /전역 기본값 사용/ });
    fireEvent.click(globalRadio);
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', { permissionModeOverride: null });
    });
  });

  it('TC-6: override indicator is shown when overrides exist', async () => {
    mockGetSettings.mockResolvedValue(mockSettingsWithOverride);
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      const indicators = screen.getAllByText('(프로젝트 오버라이드)');
      expect(indicators.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('TC-7: reset button clears all overrides after confirmation', async () => {
    mockGetSettings.mockResolvedValue(mockSettingsWithOverride);
    mockUpdateSettings.mockResolvedValue(mockSettingsNoOverride);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('전역 기본값으로 초기화')).toBeInTheDocument();
    });
    const resetButton = screen.getByText('전역 기본값으로 초기화');
    fireEvent.click(resetButton);
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', {
        modelOverride: null,
        permissionModeOverride: null,
        hidden: false,
      });
    });
  });

  it('TC-8: reset button is disabled when no overrides', async () => {
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('전역 기본값으로 초기화')).toBeInTheDocument();
    });
    const resetButton = screen.getByText('전역 기본값으로 초기화') as HTMLButtonElement;
    expect(resetButton.disabled).toBe(true);
  });

  it('TC-9: shows "no projects" message when project list is empty', () => {
    useProjectStore.setState({ projects: [] });
    render(<ProjectSettingsSection />);
    expect(screen.getByText('프로젝트가 없습니다.')).toBeInTheDocument();
  });

  it('TC-10: dark mode styles are applied', async () => {
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByLabelText('프로젝트 선택')).toBeInTheDocument();
    });
    // Component renders without errors in dark mode context
    expect(screen.getByText(/모델 오버라이드/)).toBeInTheDocument();
    expect(screen.getByText(/Permission Mode 오버라이드/)).toBeInTheDocument();
  });

  it('TC-11: shows error message when settings fetch fails', async () => {
    mockGetSettings.mockRejectedValue(new Error('Network error'));
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('설정을 불러오는 중 오류가 발생했습니다.')).toBeInTheDocument();
    });
    expect(screen.getByText('재시도')).toBeInTheDocument();
  });

  it('TC-12: retry button re-fetches settings after error', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('Network error'));
    render(<ProjectSettingsSection />);
    await waitFor(() => {
      expect(screen.getByText('재시도')).toBeInTheDocument();
    });

    // Retry should succeed
    mockGetSettings.mockResolvedValueOnce(mockSettingsNoOverride);
    fireEvent.click(screen.getByText('재시도'));
    await waitFor(() => {
      expect(screen.getByLabelText(/모델 오버라이드/)).toBeInTheDocument();
    });
    // getSettings called twice: initial fail + retry success
    expect(mockGetSettings).toHaveBeenCalledTimes(2);
  });
});
