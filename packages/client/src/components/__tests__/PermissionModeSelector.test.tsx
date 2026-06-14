/**
 * PermissionModeSelector Tests
 * [Source: Story 5.2 - Task 3; unified SDK/CLI set 2026-06-14]
 *
 * Single toggle button cycling claude's modes in Shift+Tab order:
 * Ask(default) → Edits(acceptEdits) → Plan(plan) → Auto(auto) → Bypass(bypassPermissions) → wrap.
 * "Edits"=acceptEdits, "Auto"=claude's classifier `auto` (distinct modes — previously conflated).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionModeSelector } from '../PermissionModeSelector';

describe('PermissionModeSelector', () => {
  const defaultProps = {
    mode: 'default' as const,
    onModeChange: vi.fn(),
  };

  it('renders a button with current mode label', () => {
    render(<PermissionModeSelector {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Ask'); // 'default' → 'Ask'
  });

  it('displays correct label for each mode (Edits=acceptEdits, Auto=classifier)', () => {
    const { rerender } = render(<PermissionModeSelector {...defaultProps} mode="default" />);
    expect(screen.getByRole('button')).toHaveTextContent('Ask');

    rerender(<PermissionModeSelector {...defaultProps} mode="acceptEdits" />);
    expect(screen.getByRole('button')).toHaveTextContent('Edits');

    rerender(<PermissionModeSelector {...defaultProps} mode="plan" />);
    expect(screen.getByRole('button')).toHaveTextContent('Plan');

    rerender(<PermissionModeSelector {...defaultProps} mode="auto" />);
    expect(screen.getByRole('button')).toHaveTextContent('Auto');

    rerender(<PermissionModeSelector {...defaultProps} mode="bypassPermissions" />);
    expect(screen.getByRole('button')).toHaveTextContent('Bypass');
  });

  it('cycles to next mode when clicked (default → acceptEdits)', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button'));
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it("cycles through all modes in claude's order (wraps around)", async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    const seq = [
      ['default', 'acceptEdits'],
      ['acceptEdits', 'plan'],
      ['plan', 'auto'],
      ['auto', 'bypassPermissions'],
      ['bypassPermissions', 'default'], // wrap
    ] as const;
    const { rerender } = render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    for (const [from, to] of seq) {
      rerender(<PermissionModeSelector mode={from} onModeChange={onModeChange} />);
      await user.click(screen.getByRole('button'));
      expect(onModeChange).toHaveBeenLastCalledWith(to);
    }
  });

  it('disables button when disabled prop is true', () => {
    render(<PermissionModeSelector {...defaultProps} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onModeChange when disabled and clicked', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} disabled />);
    await user.click(screen.getByRole('button'));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('has title attribute (tooltip) with description for each mode', () => {
    const { rerender } = render(<PermissionModeSelector {...defaultProps} mode="plan" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Claude가 계획만 세우고 파일을 수정하지 않습니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="default" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '파일 수정 전 승인을 요청합니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="acceptEdits" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '파일 수정을 자동으로 승인합니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="auto" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '안전한 작업은 자동 승인하고 위험한 작업만 확인합니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="bypassPermissions" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '모든 권한 요청을 건너뜁니다');
  });

  it('has aria-label describing current mode and action', () => {
    render(<PermissionModeSelector {...defaultProps} mode="default" />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('권한 모드'));
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('Ask'));
  });

  it('navigates to next mode with ArrowRight key (default → acceptEdits)', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    screen.getByRole('button').focus();
    await user.keyboard('{ArrowRight}');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('navigates to previous mode with ArrowLeft key (default wraps back to bypass)', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    screen.getByRole('button').focus();
    await user.keyboard('{ArrowLeft}');
    expect(onModeChange).toHaveBeenCalledWith('bypassPermissions');
  });

  it('wraps around from last (bypass) to first (default) with ArrowRight', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="bypassPermissions" onModeChange={onModeChange} />);
    screen.getByRole('button').focus();
    await user.keyboard('{ArrowRight}');
    expect(onModeChange).toHaveBeenCalledWith('default');
  });

  it('cycles mode with Enter key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('cycles mode with Space key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    screen.getByRole('button').focus();
    await user.keyboard('{ }');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('does not navigate with arrow keys when disabled', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} disabled />);
    screen.getByRole('button').focus();
    await user.keyboard('{ArrowRight}');
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
