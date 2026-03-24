/**
 * AdvancedSettingsSection Tests
 * Story 26.3: Default Effort Settings dropdown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedSettingsSection } from '../AdvancedSettingsSection';
import { usePreferencesStore } from '../../../stores/preferencesStore';
import { useSessionStore } from '../../../stores/sessionStore';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock API calls used by the component
const mockGet = vi.fn().mockResolvedValue({ isDevMode: false, version: '1.0.0' });
vi.mock('../../../services/api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../services/api/preferences', () => ({
  preferencesApi: {
    getSystemPromptTemplate: vi.fn().mockResolvedValue({
      template: 'default prompt',
      variables: [],
    }),
  },
}));

vi.mock('../../../services/api/projects', () => ({
  projectsApi: {
    getSystemPrompt: vi.fn().mockResolvedValue({ resolved: '' }),
  },
}));

describe('AdvancedSettingsSection — Default Effort Dropdown', () => {
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
    useSessionStore.setState({
      currentProjectSlug: 'test-project',
    });
  });

  it('renders dropdown with SDK default and 4 effort options', () => {
    render(<AdvancedSettingsSection />);

    const select = screen.getByLabelText('기본 사고 수준');
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(5); // SDK default + 4 effort levels
    expect(options[0]).toHaveTextContent('SDK 기본값');
    expect(options[1]).toHaveTextContent('Low');
    expect(options[2]).toHaveTextContent('Medium');
    expect(options[3]).toHaveTextContent('High');
    expect(options[4]).toHaveTextContent('Max');
  });

  it('selecting "High" calls updatePreference with "high"', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<AdvancedSettingsSection />);

    const select = screen.getByLabelText('기본 사고 수준');
    fireEvent.change(select, { target: { value: 'high' } });

    expect(updateSpy).toHaveBeenCalledWith('defaultEffort', 'high');
  });

  it('selecting SDK default (empty value) calls updatePreference with undefined', () => {
    usePreferencesStore.setState({
      preferences: {
        theme: 'dark',
        defaultModel: '',
        permissionMode: 'default',
        chatTimeoutMs: 300000,
        defaultEffort: 'high',
      },
      overrides: [],
      loaded: true,
    });

    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<AdvancedSettingsSection />);

    const select = screen.getByLabelText('기본 사고 수준');
    fireEvent.change(select, { target: { value: '' } });

    expect(updateSpy).toHaveBeenCalledWith('defaultEffort', undefined);
  });

  it('dropdown reflects current preferences.defaultEffort value', () => {
    usePreferencesStore.setState({
      preferences: {
        theme: 'dark',
        defaultModel: '',
        permissionMode: 'default',
        chatTimeoutMs: 300000,
        defaultEffort: 'medium',
      },
      overrides: [],
      loaded: true,
    });

    render(<AdvancedSettingsSection />);

    const select = screen.getByLabelText('기본 사고 수준') as HTMLSelectElement;
    expect(select.value).toBe('medium');
  });
});
