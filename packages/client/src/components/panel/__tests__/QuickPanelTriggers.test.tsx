/**
 * QuickPanelTriggers Component Tests
 * [Source: Story 19.4 - Task 5]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickPanelTriggers } from '../QuickPanelTriggers';

describe('QuickPanelTriggers', () => {
  const defaultProps = {
    activePanel: null as null,
    onTogglePanel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-QPT-1: Renders 4 trigger icons (AC: 1)
  it('renders 4 trigger buttons with correct test ids', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    expect(screen.getByTestId('panel-trigger-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('panel-trigger-files')).toBeInTheDocument();
    expect(screen.getByTestId('panel-trigger-git')).toBeInTheDocument();
    expect(screen.getByTestId('panel-trigger-terminal')).toBeInTheDocument();
  });

  // TC-QPT-2: Each button has correct aria-label (AC: 1)
  it('renders buttons with correct aria-labels', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    expect(screen.getByLabelText('세션 목록')).toBeInTheDocument();
    expect(screen.getByLabelText('파일 탐색기')).toBeInTheDocument();
    expect(screen.getByLabelText('Git 패널')).toBeInTheDocument();
    expect(screen.getByLabelText('터미널')).toBeInTheDocument();
  });

  // TC-QPT-3: Click sessions trigger calls onTogglePanel('sessions') (AC: 2)
  it('calls onTogglePanel with "sessions" when sessions trigger is clicked', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    fireEvent.click(screen.getByTestId('panel-trigger-sessions'));
    expect(defaultProps.onTogglePanel).toHaveBeenCalledWith('sessions');
  });

  // TC-QPT-4: Click files trigger calls onTogglePanel('files') (AC: 2)
  it('calls onTogglePanel with "files" when files trigger is clicked', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    fireEvent.click(screen.getByTestId('panel-trigger-files'));
    expect(defaultProps.onTogglePanel).toHaveBeenCalledWith('files');
  });

  // TC-QPT-5: Click git trigger calls onTogglePanel('git') (AC: 2)
  it('calls onTogglePanel with "git" when git trigger is clicked', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    fireEvent.click(screen.getByTestId('panel-trigger-git'));
    expect(defaultProps.onTogglePanel).toHaveBeenCalledWith('git');
  });

  // TC-QPT-6: Click terminal trigger calls onTogglePanel('terminal') (AC: 2)
  it('calls onTogglePanel with "terminal" when terminal trigger is clicked', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    fireEvent.click(screen.getByTestId('panel-trigger-terminal'));
    expect(defaultProps.onTogglePanel).toHaveBeenCalledWith('terminal');
  });

  // TC-QPT-7: Active panel has aria-pressed="true" (AC: 3)
  it('sets aria-pressed="true" on the active panel trigger', () => {
    render(<QuickPanelTriggers {...defaultProps} activePanel="sessions" />);

    expect(screen.getByTestId('panel-trigger-sessions')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('panel-trigger-files')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('panel-trigger-git')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('panel-trigger-terminal')).toHaveAttribute('aria-pressed', 'false');
  });

  // TC-QPT-8: Active panel has highlight style (AC: 3)
  it('applies active highlight class to active panel trigger', () => {
    render(<QuickPanelTriggers {...defaultProps} activePanel="sessions" />);

    const sessionsBtn = screen.getByTestId('panel-trigger-sessions');
    expect(sessionsBtn.className).toContain('bg-blue-100');
  });

  // TC-QPT-9: No active panel — all aria-pressed="false" (AC: 3)
  it('sets aria-pressed="false" on all triggers when no panel is active', () => {
    render(<QuickPanelTriggers {...defaultProps} activePanel={null} />);

    expect(screen.getByTestId('panel-trigger-sessions')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('panel-trigger-files')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('panel-trigger-git')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('panel-trigger-terminal')).toHaveAttribute('aria-pressed', 'false');
  });

  // TC-QPT-10: Git badge shows count (AC: 1)
  it('shows git badge with count when gitChangedCount > 0', () => {
    render(<QuickPanelTriggers {...defaultProps} gitChangedCount={5} />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // TC-QPT-11: Git badge hidden when count is 0 (AC: 1)
  it('does not show git badge when gitChangedCount is 0', () => {
    render(<QuickPanelTriggers {...defaultProps} gitChangedCount={0} />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  // TC-QPT-12: Git badge hidden when count is undefined (AC: 1)
  it('does not show git badge when gitChangedCount is not provided', () => {
    const { container } = render(<QuickPanelTriggers {...defaultProps} />);

    const gitTrigger = screen.getByTestId('panel-trigger-git');
    const badge = gitTrigger.querySelector('.bg-red-500');
    expect(badge).not.toBeInTheDocument();
  });

  // TC-QPT-13: Terminal disabled when not accessible (AC: 1)
  it('disables terminal trigger when terminalAccessible is false', () => {
    render(<QuickPanelTriggers {...defaultProps} terminalAccessible={false} />);

    const terminalBtn = screen.getByTestId('panel-trigger-terminal');
    expect(terminalBtn).toBeDisabled();
  });

  // TC-QPT-14: Disabled terminal click does not call onTogglePanel (AC: 1)
  it('does not call onTogglePanel when disabled terminal trigger is clicked', () => {
    render(<QuickPanelTriggers {...defaultProps} terminalAccessible={false} />);

    fireEvent.click(screen.getByTestId('panel-trigger-terminal'));
    expect(defaultProps.onTogglePanel).not.toHaveBeenCalled();
  });

  // TC-QPT-15: Disabled terminal has aria-disabled (AC: 1)
  it('sets aria-disabled on disabled terminal trigger', () => {
    render(<QuickPanelTriggers {...defaultProps} terminalAccessible={false} />);

    expect(screen.getByTestId('panel-trigger-terminal')).toHaveAttribute('aria-disabled', 'true');
  });

  // TC-QPT-16: Disabled terminal has opacity style (AC: 1)
  it('applies disabled styles to terminal trigger when not accessible', () => {
    render(<QuickPanelTriggers {...defaultProps} terminalAccessible={false} />);

    const terminalBtn = screen.getByTestId('panel-trigger-terminal');
    expect(terminalBtn.className).toContain('opacity-50');
    expect(terminalBtn.className).toContain('cursor-not-allowed');
  });

  // TC-QPT-17: Container has role="toolbar" (AC: 1)
  it('renders container with role="toolbar" and aria-label', () => {
    render(<QuickPanelTriggers {...defaultProps} />);

    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('aria-label', '퀵 패널');
  });
});
