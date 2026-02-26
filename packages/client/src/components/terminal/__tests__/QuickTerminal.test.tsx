/**
 * QuickTerminal Component Tests
 * Story 17.4 - Task 4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
  isOpen: true,
  projectSlug: 'test-project',
  onClose: vi.fn(),
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
      create: mockCreate,
      close: mockClose,
      closeById: mockCloseById,
      switchTerminal: mockSwitchTerminal,
    };
  });

  afterEach(() => {
    cleanup();
  });

  // TC-QT-1: isOpen=false renders nothing
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <QuickTerminal {...defaultProps} isOpen={false} />
    );
    expect(container.querySelector('[data-testid="quick-terminal-panel"]')).toBeNull();
  });

  // TC-QT-2: isOpen=true renders panel
  it('renders panel when isOpen is true', () => {
    const { getByTestId } = render(
      <QuickTerminal {...defaultProps} />
    );
    expect(getByTestId('quick-terminal-panel')).toBeDefined();
  });

  // TC-QT-3: Header shows "터미널" title
  it('displays "터미널" title in header', () => {
    const { container } = render(
      <QuickTerminal {...defaultProps} />
    );
    expect(container.textContent).toContain('터미널');
  });

  // TC-QT-4: Close button calls onClose
  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <QuickTerminal {...defaultProps} onClose={onClose} />
    );
    const closeBtn = container.querySelector('button[aria-label="닫기"]');
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QT-5: "터미널 탭에서 열기" link calls onNavigateToTerminalTab
  it('calls onNavigateToTerminalTab when "터미널 탭에서 열기" is clicked', () => {
    const onNavigateToTerminalTab = vi.fn();
    const { container } = render(
      <QuickTerminal {...defaultProps} onNavigateToTerminalTab={onNavigateToTerminalTab} />
    );
    const navigateBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('터미널 탭에서 열기')
    );
    expect(navigateBtn).toBeDefined();
    fireEvent.click(navigateBtn!);
    expect(onNavigateToTerminalTab).toHaveBeenCalledTimes(1);
  });

  // TC-QT-6: Calls create when no terminals exist
  it('calls create when no terminals exist', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      isConnected: false,
      shell: null,
      status: null,
      terminals: new Map(),
    };
    render(<QuickTerminal {...defaultProps} />);
    expect(mockCreate).toHaveBeenCalled();
  });

  // TC-QT-7: Does not call create when terminals already exist
  it('does not call create when terminals already exist', () => {
    render(<QuickTerminal {...defaultProps} />);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // TC-QT-8: Renders TerminalEmulator when terminalId exists
  it('renders TerminalEmulator when terminalId exists', () => {
    const { getByTestId } = render(
      <QuickTerminal {...defaultProps} />
    );
    expect(getByTestId('terminal-emulator-term-1')).toBeDefined();
  });

  // TC-QT-9: Does not call closeTerminal on unmount (session persistence)
  it('does not call close or closeById on unmount', () => {
    const { unmount } = render(
      <QuickTerminal {...defaultProps} />
    );
    unmount();
    expect(mockClose).not.toHaveBeenCalled();
    expect(mockCloseById).not.toHaveBeenCalled();
  });

  // TC-QT-10: Backdrop click calls onClose (desktop)
  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <QuickTerminal {...defaultProps} onClose={onClose} />
    );
    fireEvent.click(getByTestId('terminal-panel-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QT-11: Escape key calls onClose
  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<QuickTerminal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QT-12: TerminalTab not visited - create called when terminals.size === 0
  it('creates terminal when opened without prior TerminalTab visit', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      isConnected: false,
      shell: null,
      status: null,
      terminals: new Map(),
    };
    render(<QuickTerminal {...defaultProps} />);
    expect(mockCreate).toHaveBeenCalled();
  });

  // TC-QT-13: Shows loading spinner when no terminalId
  it('shows loading spinner when no terminalId', () => {
    mockUseTerminalReturn = {
      ...mockUseTerminalReturn,
      terminalId: null,
      terminals: new Map(),
    };
    const { container } = render(
      <QuickTerminal {...defaultProps} />
    );
    // Loader2 renders an SVG with animate-spin
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  // TC-QT-14: Panel has correct ARIA attributes
  it('has correct ARIA attributes on panel', () => {
    const { getByTestId } = render(
      <QuickTerminal {...defaultProps} />
    );
    const panel = getByTestId('quick-terminal-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('퀵 터미널 패널');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });
});
