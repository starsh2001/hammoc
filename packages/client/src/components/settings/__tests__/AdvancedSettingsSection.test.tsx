/**
 * GlobalSettingsSection — Default Effort Dropdown Tests
 * Story 26.3: Default Effort Settings dropdown (moved from AdvancedSettingsSection)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSettingsSection } from '../GlobalSettingsSection';
import { usePreferencesStore } from '../../../stores/preferencesStore';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useTheme hook
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

// Mock ModelSelector export
vi.mock('../../ModelSelector', () => ({
  MODEL_GROUPS: [{ label: 'Default', models: [{ value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }] }],
}));

describe('GlobalSettingsSection — Default Effort Dropdown', () => {
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
  });

  it('renders dropdown with SDK default and 4 effort options', () => {
    render(<GlobalSettingsSection />);

    const select = screen.getByLabelText('기본 사고 수준');
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(5); // SDK default + 4 effort levels
    expect(options[0]).toHaveTextContent('Default (High)');
    expect(options[1]).toHaveTextContent('Low');
    expect(options[2]).toHaveTextContent('Medium');
    expect(options[3]).toHaveTextContent('High');
    expect(options[4]).toHaveTextContent('Max');
  });

  it('selecting "High" calls updatePreference with "high"', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<GlobalSettingsSection />);

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
    render(<GlobalSettingsSection />);

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

    render(<GlobalSettingsSection />);

    const select = screen.getByLabelText('기본 사고 수준') as HTMLSelectElement;
    expect(select.value).toBe('medium');
  });
});
