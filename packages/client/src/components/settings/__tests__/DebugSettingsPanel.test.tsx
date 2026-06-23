/**
 * DebugSettingsPanel Tests (Story BS-6)
 * - Renders all 6 diagnostic options (4 toggles + 2 log-level selects)
 * - Session-start toggles (CLI trace / PTY dump / tool trace) show a "next session" badge;
 *   runtime options (log levels, test endpoints) do not
 * - Log-level selects each offer the 5 LogLevel values
 * - Toggling routes through updatePreference with the expected debug* key
 *
 * i18n is forced to Korean in the test environment (see test-utils/setup.ts), so labels are
 * matched against the ko/settings.json strings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebugSettingsPanel } from '../DebugSettingsPanel';
import { usePreferencesStore } from '../../../stores/preferencesStore';

// Mock sonner (toast side-effects are irrelevant to these assertions)
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('DebugSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({ preferences: {}, overrides: [], loaded: true });
  });

  it('renders all 6 debug options (4 toggles + 2 log-level selects)', () => {
    render(<DebugSettingsPanel />);
    // 3 session-start toggles + 1 test-endpoints toggle = 4 checkboxes
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByLabelText('서버 로그 레벨')).toBeInTheDocument();
    expect(screen.getByLabelText('클라이언트 로그 레벨')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /CLI 결정 트레이스/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /PTY 프레임 덤프/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /도구 완료 트레이스/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /테스트 엔드포인트/ })).toBeInTheDocument();
  });

  it('shows the "next session" badge exactly on the 3 session-start toggles', () => {
    render(<DebugSettingsPanel />);
    expect(screen.getAllByText('다음 세션부터 적용')).toHaveLength(3);
  });

  it('log-level selectors each render all 5 LogLevel options', () => {
    render(<DebugSettingsPanel />);
    const server = screen.getByLabelText('서버 로그 레벨') as HTMLSelectElement;
    const client = screen.getByLabelText('클라이언트 로그 레벨') as HTMLSelectElement;
    const expected = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];
    expect([...server.options].map((o) => o.value)).toEqual(expected);
    expect([...client.options].map((o) => o.value)).toEqual(expected);
  });

  it('toggling CLI Decision Trace calls updatePreference("debugCliTrace", true)', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<DebugSettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /CLI 결정 트레이스/ }));
    expect(updateSpy).toHaveBeenCalledWith('debugCliTrace', true);
  });

  it('changing the server log level calls updatePreference("debugServerLogLevel", value)', () => {
    const updateSpy = vi.spyOn(usePreferencesStore.getState(), 'updatePreference');
    render(<DebugSettingsPanel />);
    fireEvent.change(screen.getByLabelText('서버 로그 레벨'), { target: { value: 'VERBOSE' } });
    expect(updateSpy).toHaveBeenCalledWith('debugServerLogLevel', 'VERBOSE');
  });

  it('reflects a stored server log level preference', () => {
    usePreferencesStore.setState({ preferences: { debugServerLogLevel: 'WARN' }, overrides: [], loaded: true });
    render(<DebugSettingsPanel />);
    expect((screen.getByLabelText('서버 로그 레벨') as HTMLSelectElement).value).toBe('WARN');
  });
});
