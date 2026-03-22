/**
 * RewindConfirmDialog Tests
 * [Source: Story 25.2 - Task 8]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RewindConfirmDialog } from '../RewindConfirmDialog';

describe('RewindConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    actionType: 'rewind' as const,
    messageCount: 3,
    isGitInitialized: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 8.2: Renders with rewind title when actionType is 'rewind'
  it('renders with rewind title when actionType is rewind', () => {
    render(<RewindConfirmDialog {...defaultProps} actionType="rewind" />);

    expect(screen.getByText(/대화 되감기|Rewind Conversation/i)).toBeInTheDocument();
  });

  // 8.3: Renders with regenerate title when actionType is 'regenerate'
  it('renders with regenerate title when actionType is regenerate', () => {
    render(<RewindConfirmDialog {...defaultProps} actionType="regenerate" />);

    expect(screen.getByText(/응답 재생성|Regenerate Response/i)).toBeInTheDocument();
  });

  // 8.4: Default radio selection is 'conversation'
  it('defaults to conversation only radio selection', () => {
    render(<RewindConfirmDialog {...defaultProps} />);

    const conversationRadio = screen.getByTestId('radio-conversation') as HTMLInputElement;
    const codeRadio = screen.getByTestId('radio-conversation-and-code') as HTMLInputElement;

    expect(conversationRadio.checked).toBe(true);
    expect(codeRadio.checked).toBe(false);
  });

  // 8.5: Conversation + Code radio is disabled when isGitInitialized is false
  it('disables Conversation + Code radio when isGitInitialized is false', () => {
    render(<RewindConfirmDialog {...defaultProps} isGitInitialized={false} />);

    const codeRadio = screen.getByTestId('radio-conversation-and-code') as HTMLInputElement;
    expect(codeRadio.disabled).toBe(true);
  });

  it('enables Conversation + Code radio when isGitInitialized is true', () => {
    render(<RewindConfirmDialog {...defaultProps} isGitInitialized={true} />);

    const codeRadio = screen.getByTestId('radio-conversation-and-code') as HTMLInputElement;
    expect(codeRadio.disabled).toBe(false);
  });

  // 8.6: Clicking Confirm calls onConfirm with selected undoMode
  it('calls onConfirm with conversation undoMode by default', () => {
    render(<RewindConfirmDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId('rewind-confirm-button'));
    expect(defaultProps.onConfirm).toHaveBeenCalledWith('conversation');
  });

  it('calls onConfirm with conversationAndCode when that option is selected', () => {
    render(<RewindConfirmDialog {...defaultProps} />);

    const codeRadio = screen.getByTestId('radio-conversation-and-code');
    fireEvent.click(codeRadio);

    fireEvent.click(screen.getByTestId('rewind-confirm-button'));
    expect(defaultProps.onConfirm).toHaveBeenCalledWith('conversationAndCode');
  });

  // 8.7: Clicking Cancel calls onClose
  it('calls onClose when Cancel button is clicked', () => {
    render(<RewindConfirmDialog {...defaultProps} />);

    // Find cancel button by its text content
    const buttons = screen.getAllByRole('button');
    const cancelButton = buttons.find(b => b.textContent?.match(/취소|Cancel/));
    expect(cancelButton).toBeDefined();
    fireEvent.click(cancelButton!);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // 8.8: Escape key closes dialog
  it('closes dialog on Escape key press', () => {
    render(<RewindConfirmDialog {...defaultProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // 8.9: Warning text displays correct messageCount
  it('displays correct messageCount in warning text', () => {
    render(<RewindConfirmDialog {...defaultProps} messageCount={5} />);

    const warning = screen.getByTestId('rewind-warning');
    expect(warning.textContent).toContain('5');
  });

  // Does not render when isOpen is false
  it('does not render when isOpen is false', () => {
    render(<RewindConfirmDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByTestId('rewind-confirm-dialog')).not.toBeInTheDocument();
  });

  // Confirm button shows spinner when isProcessing is true
  it('disables confirm button when isProcessing is true', () => {
    render(<RewindConfirmDialog {...defaultProps} isProcessing={true} />);

    expect(screen.getByTestId('rewind-confirm-button')).toBeDisabled();
  });
});
