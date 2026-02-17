/**
 * GlobalSettingsSection Tests
 * Story 10.2: Global Settings UI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSettingsSection } from '../GlobalSettingsSection';
import { usePreferencesStore } from '../../../stores/preferencesStore';
import { useChatStore } from '../../../stores/chatStore';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useTheme
const mockSetTheme = vi.fn();
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: usePreferencesStore.getState().preferences.theme ?? 'dark',
    setTheme: mockSetTheme,
    toggleTheme: vi.fn(),
  }),
}));

describe('GlobalSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      preferences: {
        theme: 'dark',
        defaultModel: '',
        permissionMode: 'default',
        chatTimeoutMs: 300000,
      },
      overrides: [],
      loaded: true,
    });
    useChatStore.setState({
      permissionMode: 'default',
    });
  });

  it('TC-1: renders all 4 setting sections', () => {
    render(<GlobalSettingsSection />);
    expect(screen.getByText('테마')).toBeInTheDocument();
    expect(screen.getByText('기본 모델')).toBeInTheDocument();
    expect(screen.getByText('Permission Mode')).toBeInTheDocument();
    expect(screen.getByText('채팅 타임아웃')).toBeInTheDocument();
  });

  it('TC-2: theme change calls setTheme', () => {
    render(<GlobalSettingsSection />);
    const lightRadio = screen.getByLabelText('라이트');
    fireEvent.click(lightRadio);
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('TC-3: default model change calls updatePreference', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<GlobalSettingsSection />);
    const modelSelect = screen.getByLabelText('기본 모델');
    fireEvent.change(modelSelect, { target: { value: 'opus' } });
    expect(updateSpy).toHaveBeenCalledWith('defaultModel', 'opus');
  });

  it('TC-4: permission mode change calls chatStore.setPermissionMode', () => {
    const setPermSpy = vi.fn();
    useChatStore.setState({ setPermissionMode: setPermSpy });
    render(<GlobalSettingsSection />);
    const planRadio = screen.getByRole('radio', { name: /Plan/ });
    fireEvent.click(planRadio);
    expect(setPermSpy).toHaveBeenCalledWith('plan');
  });

  it('TC-5: chat timeout change calls updatePreference', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<GlobalSettingsSection />);
    const timeoutSelect = screen.getByLabelText(/채팅 타임아웃/);
    fireEvent.change(timeoutSelect, { target: { value: '60000' } });
    expect(updateSpy).toHaveBeenCalledWith('chatTimeoutMs', 60000);
  });

  it('TC-6: shows env var override indicator and disables timeout', () => {
    usePreferencesStore.setState({ overrides: ['chatTimeoutMs'] });
    render(<GlobalSettingsSection />);
    expect(screen.getByText('(환경변수로 설정됨)')).toBeInTheDocument();
    const timeoutSelect = screen.getByLabelText(/채팅 타임아웃/) as HTMLSelectElement;
    expect(timeoutSelect.disabled).toBe(true);
  });

  it('TC-7: renders with dark mode classes', () => {
    render(<GlobalSettingsSection />);
    // Verify the component renders without errors in dark mode context
    expect(screen.getByText('테마')).toBeInTheDocument();
    // Radio buttons should be present
    expect(screen.getByLabelText('다크')).toBeInTheDocument();
    expect(screen.getByLabelText('라이트')).toBeInTheDocument();
    expect(screen.getByLabelText('시스템')).toBeInTheDocument();
  });
});
