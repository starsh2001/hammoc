/**
 * GlobalSettingsSection Tests
 * Story 10.2: Global Settings UI
 * Story 22.1: i18n integration — language selector + translated text
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

  it('TC-1: renders all setting sections', () => {
    render(<GlobalSettingsSection />);
    expect(screen.getByText('테마')).toBeInTheDocument();
    expect(screen.getByText('기본 모델')).toBeInTheDocument();
    expect(screen.getByText('권한 모드')).toBeInTheDocument();
    expect(screen.getByText('채팅 타임아웃')).toBeInTheDocument();
    expect(screen.getByText('언어')).toBeInTheDocument();
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
    const planRadio = screen.getByRole('radio', { name: /계획/ });
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

  it('TC-7: renders theme radio buttons', () => {
    render(<GlobalSettingsSection />);
    expect(screen.getByText('테마')).toBeInTheDocument();
    expect(screen.getByLabelText('다크')).toBeInTheDocument();
    expect(screen.getByLabelText('라이트')).toBeInTheDocument();
    expect(screen.getByLabelText('시스템')).toBeInTheDocument();
  });

  it('TC-8: language selector renders 6 language options', () => {
    render(<GlobalSettingsSection />);
    const langSelect = screen.getByLabelText('언어') as HTMLSelectElement;
    expect(langSelect).toBeInTheDocument();
    const options = langSelect.querySelectorAll('option');
    expect(options.length).toBe(6);
    // Verify native names
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('한국어')).toBeInTheDocument();
    expect(screen.getByText('日本語')).toBeInTheDocument();
    expect(screen.getByText('中文(简体)')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('Português')).toBeInTheDocument();
  });

  it('TC-9: language change calls setLanguage', () => {
    const setLanguageSpy = vi.spyOn(usePreferencesStore.getState(), 'setLanguage');
    render(<GlobalSettingsSection />);
    const langSelect = screen.getByLabelText('언어');
    fireEvent.change(langSelect, { target: { value: 'ko' } });
    expect(setLanguageSpy).toHaveBeenCalledWith('ko');
  });
});
