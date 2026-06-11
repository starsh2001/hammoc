/**
 * CliModeSettingsPanel Tests (Epic 33, Story 33.2)
 * - Renders 4 checkboxes + binary path input, reflecting the documented defaults
 *   (thinking ON, generation progress ON, synthetic typing OFF, claude screen mirror ON
 *   per Story 37.7, binary path empty)
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
      loaded: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC-1: renders the title, 4 checkboxes and the binary path input', () => {
    render(<CliModeSettingsPanel />);
    expect(screen.getByText('CLI 모드 설정')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByLabelText('claude 바이너리 경로')).toBeInTheDocument();
  });

  it('TC-3: reflects documented defaults (thinking ON · progress ON · synthetic OFF · mirror ON · binary empty)', () => {
    render(<CliModeSettingsPanel />);
    expect(screen.getByRole('checkbox', { name: /thinking 요약 표시/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /생성 진행률 표시/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /타이핑·카드 연출/ })).not.toBeChecked();
    // Story 37.7: the mirror was promoted to a default feature (default ON, opt-out).
    expect(screen.getByRole('checkbox', { name: /claude 화면 미러/ })).toBeChecked();
    expect(screen.getByLabelText('claude 바이너리 경로')).toHaveValue('');
  });

  it('TC-4: toggling thinking summaries off calls updatePreference(false)', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /thinking 요약 표시/ }));
    expect(updateSpy).toHaveBeenCalledWith('cliShowThinkingSummaries', false);
  });

  it('TC-5: toggling synthetic typing on calls updatePreference(true)', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /타이핑·카드 연출/ }));
    expect(updateSpy).toHaveBeenCalledWith('cliSyntheticTyping', true);
  });

  it('TC-6: binary path input saves the value after the debounce window', () => {
    vi.useFakeTimers();
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

  it('TC-8: card stagger input appears only when typing/reveal is on, and saves on change', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<CliModeSettingsPanel />);
    // Hidden while the typing/reveal animation is off (default).
    expect(screen.queryByLabelText('카드 등장 간격 (ms)')).toBeNull();

    // Turn it on → the interval input appears with the documented default (500).
    act(() => {
      usePreferencesStore.setState({ preferences: { cliSyntheticTyping: true } });
    });
    const input = screen.getByLabelText('카드 등장 간격 (ms)');
    expect(input).toHaveValue(500);

    fireEvent.change(input, { target: { value: '800' } });
    expect(updateSpy).toHaveBeenCalledWith('cliCardStaggerMs', 800);
  });
});
