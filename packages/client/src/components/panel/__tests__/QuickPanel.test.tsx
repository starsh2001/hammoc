/**
 * QuickPanel Component Tests
 * [Source: Story 19.1 - Task 9.2, Story 19.2 - Task 7, Story 19.3 - Task 8]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickPanel } from '../QuickPanel';

// Mock PanelTabSwitcher
vi.mock('../PanelTabSwitcher', () => ({
  PanelTabSwitcher: ({ activePanel, onSwitchPanel }: any) => (
    <div data-testid="panel-tab-switcher" data-active-panel={activePanel}>
      <button data-testid="panel-tab-files" onClick={() => onSwitchPanel('files')}>Files</button>
      <button data-testid="panel-tab-sessions" onClick={() => onSwitchPanel('sessions')}>Sessions</button>
      <button data-testid="panel-tab-git" onClick={() => onSwitchPanel('git')}>Git</button>
      <button data-testid="panel-tab-terminal" onClick={() => onSwitchPanel('terminal')}>Terminal</button>
    </div>
  ),
}));

// Mock ResizablePanel (ResizableHandle)
vi.mock('../ResizablePanel', () => ({
  ResizableHandle: ({ onWidthChange }: any) => (
    <div data-testid="panel-resize-handle" onClick={() => onWidthChange(400)} />
  ),
}));

// Mock content components
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

describe('QuickPanel', () => {
  const defaultProps = {
    activePanel: null as any,
    onClose: vi.fn(),
    onSwitchPanel: vi.fn(),
    projectSlug: 'test-project',
    currentSessionId: 'session-1',
    onSelectSession: vi.fn(),
    onNavigateToGitTab: vi.fn(),
    onNavigateToTerminalTab: vi.fn(),
    panelWidth: 320,
    onWidthChange: vi.fn(),
    isMobile: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-QP-1: activePanel=null renders nothing
  it('should not render when activePanel is null', () => {
    render(<QuickPanel {...defaultProps} activePanel={null} />);
    expect(screen.queryByTestId('quick-panel')).not.toBeInTheDocument();
  });

  // TC-QP-2: activePanel='sessions' shows panel with PanelTabSwitcher
  it('should render panel with PanelTabSwitcher when activePanel is sessions', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    expect(screen.getByTestId('quick-panel')).toBeInTheDocument();
    expect(screen.getByTestId('panel-tab-switcher')).toBeInTheDocument();
  });

  // TC-QP-3: PanelTabSwitcher receives correct activePanel
  it('should pass correct activePanel to PanelTabSwitcher', () => {
    render(<QuickPanel {...defaultProps} activePanel="files" />);
    expect(screen.getByTestId('panel-tab-switcher')).toHaveAttribute('data-active-panel', 'files');
  });

  // TC-QP-6: Close button calls onClose
  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<QuickPanel {...defaultProps} activePanel="sessions" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QP-7: Escape key calls onClose
  it('should call onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<QuickPanel {...defaultProps} activePanel="sessions" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QP-8: Backdrop click calls onClose
  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<QuickPanel {...defaultProps} activePanel="sessions" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('quick-panel-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QP-9: Panel has role="dialog" and aria-modal="true"
  it('should have role="dialog" and aria-modal="true"', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    const panel = screen.getByTestId('quick-panel');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
  });

  // TC-QP-10: Renders correct content for each panel type
  it('should render SessionQuickAccessPanel content for sessions', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    expect(screen.getByTestId('session-panel-content')).toBeInTheDocument();
  });

  it('should render QuickFileExplorer content for files', () => {
    render(<QuickPanel {...defaultProps} activePanel="files" />);
    expect(screen.getByTestId('file-explorer-content')).toBeInTheDocument();
  });

  it('should render QuickGitPanel content for git', () => {
    render(<QuickPanel {...defaultProps} activePanel="git" />);
    expect(screen.getByTestId('git-panel-content')).toBeInTheDocument();
  });

  it('should render QuickTerminal content for terminal', () => {
    render(<QuickPanel {...defaultProps} activePanel="terminal" />);
    expect(screen.getByTestId('terminal-panel-content')).toBeInTheDocument();
  });

  // TC-QP-11: Panel has correct aria-label per type
  it('should have correct aria-label for each panel type', () => {
    const { rerender } = render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    expect(screen.getByTestId('quick-panel')).toHaveAttribute('aria-label', '세션 목록');

    rerender(<QuickPanel {...defaultProps} activePanel="git" />);
    expect(screen.getByTestId('quick-panel')).toHaveAttribute('aria-label', 'Git');
  });

  // TC-QP-12: Backdrop has aria-hidden="true"
  it('should have aria-hidden on backdrop', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    expect(screen.getByTestId('quick-panel-backdrop')).toHaveAttribute('aria-hidden', 'true');
  });

  // TC-QP-13: Content area has data-testid
  it('should have quick-panel-content test id', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    expect(screen.getByTestId('quick-panel-content')).toBeInTheDocument();
  });

  // TC-QP-14: Panel switch via onSwitchPanel (AC: 3)
  it('should call onSwitchPanel when tab is clicked in PanelTabSwitcher', () => {
    const onSwitchPanel = vi.fn();
    render(<QuickPanel {...defaultProps} activePanel="sessions" onSwitchPanel={onSwitchPanel} />);

    fireEvent.click(screen.getByTestId('panel-tab-files'));
    expect(onSwitchPanel).toHaveBeenCalledWith('files');
  });

  // TC-QP-15: State preservation - both panels in DOM after switch (AC: 4)
  it('should keep both sessions and files panels in DOM after switching', () => {
    const { rerender } = render(
      <QuickPanel {...defaultProps} activePanel="sessions" />
    );

    // Sessions panel mounted
    expect(screen.getByTestId('quick-panel-content-sessions')).toBeInTheDocument();

    // Switch to files
    rerender(
      <QuickPanel {...defaultProps} activePanel="files" />
    );

    // Both panels mounted
    expect(screen.getByTestId('quick-panel-content-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('quick-panel-content-files')).toBeInTheDocument();
  });

  // TC-QP-16: Inactive panel has invisible class (AC: 4)
  it('should apply invisible class to inactive panel', () => {
    const { rerender } = render(
      <QuickPanel {...defaultProps} activePanel="sessions" />
    );

    rerender(
      <QuickPanel {...defaultProps} activePanel="files" />
    );

    expect(screen.getByTestId('quick-panel-content-sessions')).toHaveClass('invisible');
    expect(screen.getByTestId('quick-panel-content-files')).not.toHaveClass('invisible');
  });

  // TC-QP-17: Inactive panel has inert attribute (AC: 4)
  it('should apply inert attribute to inactive panel', () => {
    const { rerender } = render(
      <QuickPanel {...defaultProps} activePanel="sessions" />
    );

    rerender(
      <QuickPanel {...defaultProps} activePanel="files" />
    );

    expect(screen.getByTestId('quick-panel-content-sessions')).toHaveAttribute('inert', '');
    expect(screen.getByTestId('quick-panel-content-files')).not.toHaveAttribute('inert');
  });

  // TC-QP-18: Content panels have role="tabpanel"
  it('should render content panels with role="tabpanel"', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);

    expect(screen.getByTestId('quick-panel-content-sessions')).toHaveAttribute('role', 'tabpanel');
  });

  // TC-QP-19: Only visited panels are in DOM
  it('should only mount visited panels', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);

    expect(screen.getByTestId('quick-panel-content-sessions')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-panel-content-files')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-panel-content-git')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-panel-content-terminal')).not.toBeInTheDocument();
  });

  // Story 19.3 — Resize handle integration tests

  // TC-QP-20: Resize handle shown on desktop (isMobile=false)
  it('should show resize handle when isMobile is false', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" isMobile={false} />);
    expect(screen.getByTestId('panel-resize-handle')).toBeInTheDocument();
  });

  // TC-QP-21: Resize handle hidden on mobile (isMobile=true)
  it('should hide resize handle when isMobile is true', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" isMobile={true} />);
    expect(screen.queryByTestId('panel-resize-handle')).not.toBeInTheDocument();
  });

  // TC-QP-22: Inline width applied on desktop
  it('should apply inline width style when isMobile is false', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" panelWidth={400} isMobile={false} />);
    const panel = screen.getByTestId('quick-panel');
    expect(panel.style.width).toBe('400px');
  });

  // TC-QP-23: No inline width on mobile
  it('should not apply inline width style when isMobile is true', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" panelWidth={400} isMobile={true} />);
    const panel = screen.getByTestId('quick-panel');
    expect(panel.style.width).toBe('');
  });

  // TC-QP-24: widthClass removed — no md:w-80 or md:w-96 classes
  it('should not have md:w-80 or md:w-96 classes', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    const panel = screen.getByTestId('quick-panel');
    expect(panel.className).not.toContain('md:w-80');
    expect(panel.className).not.toContain('md:w-96');
  });

  it('should not have md:w-96 class for terminal panel', () => {
    render(<QuickPanel {...defaultProps} activePanel="terminal" />);
    const panel = screen.getByTestId('quick-panel');
    expect(panel.className).not.toContain('md:w-96');
  });
});
