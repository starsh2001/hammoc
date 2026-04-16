/**
 * PermissionModeSelector Tests
 * [Source: Story 5.2 - Task 3]
 *
 * The component is a single toggle button that cycles through modes:
 * plan → default → acceptEdits → bypassPermissions → plan...
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
    expect(button).toHaveTextContent('Ask'); // 'default' mode shows 'Ask'
  });

  it('displays correct label for each mode', () => {
    const { rerender } = render(<PermissionModeSelector {...defaultProps} mode="plan" />);
    expect(screen.getByRole('button')).toHaveTextContent('Plan');

    rerender(<PermissionModeSelector {...defaultProps} mode="default" />);
    expect(screen.getByRole('button')).toHaveTextContent('Ask');

    rerender(<PermissionModeSelector {...defaultProps} mode="acceptEdits" />);
    expect(screen.getByRole('button')).toHaveTextContent('Auto');

    rerender(<PermissionModeSelector {...defaultProps} mode="bypassPermissions" />);
    expect(screen.getByRole('button')).toHaveTextContent('Bypass');
  });

  it('cycles to next mode when clicked', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    // Start at 'default' (Ask), next should be 'acceptEdits' (Auto)
    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    await user.click(screen.getByRole('button'));
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('cycles through all modes in order', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<PermissionModeSelector mode="plan" onModeChange={onModeChange} />);

    // plan → default
    await user.click(screen.getByRole('button'));
    expect(onModeChange).toHaveBeenLastCalledWith('default');

    // default → acceptEdits
    rerender(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button'));
    expect(onModeChange).toHaveBeenLastCalledWith('acceptEdits');

    // acceptEdits → bypassPermissions
    rerender(<PermissionModeSelector mode="acceptEdits" onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button'));
    expect(onModeChange).toHaveBeenLastCalledWith('bypassPermissions');

    // bypassPermissions → plan (wrap around)
    rerender(<PermissionModeSelector mode="bypassPermissions" onModeChange={onModeChange} />);
    await user.click(screen.getByRole('button'));
    expect(onModeChange).toHaveBeenLastCalledWith('plan');
  });

  it('disables button when disabled prop is true', () => {
    render(<PermissionModeSelector {...defaultProps} disabled />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('does not call onModeChange when disabled and clicked', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} disabled />);

    await user.click(screen.getByRole('button'));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('has title attribute (tooltip) with description', () => {
    const { rerender } = render(<PermissionModeSelector {...defaultProps} mode="plan" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Claude가 계획만 세우고 파일을 수정하지 않습니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="default" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '파일 수정 전 승인을 요청합니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="acceptEdits" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '파일 수정을 자동으로 승인합니다');

    rerender(<PermissionModeSelector {...defaultProps} mode="bypassPermissions" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '모든 권한 요청을 건너뜁니다');
  });

  it('has aria-label describing current mode and action', () => {
    render(<PermissionModeSelector {...defaultProps} mode="default" />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('권한 모드'));
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('Ask'));
  });

  it('navigates to next mode with ArrowRight key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{ArrowRight}');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('navigates to previous mode with ArrowLeft key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{ArrowLeft}');
    expect(onModeChange).toHaveBeenCalledWith('plan');
  });

  it('wraps around from last to first with ArrowRight', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="bypassPermissions" onModeChange={onModeChange} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{ArrowRight}');
    expect(onModeChange).toHaveBeenCalledWith('plan');
  });

  it('wraps around from first to last with ArrowLeft', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="plan" onModeChange={onModeChange} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{ArrowLeft}');
    expect(onModeChange).toHaveBeenCalledWith('bypassPermissions');
  });

  it('cycles mode with Enter key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{Enter}');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('cycles mode with Space key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{ }');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('does not navigate with arrow keys when disabled', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} disabled />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{ArrowRight}');
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
