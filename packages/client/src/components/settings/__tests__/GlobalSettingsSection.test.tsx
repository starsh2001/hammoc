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

// Mock i18n module to prevent actual initialization
vi.mock('../../../i18n', () => ({
  default: { language: 'en', changeLanguage: vi.fn() },
}));

// Mock react-i18next — return key as value for predictable assertions
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'global.theme': 'Theme',
        'global.themeOption.dark': 'Dark',
        'global.themeOption.light': 'Light',
        'global.themeOption.system': 'System',
        'global.defaultModel': 'Default Model',
        'global.language': 'Language',
        'global.permissionMode': 'Permission Mode',
        'global.permissionDesc.plan': 'Suggests a plan before code changes',
        'global.permissionDesc.default': 'Always asks for confirmation before editing files',
        'global.permissionDesc.acceptEdits': 'Automatically performs file edits',
        'global.permissionDesc.bypass': 'Skips all permission checks (including Bash)',
        'global.markdownMode': 'Markdown File Open Mode',
        'global.markdownOption.edit': 'Edit',
        'global.markdownOption.preview': 'Preview',
        'global.markdownDesc': 'Default mode when opening markdown files.',
        'global.fileExplorerView': 'File Explorer Default View',
        'global.fileExplorerOption.grid': 'Finder View',
        'global.fileExplorerOption.list': 'List View',
        'global.fileExplorerDesc': 'Default view mode when opening the file explorer.',
        'global.chatTimeout': 'Chat Timeout',
        'global.chatTimeoutOverride': '(Set by environment variable)',
        'global.chatTimeoutDesc': 'Time to automatically abort request when no response is received.',
        'global.timeoutOption.1m': '1 min',
        'global.timeoutOption.3m': '3 min',
        'global.timeoutOption.5mDefault': '5 min (default)',
        'global.timeoutOption.10m': '10 min',
        'global.timeoutOption.30m': '30 min',
        'toast.themeChanged': 'Theme changed',
        'toast.modelChanged': 'Default model changed',
        'toast.permissionChanged': 'Permission Mode changed',
        'toast.timeoutChanged': 'Chat timeout changed',
        'toast.markdownModeChanged': 'Markdown default mode changed',
        'toast.fileExplorerViewChanged': 'File explorer default view changed',
        'toast.languageChanged': 'Language changed',
      };
      return translations[key] || key;
    },
    i18n: { language: 'en' },
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
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Default Model')).toBeInTheDocument();
    expect(screen.getByText('Permission Mode')).toBeInTheDocument();
    expect(screen.getByText('Chat Timeout')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('TC-2: theme change calls setTheme', () => {
    render(<GlobalSettingsSection />);
    const lightRadio = screen.getByLabelText('Light');
    fireEvent.click(lightRadio);
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('TC-3: default model change calls updatePreference', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<GlobalSettingsSection />);
    const modelSelect = screen.getByLabelText('Default Model');
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
    const timeoutSelect = screen.getByLabelText(/Chat Timeout/);
    fireEvent.change(timeoutSelect, { target: { value: '60000' } });
    expect(updateSpy).toHaveBeenCalledWith('chatTimeoutMs', 60000);
  });

  it('TC-6: shows env var override indicator and disables timeout', () => {
    usePreferencesStore.setState({ overrides: ['chatTimeoutMs'] });
    render(<GlobalSettingsSection />);
    expect(screen.getByText('(Set by environment variable)')).toBeInTheDocument();
    const timeoutSelect = screen.getByLabelText(/Chat Timeout/) as HTMLSelectElement;
    expect(timeoutSelect.disabled).toBe(true);
  });

  it('TC-7: renders theme radio buttons', () => {
    render(<GlobalSettingsSection />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByLabelText('Dark')).toBeInTheDocument();
    expect(screen.getByLabelText('Light')).toBeInTheDocument();
    expect(screen.getByLabelText('System')).toBeInTheDocument();
  });

  it('TC-8: language selector renders 6 language options', () => {
    render(<GlobalSettingsSection />);
    const langSelect = screen.getByLabelText('Language') as HTMLSelectElement;
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
    const langSelect = screen.getByLabelText('Language');
    fireEvent.change(langSelect, { target: { value: 'ko' } });
    expect(setLanguageSpy).toHaveBeenCalledWith('ko');
  });
});
