/**
 * QuickTerminal Component Tests (Content-only, post-refactor)
 * [Source: Story 17.4 - Task 4, Story 19.1 - Task 9.3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QuickTerminal } from '../QuickTerminal';
import type { UseTerminalReturn } from '../../../hooks/useTerminal';
import type { TerminalSession } from '../../../stores/terminalStore';

// Mock useTerminal hook
const mockCreate = vi.fn();
const mockClose = vi.fn();
const mockCloseById = vi.fn();
const mockSwitchTerminal = vi.fn();

let mockUseTerminalReturn: UseTerminalReturn;

vi.mock('../../../hooks/useTerminal', () => ({
  useTerminal: () => mockUseTerminalReturn,
}));

// Mock TerminalEmulator component (xterm.js dependency avoidance)
vi.mock('../TerminalEmulator', () => ({
  TerminalEmulator: ({ terminalId }: { terminalId: string }) => (
    <div data-testid={`terminal-emulator-${terminalId}`}>TerminalEmulator:{terminalId}</div>
  ),
}));

function makeSession(
  id: string,
  shell = '/bin/bash',
  status: TerminalSession['status'] = 'connected'
): TerminalSession {
  return { terminalId: id, shell, status };
}

function makeTerminals(...sessions: TerminalSession[]): Map<string, TerminalSession> {
  return new Map(sessions.map((s) => [s.terminalId, s]));
}

const defaultProps = {
  projectSlug: 'test-project',
  onNavigateToTerminalTab: vi.fn(),
};

describe('QuickTerminal', () => {
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
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders terminal emulator when terminalId exists', () => {
    const { getByTestId } = render(<QuickTerminal {...defaultProps} />);
    expect(getByTestId('terminal-emulator-term-1')).toBeDefined();
  });

  it('shows empty state when no terminals exist (no auto-create)', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      isConnected: false,
      shell: null,
      status: null,
      terminals: new Map(),
    };
    const { container } = render(<QuickTerminal {...defaultProps} />);
    expect(container.textContent).toContain('활성 터미널이 없습니다');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not call create when terminals already exist', () => {
    render(<QuickTerminal {...defaultProps} />);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls onNavigateToTerminalTab when "터미널 탭에서 열기" is clicked', () => {
    const onNavigateToTerminalTab = vi.fn();
    const { container } = render(
      <QuickTerminal {...defaultProps} onNavigateToTerminalTab={onNavigateToTerminalTab} />
    );
    const navigateBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('터미널 탭에서 열기')
    );
    expect(navigateBtn).toBeDefined();
    navigateBtn!.click();
    expect(onNavigateToTerminalTab).toHaveBeenCalledTimes(1);
  });

  it('does not call close or closeById on unmount', () => {
    const { unmount } = render(<QuickTerminal {...defaultProps} />);
    unmount();
    expect(mockClose).not.toHaveBeenCalled();
    expect(mockCloseById).not.toHaveBeenCalled();
  });

  it('shows empty state with create button when no terminalId', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      terminals: new Map(),
    };
    const { container } = render(<QuickTerminal {...defaultProps} />);
    expect(container.textContent).toContain('활성 터미널이 없습니다');
    expect(container.textContent).toContain('새 터미널');
  });

  // Story 17.5: Terminal security tests

  it('shows disabled warning when terminalAccess.enabled is false', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalAccess: { allowed: false, enabled: false },
    };
    const { container } = render(<QuickTerminal {...defaultProps} />);
    expect(container.textContent).toContain('터미널 기능이 비활성화되어 있습니다');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('shows access denied warning when terminalAccess.allowed is false', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalAccess: { allowed: false, enabled: true },
    };
    const { container } = render(<QuickTerminal {...defaultProps} />);
    expect(container.textContent).toContain('보안상 로컬 네트워크 외부에서는 터미널을 이용할 수 없습니다');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('does not show warning when terminalAccess.allowed is true', () => {
    const { container } = render(<QuickTerminal {...defaultProps} />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
