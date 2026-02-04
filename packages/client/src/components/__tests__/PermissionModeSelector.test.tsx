/**
 * PermissionModeSelector Tests
 * [Source: Story 5.2 - Task 3]
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

  it('renders all three mode buttons (Plan, Ask, Auto)', () => {
    render(<PermissionModeSelector {...defaultProps} />);

    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Ask')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('highlights the currently selected mode', () => {
    render(<PermissionModeSelector {...defaultProps} mode="default" />);

    const askButton = screen.getByText('Ask');
    expect(askButton).toHaveAttribute('aria-checked', 'true');

    const planButton = screen.getByText('Plan');
    expect(planButton).toHaveAttribute('aria-checked', 'false');

    const autoButton = screen.getByText('Auto');
    expect(autoButton).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onModeChange with correct SDK value when clicking a mode', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    await user.click(screen.getByText('Plan'));
    expect(onModeChange).toHaveBeenCalledWith('plan');

    await user.click(screen.getByText('Auto'));
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('disables all buttons when disabled prop is true', () => {
    render(<PermissionModeSelector {...defaultProps} disabled />);

    const buttons = screen.getAllByRole('radio');
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('does not call onModeChange when disabled and clicked', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} disabled />);

    await user.click(screen.getByText('Plan'));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('has title attribute (tooltip) on each button', () => {
    render(<PermissionModeSelector {...defaultProps} />);

    const planButton = screen.getByText('Plan');
    expect(planButton).toHaveAttribute('title', 'Claude가 계획만 세우고 파일을 수정하지 않습니다');

    const askButton = screen.getByText('Ask');
    expect(askButton).toHaveAttribute('title', '파일 수정 전 승인을 요청합니다');

    const autoButton = screen.getByText('Auto');
    expect(autoButton).toHaveAttribute('title', '파일 수정을 자동으로 승인합니다');
  });

  it('has correct ARIA attributes: radiogroup container, radio buttons, aria-checked', () => {
    render(<PermissionModeSelector {...defaultProps} mode="plan" />);

    const radiogroup = screen.getByRole('radiogroup');
    expect(radiogroup).toHaveAttribute('aria-label', 'Permission mode');

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);

    // Plan is selected
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
    expect(radios[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onModeChange when clicking already selected mode', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    await user.click(screen.getByText('Ask'));
    expect(onModeChange).toHaveBeenCalledWith('default');
  });

  it('navigates to next mode with ArrowRight key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    // Focus the Ask button (currently selected, tabIndex=0)
    const askButton = screen.getByText('Ask');
    askButton.focus();

    await user.keyboard('{ArrowRight}');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('navigates to previous mode with ArrowLeft key', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} />);

    const askButton = screen.getByText('Ask');
    askButton.focus();

    await user.keyboard('{ArrowLeft}');
    expect(onModeChange).toHaveBeenCalledWith('plan');
  });

  it('wraps around from last to first with ArrowRight', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="acceptEdits" onModeChange={onModeChange} />);

    const autoButton = screen.getByText('Auto');
    autoButton.focus();

    await user.keyboard('{ArrowRight}');
    expect(onModeChange).toHaveBeenCalledWith('plan');
  });

  it('wraps around from first to last with ArrowLeft', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="plan" onModeChange={onModeChange} />);

    const planButton = screen.getByText('Plan');
    planButton.focus();

    await user.keyboard('{ArrowLeft}');
    expect(onModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('has roving tabindex: selected button tabIndex=0, others tabIndex=-1', () => {
    render(<PermissionModeSelector {...defaultProps} mode="default" />);

    const radios = screen.getAllByRole('radio');
    // Plan
    expect(radios[0]).toHaveAttribute('tabindex', '-1');
    // Ask (selected)
    expect(radios[1]).toHaveAttribute('tabindex', '0');
    // Auto
    expect(radios[2]).toHaveAttribute('tabindex', '-1');
  });

  it('does not navigate with arrow keys when disabled', async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(<PermissionModeSelector mode="default" onModeChange={onModeChange} disabled />);

    const askButton = screen.getByText('Ask');
    askButton.focus();

    await user.keyboard('{ArrowRight}');
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
