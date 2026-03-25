/**
 * RewindConfirmDialog Tests
 * [Source: Story 25.3 - Task 6]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RewindConfirmDialog } from '../RewindConfirmDialog';
import type { RewindConfirmDialogProps } from '../RewindConfirmDialog';
import type { RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';

const defaultDryRun: RewindFilesResult = {
  canRewind: true,
  filesChanged: ['src/index.ts', 'src/utils.ts'],
  insertions: 10,
  deletions: 5,
};

const cannotRewindResult: RewindFilesResult = {
  canRewind: false,
  error: 'No file checkpoint available',
};

function renderDialog(overrides: Partial<RewindConfirmDialogProps> = {}) {
  const props: RewindConfirmDialogProps = {
    isOpen: true,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    dryRunResult: defaultDryRun,
    ...overrides,
  };
  const result = render(<RewindConfirmDialog {...props} />);
  return { ...result, props };
}

describe('RewindConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 6.2: Renders all 5 options when canRewind is true
  it('renders all 5 options when dryRunResult.canRewind is true', () => {
    renderDialog();

    const buttons = screen.getAllByRole('button', { hidden: false });
    // 5 option buttons + 1 close (X) button in header = 6
    expect(buttons.length).toBeGreaterThanOrEqual(5);

    // Check option buttons exist by data-option attribute
    expect(document.querySelector('[data-option="restore-all"]')).toBeInTheDocument();
    expect(document.querySelector('[data-option="restore-conversation"]')).toBeInTheDocument();
    expect(document.querySelector('[data-option="restore-code"]')).toBeInTheDocument();
    expect(document.querySelector('[data-option="summarize"]')).toBeInTheDocument();
    expect(document.querySelector('[data-option="cancel"]')).toBeInTheDocument();
  });

  // 6.3: Disables code-related options when canRewind is false
  it('disables code-related options when canRewind is false', () => {
    renderDialog({ dryRunResult: cannotRewindResult });

    const restoreAll = document.querySelector(
      '[data-option="restore-all"]'
    ) as HTMLButtonElement;
    const restoreCode = document.querySelector(
      '[data-option="restore-code"]'
    ) as HTMLButtonElement;
    const restoreConvo = document.querySelector(
      '[data-option="restore-conversation"]'
    ) as HTMLButtonElement;
    const summarize = document.querySelector(
      '[data-option="summarize"]'
    ) as HTMLButtonElement;

    expect(restoreAll).toBeDisabled();
    expect(restoreCode).toBeDisabled();
    expect(restoreConvo).not.toBeDisabled();
    expect(summarize).not.toBeDisabled();
  });

  // 6.4: Displays file list and change stats from dryRunResult
  it('displays file list and change stats from dryRunResult', () => {
    renderDialog();

    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    // Check insertions/deletions are displayed (Korean text from i18n)
    expect(screen.getByText(/10/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  // 6.5: Shows loading state when dryRunResult is null
  it('shows loading state when dryRunResult is null', () => {
    renderDialog({ dryRunResult: null });

    // LoadingSpinner has role="status"
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // 6.6: Calls onSelect with correct RewindOption value on button click
  it('calls onSelect with correct RewindOption value on button click', () => {
    const { props } = renderDialog();

    const restoreAll = document.querySelector(
      '[data-option="restore-all"]'
    ) as HTMLButtonElement;
    fireEvent.click(restoreAll);
    expect(props.onSelect).toHaveBeenCalledWith('restore-all');

    const restoreConvo = document.querySelector(
      '[data-option="restore-conversation"]'
    ) as HTMLButtonElement;
    fireEvent.click(restoreConvo);
    expect(props.onSelect).toHaveBeenCalledWith('restore-conversation');

    const restoreCode = document.querySelector(
      '[data-option="restore-code"]'
    ) as HTMLButtonElement;
    fireEvent.click(restoreCode);
    expect(props.onSelect).toHaveBeenCalledWith('restore-code');

    const summarize = document.querySelector(
      '[data-option="summarize"]'
    ) as HTMLButtonElement;
    fireEvent.click(summarize);
    expect(props.onSelect).toHaveBeenCalledWith('summarize');
  });

  // 6.7: Calls onClose on Escape key press
  it('calls onClose on Escape key press', () => {
    const { props } = renderDialog();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  // 6.8: Does not render when isOpen is false
  it('does not render when isOpen is false', () => {
    renderDialog({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // 6.9: Calls onClose on backdrop click
  it('calls onClose on backdrop click', () => {
    const { props } = renderDialog();

    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalled();
  });

  // 6.10: Focus is trapped within modal
  it('traps focus within modal on Tab key', () => {
    renderDialog();

    const modal = document.querySelector('[role="dialog"] > div') as HTMLElement;
    const buttons = Array.from(
      modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    expect(buttons.length).toBeGreaterThan(0);

    const lastButton = buttons[buttons.length - 1];
    lastButton.focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  // Cancel button calls onClose (not onSelect)
  it('cancel button calls onClose', () => {
    const { props } = renderDialog();

    const cancelBtn = document.querySelector(
      '[data-option="cancel"]'
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });
});
