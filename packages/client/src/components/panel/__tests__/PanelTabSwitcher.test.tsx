/**
 * PanelTabSwitcher Component Tests
 * [Source: Story 19.2 - Task 6]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock content components to prevent xterm.js and socket.io import errors
vi.mock('../../SessionQuickAccessPanel', () => ({
  SessionQuickAccessPanel: () => <div data-testid="session-panel-content" />,
}));
vi.mock('../../files/QuickFileExplorer', () => ({
  QuickFileExplorer: () => <div data-testid="file-explorer-content" />,
}));
vi.mock('../../git/QuickGitPanel', () => ({
  QuickGitPanel: () => <div data-testid="git-panel-content" />,
}));
vi.mock('../../terminal/QuickTerminal', () => ({
  QuickTerminal: () => <div data-testid="terminal-panel-content" />,
}));

import { PanelTabSwitcher } from '../PanelTabSwitcher';

describe('PanelTabSwitcher', () => {
  const defaultProps = {
    activePanel: 'sessions' as const,
    onSwitchPanel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-PTS-1: Renders 4 tab buttons (AC: 1)
  it('renders 4 tab buttons with correct test ids', () => {
    render(<PanelTabSwitcher {...defaultProps} />);

    expect(screen.getByTestId('panel-tab-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('panel-tab-files')).toBeInTheDocument();
    expect(screen.getByTestId('panel-tab-git')).toBeInTheDocument();
    expect(screen.getByTestId('panel-tab-terminal')).toBeInTheDocument();
  });

  // TC-PTS-2: Each tab has role="tab" (AC: 1)
  it('renders tabs with role="tab"', () => {
    render(<PanelTabSwitcher {...defaultProps} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  // TC-PTS-3: Container has role="tablist" (AC: 1)
  it('has tablist container with aria-label', () => {
    render(<PanelTabSwitcher {...defaultProps} />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute('aria-label', '패널 탭');
  });

  // TC-PTS-4: Active tab highlight (AC: 2)
  it('highlights active tab with aria-selected', () => {
    render(<PanelTabSwitcher {...defaultProps} activePanel="sessions" />);

    expect(screen.getByTestId('panel-tab-sessions')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('panel-tab-files')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('panel-tab-git')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('panel-tab-terminal')).toHaveAttribute('aria-selected', 'false');
  });

  // TC-PTS-5: Active tab changes with prop (AC: 2)
  it('highlights git tab when activePanel is git', () => {
    render(<PanelTabSwitcher {...defaultProps} activePanel="git" />);

    expect(screen.getByTestId('panel-tab-git')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('panel-tab-sessions')).toHaveAttribute('aria-selected', 'false');
  });

  // TC-PTS-6: Tab click calls onSwitchPanel (AC: 3)
  it('calls onSwitchPanel when a tab is clicked', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} onSwitchPanel={onSwitchPanel} />);

    fireEvent.click(screen.getByTestId('panel-tab-files'));
    expect(onSwitchPanel).toHaveBeenCalledWith('files');
  });

  // TC-PTS-7: Active tab click also calls onSwitchPanel (no-op)
  it('calls onSwitchPanel when active tab is clicked', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} onSwitchPanel={onSwitchPanel} activePanel="sessions" />);

    fireEvent.click(screen.getByTestId('panel-tab-sessions'));
    expect(onSwitchPanel).toHaveBeenCalledWith('sessions');
  });

  // TC-PTS-8: Terminal disabled when not accessible (AC: 5)
  it('disables terminal tab when terminalAccessible is false', () => {
    render(<PanelTabSwitcher {...defaultProps} terminalAccessible={false} />);

    const terminalTab = screen.getByTestId('panel-tab-terminal');
    expect(terminalTab).toBeDisabled();
    expect(terminalTab).toHaveAttribute('aria-disabled', 'true');
  });

  // TC-PTS-9: Disabled terminal tab click does not call onSwitchPanel (AC: 5)
  it('does not call onSwitchPanel when disabled terminal tab is clicked', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} onSwitchPanel={onSwitchPanel} terminalAccessible={false} />);

    fireEvent.click(screen.getByTestId('panel-tab-terminal'));
    expect(onSwitchPanel).not.toHaveBeenCalled();
  });

  // TC-PTS-10: Terminal tab enabled by default (AC: 5)
  it('enables terminal tab by default', () => {
    render(<PanelTabSwitcher {...defaultProps} />);

    const terminalTab = screen.getByTestId('panel-tab-terminal');
    expect(terminalTab).not.toBeDisabled();
  });

  // TC-PTS-11: Disabled terminal has tooltip with "(접근 불가)" (AC: 5)
  it('shows inaccessible tooltip on disabled terminal tab', () => {
    render(<PanelTabSwitcher {...defaultProps} terminalAccessible={false} />);

    const terminalTab = screen.getByTestId('panel-tab-terminal');
    expect(terminalTab).toHaveAttribute('title', '터미널 (접근 불가)');
  });

  // TC-PTS-12: ArrowRight moves to next tab (AC: 1, 2)
  it('navigates to next tab on ArrowRight', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="sessions" onSwitchPanel={onSwitchPanel} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onSwitchPanel).toHaveBeenCalledWith('files');
  });

  // TC-PTS-13: ArrowLeft wraps to last enabled tab (AC: 1, 2)
  it('wraps to last enabled tab on ArrowLeft from first tab', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="sessions" onSwitchPanel={onSwitchPanel} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(onSwitchPanel).toHaveBeenCalledWith('terminal');
  });

  // TC-PTS-14: ArrowLeft wraps to git when terminal disabled (AC: 1, 2)
  it('wraps to git on ArrowLeft from sessions when terminal disabled', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="sessions" onSwitchPanel={onSwitchPanel} terminalAccessible={false} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(onSwitchPanel).toHaveBeenCalledWith('git');
  });

  // TC-PTS-15: Home key moves to first tab
  it('moves to first tab on Home key', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="git" onSwitchPanel={onSwitchPanel} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(onSwitchPanel).toHaveBeenCalledWith('sessions');
  });

  // TC-PTS-16: End key moves to last enabled tab
  it('moves to last enabled tab on End key', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="sessions" onSwitchPanel={onSwitchPanel} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onSwitchPanel).toHaveBeenCalledWith('terminal');
  });

  // TC-PTS-17: End key moves to git when terminal disabled
  it('moves to git on End key when terminal disabled', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="sessions" onSwitchPanel={onSwitchPanel} terminalAccessible={false} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onSwitchPanel).toHaveBeenCalledWith('git');
  });

  // TC-PTS-18: Arrow navigation skips disabled terminal tab
  it('skips disabled terminal tab during arrow navigation', () => {
    const onSwitchPanel = vi.fn();
    render(<PanelTabSwitcher {...defaultProps} activePanel="git" onSwitchPanel={onSwitchPanel} terminalAccessible={false} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onSwitchPanel).toHaveBeenCalledWith('sessions');
  });

  // TC-PTS-19: tabIndex roving (AC: 1, 2)
  it('sets tabIndex=0 on active tab and tabIndex=-1 on others', () => {
    render(<PanelTabSwitcher {...defaultProps} activePanel="files" />);

    expect(screen.getByTestId('panel-tab-files')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('panel-tab-sessions')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('panel-tab-git')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('panel-tab-terminal')).toHaveAttribute('tabindex', '-1');
  });
});
