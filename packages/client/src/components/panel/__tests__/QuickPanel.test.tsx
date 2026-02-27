/**
 * QuickPanel Component Tests
 * [Source: Story 19.1 - Task 9.2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickPanel } from '../QuickPanel';

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
    projectSlug: 'test-project',
    currentSessionId: 'session-1',
    onSelectSession: vi.fn(),
    onNavigateToGitTab: vi.fn(),
    onNavigateToTerminalTab: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-QP-1: activePanel=null renders nothing
  it('should not render when activePanel is null', () => {
    render(<QuickPanel {...defaultProps} activePanel={null} />);
    expect(screen.queryByTestId('quick-panel')).not.toBeInTheDocument();
  });

  // TC-QP-2: activePanel='sessions' shows panel with "세션 목록" header
  it('should render panel with "세션 목록" header when activePanel is sessions', () => {
    render(<QuickPanel {...defaultProps} activePanel="sessions" />);
    expect(screen.getByTestId('quick-panel')).toBeInTheDocument();
    expect(screen.getByText('세션 목록')).toBeInTheDocument();
  });

  // TC-QP-3: activePanel='files' shows "파일 탐색기" header
  it('should render "파일 탐색기" header when activePanel is files', () => {
    render(<QuickPanel {...defaultProps} activePanel="files" />);
    expect(screen.getByText('파일 탐색기')).toBeInTheDocument();
  });

  // TC-QP-4: activePanel='git' shows "Git" header
  it('should render "Git" header when activePanel is git', () => {
    render(<QuickPanel {...defaultProps} activePanel="git" />);
    expect(screen.getByText('Git')).toBeInTheDocument();
  });

  // TC-QP-5: activePanel='terminal' shows "터미널" header
  it('should render "터미널" header when activePanel is terminal', () => {
    render(<QuickPanel {...defaultProps} activePanel="terminal" />);
    expect(screen.getByText('터미널')).toBeInTheDocument();
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
});
