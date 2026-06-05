/**
 * CliModeSettingsPanel Tests (Epic 33, Story 33.2)
 * - Billing gate OFF → panel renders nothing (self-gated)
 * - Gate ON → 3 checkboxes + binary path input, reflecting the documented defaults
 *   (thinking ON, generation progress ON, synthetic typing OFF, binary path empty)
 * - Each control routes through updatePreference with the expected cli* key
 *
 * i18n is forced to Korean in the test environment (see test-utils/setup.ts), so
 * labels are matched against the ko/settings.json strings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CliModeSettingsPanel } from '../CliModeSettingsPanel';
import { usePreferencesStore } from '../../../stores/preferencesStore';

// Mock sonner (toast side-effects are irrelevant to these assertions)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CliModeSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      preferences: {},
      overrides: [],
      engineModeToggleEnabled: false,
      loaded: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC-1: renders nothing when the billing gate is OFF', () => {
    const { container } = render(<CliModeSettingsPanel />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('CLI 모드 설정')).not.toBeInTheDocument();
  });

  it('TC-2: renders the title, 3 checkboxes and the binary path input when the gate is ON', () => {
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    render(<CliModeSettingsPanel />);
    expect(screen.getByText('CLI 모드 설정')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByLabelText('claude 바이너리 경로')).toBeInTheDocument();
  });

  it('TC-3: reflects documented defaults (thinking ON · progress ON · synthetic OFF · binary empty)', () => {
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    render(<CliModeSettingsPanel />);
    expect(screen.getByRole('checkbox', { name: /thinking 요약 표시/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /생성 진행률 표시/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /synthetic typing/ })).not.toBeChecked();
    expect(screen.getByLabelText('claude 바이너리 경로')).toHaveValue('');
  });

  it('TC-4: toggling thinking summaries off calls updatePreference(false)', () => {
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /thinking 요약 표시/ }));
    expect(updateSpy).toHaveBeenCalledWith('cliShowThinkingSummaries', false);
  });

  it('TC-5: toggling synthetic typing on calls updatePreference(true)', () => {
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /synthetic typing/ }));
    expect(updateSpy).toHaveBeenCalledWith('cliSyntheticTyping', true);
  });

  it('TC-6: binary path input saves the value after the debounce window', () => {
    vi.useFakeTimers();
    usePreferencesStore.setState({ engineModeToggleEnabled: true });
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    const input = screen.getByLabelText('claude 바이너리 경로');
    fireEvent.change(input, { target: { value: '/opt/homebrew/bin/claude' } });
    // Debounced — not saved synchronously
    expect(updateSpy).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(updateSpy).toHaveBeenCalledWith('cliBinaryPath', '/opt/homebrew/bin/claude');
  });

  it('TC-7: clearing the binary path saves undefined (auto-detect)', () => {
    vi.useFakeTimers();
    usePreferencesStore.setState({
      engineModeToggleEnabled: true,
      preferences: { cliBinaryPath: '/opt/homebrew/bin/claude' },
    });
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    const input = screen.getByLabelText('claude 바이너리 경로');
    expect(input).toHaveValue('/opt/homebrew/bin/claude');
    fireEvent.change(input, { target: { value: '' } });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(updateSpy).toHaveBeenCalledWith('cliBinaryPath', undefined);
  });
});
