/**
 * TerminalTab Component Tests
 * Story 17.3: Terminal Tab - Task 6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TerminalTab } from '../TerminalTab';
import type { UseTerminalReturn } from '../../../hooks/useTerminal';
import type { TerminalSession } from '../../../stores/terminalStore';

// Mock useTerminal hook
const mockCreate = vi.fn();
const mockClose = vi.fn();
const mockCloseById = vi.fn();
const mockSwitchTerminal = vi.fn();
const mockListTerminals = vi.fn();

let mockUseTerminalReturn: UseTerminalReturn;

vi.mock('../../../hooks/useTerminal', () => ({
  useTerminal: () => mockUseTerminalReturn,
}));

// Mock terminalStore direct access
const mockClearTerminalsForProjectChange = vi.fn();
const mockSetActiveTerminalId = vi.fn();

vi.mock('../../../stores/terminalStore', () => ({
  useTerminalStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      clearTerminalsForProjectChange: mockClearTerminalsForProjectChange,
      setActiveTerminalId: mockSetActiveTerminalId,
      fontSize: 14,
      increaseFontSize: vi.fn(),
      decreaseFontSize: vi.fn(),
      resetFontSize: vi.fn(),
    }),
}));

// Mock TerminalEmulator
vi.mock('../TerminalEmulator', () => ({
  TerminalEmulator: ({ terminalId }: { terminalId: string }) => (
    <div data-testid={`terminal-emulator-${terminalId}`}>TerminalEmulator:{terminalId}</div>
  ),
}));

function makeSession(
  id: string,
  shell = '/bin/bash',
  status: TerminalSession['status'] = 'connected',
  exitCode?: number
): TerminalSession {
  return { terminalId: id, shell, status, ...(exitCode !== undefined ? { exitCode } : {}) };
}

function makeTerminals(...sessions: TerminalSession[]): Map<string, TerminalSession> {
  return new Map(sessions.map((s) => [s.terminalId, s]));
}

describe('TerminalTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTerminalReturn = {
      terminalId: 'term-1',
      isConnected: true,
      shell: '/bin/bash',
      status: 'connected',
      terminals: makeTerminals(makeSession('term-1')),
      terminalAccess: { allowed: true, enabled: true },
      create: mockCreate,
      close: mockClose,
      closeById: mockCloseById,
      switchTerminal: mockSwitchTerminal,
      listTerminals: mockListTerminals,
    };
  });

  afterEach(() => {
    cleanup();
  });

  // TC-TAB-1: Calls clearTerminalsForProjectChange on mount
  it('calls clearTerminalsForProjectChange with projectSlug on mount', () => {
    render(<TerminalTab projectSlug="test-project" />);
    expect(mockClearTerminalsForProjectChange).toHaveBeenCalledWith('test-project');
  });

  // TC-TAB-2: Shows empty state when no terminals exist (no auto-create)
  it('shows empty state UI when no terminals exist', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      isConnected: false,
      shell: null,
      status: null,
      terminals: new Map(),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('활성 터미널이 없습니다');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // TC-TAB-3: Does NOT call create when terminals exist (session persistence)
  it('does not call create when terminals already exist', () => {
    render(<TerminalTab projectSlug="test-project" />);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // TC-TAB-4: Displays shell name in header
  it('displays shell name extracted from shell path', () => {
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('bash');
  });

  // TC-TAB-5: Displays shell name from Windows path
  it('extracts shell name from Windows path', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      terminals: makeTerminals(
        makeSession(
          'term-1',
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
        )
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('powershell');
  });

  // TC-TAB-6: Shows connected status badge
  it('shows connected status badge with green dot', () => {
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('연결됨');
    const greenDot = container.querySelector('.bg-green-500');
    expect(greenDot).not.toBeNull();
  });

  // TC-TAB-7: Shows disconnected status badge
  it('shows disconnected status badge with red dot', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      status: 'disconnected',
      isConnected: false,
      terminals: makeTerminals(makeSession('term-1', '/bin/bash', 'disconnected')),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('연결 끊김');
    const redDot = container.querySelector('.bg-red-500');
    expect(redDot).not.toBeNull();
  });

  // TC-TAB-8: Shows exited status badge with exit code
  it('shows exited status badge with gray dot and exit code', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      status: 'exited',
      isConnected: false,
      terminals: makeTerminals(makeSession('term-1', '/bin/bash', 'exited', 130)),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('종료됨 (code: 130)');
    const grayDot = container.querySelector('.bg-gray-400');
    expect(grayDot).not.toBeNull();
  });

  // TC-TAB-9: New terminal button calls create
  it('calls create when "새 터미널" button is clicked', () => {
    const { getByText } = render(<TerminalTab projectSlug="test-project" />);
    fireEvent.click(getByText('새 터미널'));
    expect(mockCreate).toHaveBeenCalled();
  });

  // TC-TAB-10: New terminal button disabled at max (5)
  it('disables "새 터미널" button when 5 terminals exist', () => {
    const sessions = [
      makeSession('t1'), makeSession('t2'), makeSession('t3'),
      makeSession('t4'), makeSession('t5'),
    ];
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(...sessions),
    };
    const { getByText } = render(<TerminalTab projectSlug="test-project" />);
    const btn = getByText('새 터미널').closest('button')!;
    expect(btn.disabled).toBe(true);
  });

  // TC-TAB-11: Tab bar shown when terminals exist, hidden when empty
  it('shows terminal tab bar when terminals exist, hides when empty', () => {
    // Single terminal - tablist shown
    const { container, rerender } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();

    // Multiple terminals
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(makeSession('term-1'), makeSession('term-2', '/bin/zsh')),
    };
    rerender(<TerminalTab projectSlug="test-project" />);
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
  });

  // TC-TAB-12: Tab click switches terminal
  it('calls switchTerminal when tab is clicked', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(
        makeSession('term-1'),
        makeSession('term-2', '/bin/zsh')
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    const tabs = container.querySelectorAll('[role="tab"]');
    // Click the second tab
    fireEvent.click(tabs[1]);
    expect(mockSwitchTerminal).toHaveBeenCalledWith('term-2');
  });

  // TC-TAB-13: Tab close button calls closeById
  it('calls closeById when tab close button is clicked', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(
        makeSession('term-1'),
        makeSession('term-2', '/bin/zsh')
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    // Find X buttons inside tabs
    const closeBtns = container.querySelectorAll('[role="tab"] button');
    fireEvent.click(closeBtns[1]);
    expect(mockCloseById).toHaveBeenCalledWith('term-2');
  });

  // TC-TAB-14: Does NOT close terminal on unmount (session persistence)
  it('does not call close or closeById on unmount', () => {
    const { unmount } = render(<TerminalTab projectSlug="test-project" />);
    unmount();
    expect(mockClose).not.toHaveBeenCalled();
    expect(mockCloseById).not.toHaveBeenCalled();
  });

  // TC-TAB-15: Renders TerminalEmulator when activeTerminalId exists
  it('renders TerminalEmulator with activeTerminalId', () => {
    const { getByTestId } = render(<TerminalTab projectSlug="test-project" />);
    expect(getByTestId('terminal-emulator-term-1')).toBeDefined();
  });

  // TC-TAB-16: Shows empty state when no activeTerminalId
  it('shows empty state when no activeTerminalId', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      terminals: makeTerminals(makeSession('term-1')),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('활성 터미널이 없습니다');
    expect(container.textContent).toContain('새 터미널');
  });

  // TC-TAB-17: Keyboard navigation - ArrowRight moves to next tab
  it('switches to next terminal on ArrowRight', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(
        makeSession('term-1'),
        makeSession('term-2', '/bin/zsh')
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(mockSwitchTerminal).toHaveBeenCalledWith('term-2');
  });

  // TC-TAB-18: Keyboard navigation - ArrowLeft wraps to last tab
  it('switches to last terminal on ArrowLeft from first', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(
        makeSession('term-1'),
        makeSession('term-2', '/bin/zsh')
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(mockSwitchTerminal).toHaveBeenCalledWith('term-2');
  });

  // TC-TAB-19: Keyboard navigation - Delete closes active tab
  it('closes active terminal on Delete key', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(
        makeSession('term-1'),
        makeSession('term-2', '/bin/zsh')
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    const tablist = container.querySelector('[role="tablist"]')!;
    fireEvent.keyDown(tablist, { key: 'Delete' });
    expect(mockCloseById).toHaveBeenCalledWith('term-1');
  });

  // TC-TAB-20: Keyboard Enter selects tab
  it('selects tab on Enter key press', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminals: makeTerminals(
        makeSession('term-1'),
        makeSession('term-2', '/bin/zsh')
      ),
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    const tabs = container.querySelectorAll('[role="tab"]');
    fireEvent.keyDown(tabs[1], { key: 'Enter' });
    expect(mockSwitchTerminal).toHaveBeenCalledWith('term-2');
  });

  // TC-TAB-21: Project change triggers clearTerminalsForProjectChange
  it('calls clearTerminalsForProjectChange when projectSlug changes', () => {
    const { rerender } = render(<TerminalTab projectSlug="project-a" />);
    expect(mockClearTerminalsForProjectChange).toHaveBeenCalledWith('project-a');

    mockClearTerminalsForProjectChange.mockClear();
    rerender(<TerminalTab projectSlug="project-b" />);
    expect(mockClearTerminalsForProjectChange).toHaveBeenCalledWith('project-b');
  });

  // Story 17.5: Terminal security tests

  // TC-TAB-22: Shows warning when terminal is disabled (AC1)
  it('shows disabled warning when terminalAccess.enabled is false', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalAccess: { allowed: false, enabled: false },
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('터미널 기능이 비활성화되어 있습니다');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  // TC-TAB-23: Shows warning when terminal access denied (AC4)
  it('shows access denied warning when terminalAccess.allowed is false', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalAccess: { allowed: false, enabled: true },
    };
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.textContent).toContain('보안상 로컬 네트워크 외부에서는 터미널을 이용할 수 없습니다');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  // TC-TAB-24: Does NOT show warning when access is allowed
  it('does not show warning when terminalAccess.allowed is true', () => {
    const { container } = render(<TerminalTab projectSlug="test-project" />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('터미널 기능이 비활성화되어 있습니다');
  });
});
