/**
 * MessageEditForm Tests
 * [Source: Story 25.6 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageEditForm } from '../MessageEditForm';

describe('MessageEditForm', () => {
  const defaultProps = {
    initialText: 'Hello World',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills textarea with initial text', () => {
    render(<MessageEditForm {...defaultProps} />);

    const textarea = screen.getByTestId('message-edit-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello World');
  });

  it('calls onSubmit with edited text and restoreCode on accept click', () => {
    render(<MessageEditForm {...defaultProps} />);

    const textarea = screen.getByTestId('message-edit-textarea');
    fireEvent.change(textarea, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByTestId('edit-accept-button'));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith('Updated text', false);
  });

  it('calls onCancel on cancel click', () => {
    render(<MessageEditForm {...defaultProps} />);

    fireEvent.click(screen.getByTestId('edit-cancel-button'));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables accept button when text is empty', () => {
    render(<MessageEditForm {...defaultProps} />);

    const textarea = screen.getByTestId('message-edit-textarea');
    fireEvent.change(textarea, { target: { value: '   ' } });

    expect(screen.getByTestId('edit-accept-button')).toBeDisabled();
  });

  it('toggles restoreCode checkbox value', () => {
    render(<MessageEditForm {...defaultProps} />);

    const checkbox = screen.getByTestId('restore-code-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // Submit with restoreCode = true
    fireEvent.click(screen.getByTestId('edit-accept-button'));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith('Hello World', true);
  });

  it('calls onCancel on Escape key', () => {
    render(<MessageEditForm {...defaultProps} />);

    const textarea = screen.getByTestId('message-edit-textarea');
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit on Ctrl+Enter', () => {
    render(<MessageEditForm {...defaultProps} />);

    const textarea = screen.getByTestId('message-edit-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(defaultProps.onSubmit).toHaveBeenCalledWith('Hello World', false);
  });

  it('does not call onSubmit on Ctrl+Enter when text is empty', () => {
    render(<MessageEditForm {...defaultProps} initialText="" />);

    const textarea = screen.getByTestId('message-edit-textarea');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('shows empty warning when text is cleared', () => {
    render(<MessageEditForm {...defaultProps} />);

    const textarea = screen.getByTestId('message-edit-textarea');
    fireEvent.change(textarea, { target: { value: '' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
