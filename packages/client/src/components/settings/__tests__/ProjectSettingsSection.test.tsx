/**
 * ProjectSettingsSection Tests
 * Story 10.3: Project Settings UI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectSettingsSection } from '../ProjectSettingsSection';
import { useProjectStore } from '../../../stores/projectStore';
import { usePreferencesStore } from '../../../stores/preferencesStore';
import type { ProjectInfo, ProjectSettingsApiResponse } from '@hammoc/shared';

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
  effectiveEngineMode: 'sdk',
  _overrides: [],
};

const mockSettingsWithOverride: ProjectSettingsApiResponse = {
  hidden: false,
  modelOverride: 'opus',
  permissionModeOverride: 'plan',
  effectiveModel: 'opus',
  effectivePermissionMode: 'plan',
  effectiveEngineMode: 'sdk',
  _overrides: ['modelOverride', 'permissionModeOverride'],
};

describe('ProjectSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue(mockSettingsNoOverride);
    mockUpdateSettings.mockResolvedValue(mockSettingsNoOverride);

    useProjectStore.setState({ projects: mockProjects });
    usePreferencesStore.setState({
      preferences: {
        theme: 'dark',
        defaultModel: 'sonnet',
        permissionMode: 'default',
        chatTimeoutMs: 300000,
      },
      overrides: [],
      engineModeToggleEnabled: false,
      loaded: true,
    });
  });

  it('TC-1: fetches settings for the provided projectSlug on mount', async () => {
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledWith('project-a');
    });
  });

  it('TC-2: model override dropdown has "use global default" as first option', async () => {
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByLabelText(/모델 오버라이드/)).toBeInTheDocument();
    });
    const modelSelect = screen.getByLabelText(/모델 오버라이드/) as HTMLSelectElement;
    expect(modelSelect.options[0].text).toContain('전역 기본값 사용');
  });

  it('TC-3: model change calls updateSettings', async () => {
    mockUpdateSettings.mockResolvedValue({
      ...mockSettingsNoOverride,
      modelOverride: 'opus',
      effectiveModel: 'opus',
      _overrides: ['modelOverride'],
    });
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByLabelText(/모델 오버라이드/)).toBeInTheDocument();
    });
    const modelSelect = screen.getByLabelText(/모델 오버라이드/);
    fireEvent.change(modelSelect, { target: { value: 'opus' } });
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', { modelOverride: 'opus' });
    });
  });

  it('TC-4: permission mode "use global" sends null', async () => {
    mockGetSettings.mockResolvedValue(mockSettingsWithOverride);
    mockUpdateSettings.mockResolvedValue(mockSettingsNoOverride);
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /전역 기본값 사용/ })).toBeInTheDocument();
    });
    const globalRadio = screen.getByRole('radio', { name: /전역 기본값 사용/ });
    fireEvent.click(globalRadio);
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', { permissionModeOverride: null });
    });
  });

  it('TC-5: override indicator is shown when overrides exist', async () => {
    mockGetSettings.mockResolvedValue(mockSettingsWithOverride);
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      const indicators = screen.getAllByText('(프로젝트 오버라이드)');
      expect(indicators.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('TC-6: reset button clears all overrides after confirmation', async () => {
    mockGetSettings.mockResolvedValue(mockSettingsWithOverride);
    mockUpdateSettings.mockResolvedValue(mockSettingsNoOverride);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByText('전역 기본값으로 초기화')).toBeInTheDocument();
    });
    const resetButton = screen.getByText('전역 기본값으로 초기화');
    fireEvent.click(resetButton);
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', {
        modelOverride: null,
        permissionModeOverride: null,
        engineModeOverride: null,
        hidden: false,
      });
    });
  });

  it('TC-7: reset button is disabled when no overrides', async () => {
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByText('전역 기본값으로 초기화')).toBeInTheDocument();
    });
    const resetButton = screen.getByText('전역 기본값으로 초기화') as HTMLButtonElement;
    expect(resetButton.disabled).toBe(true);
  });

  it('TC-8: dark mode styles are applied', async () => {
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByText(/모델 오버라이드/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Permission Mode 오버라이드/)).toBeInTheDocument();
  });

  it('TC-9: shows error message when settings fetch fails', async () => {
    mockGetSettings.mockRejectedValue(new Error('Network error'));
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByText('설정을 불러오는 중 오류가 발생했습니다.')).toBeInTheDocument();
    });
    expect(screen.getByText('재시도')).toBeInTheDocument();
  });

  it('TC-10: retry button re-fetches settings after error', async () => {
    mockGetSettings.mockRejectedValueOnce(new Error('Network error'));
    render(<ProjectSettingsSection projectSlug="project-a" />);
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

  it('TC-11: refetches when projectSlug prop changes', async () => {
    const { rerender } = render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledWith('project-a');
    });

    rerender(<ProjectSettingsSection projectSlug="project-b" />);
    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledWith('project-b');
    });
  });

  // Story 33.1 — engine-mode override is gated by the operator billing flag
  it('TC-12: engine override fieldset is hidden when the billing gate is OFF', async () => {
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByLabelText(/모델 오버라이드/)).toBeInTheDocument();
    });
    expect(screen.queryByText('대화 엔진 재정의')).not.toBeInTheDocument();
  });

  it('TC-13: engine override fieldset renders when the gate is ON', async () => {
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByText('대화 엔진 재정의')).toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: /CLI/ })).toBeInTheDocument();
  });

  it('TC-14: selecting the CLI engine override sends engineModeOverride', async () => {
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    mockUpdateSettings.mockResolvedValue({
      ...mockSettingsNoOverride,
      engineModeOverride: 'cli',
      effectiveEngineMode: 'cli',
      _overrides: ['engineModeOverride'],
    });
    render(<ProjectSettingsSection projectSlug="project-a" />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /CLI/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('radio', { name: /CLI/ }));
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith('project-a', { engineModeOverride: 'cli' });
    });
  });
});
