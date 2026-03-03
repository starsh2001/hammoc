/**
 * IssueFormDialog Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueFormDialog } from '../IssueFormDialog';

describe('IssueFormDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('should not render when open is false', () => {
    render(
      <IssueFormDialog open={false} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    expect(screen.queryByText('이슈 추가')).not.toBeInTheDocument();
  });

  it('should render when open is true', () => {
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    expect(screen.getByRole('heading', { name: '이슈 추가' })).toBeInTheDocument();
    expect(screen.getByLabelText(/제목/)).toBeInTheDocument();
    expect(screen.getByLabelText(/설명/)).toBeInTheDocument();
  });

  it('should disable submit button when title is empty', () => {
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    const submitButton = screen.getByRole('button', { name: '이슈 추가' });
    expect(submitButton).toBeDisabled();
  });

  it('should disable submit button when title is only whitespace', async () => {
    const user = userEvent.setup();
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    await user.type(screen.getByLabelText(/제목/), '   ');
    const submitButton = screen.getByRole('button', { name: '이슈 추가' });
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when title has non-whitespace content', async () => {
    const user = userEvent.setup();
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    await user.type(screen.getByLabelText(/제목/), 'Valid title');
    const submitButton = screen.getByRole('button', { name: '이슈 추가' });
    expect(submitButton).not.toBeDisabled();
  });

  it('should call onSubmit with trimmed data and reset form on success', async () => {
    const user = userEvent.setup();
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    await user.type(screen.getByLabelText(/제목/), '  New Bug  ');
    await user.type(screen.getByLabelText(/설명/), 'Description text');
    await user.click(screen.getByRole('button', { name: '이슈 추가' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'New Bug',
        description: 'Description text',
      });
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close dialog when Escape key is pressed', () => {
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close dialog when overlay is clicked', () => {
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    // Click overlay (bg-black/50)
    const overlay = document.querySelector('.bg-black\\/50');
    if (overlay) {
      fireEvent.click(overlay);
    }
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close dialog when close button is clicked', () => {
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    fireEvent.click(screen.getByLabelText('닫기'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not close or reset form when submit fails', async () => {
    mockOnSubmit.mockRejectedValue(new Error('API error'));
    const user = userEvent.setup();
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    await user.type(screen.getByLabelText(/제목/), 'Failing issue');
    await user.click(screen.getByRole('button', { name: '이슈 추가' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    // Dialog should remain open and form should keep its values
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/제목/)).toHaveValue('Failing issue');
    // Submit button should be re-enabled after failure
    expect(screen.getByRole('button', { name: '이슈 추가' })).not.toBeDisabled();
  });

  it('should include optional severity and issueType when selected', async () => {
    const user = userEvent.setup();
    render(
      <IssueFormDialog open={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    await user.type(screen.getByLabelText(/제목/), 'Critical Bug');
    await user.selectOptions(screen.getByLabelText(/심각도/), 'critical');
    await user.selectOptions(screen.getByLabelText(/타입/), 'bug');
    await user.click(screen.getByRole('button', { name: '이슈 추가' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'Critical Bug',
        severity: 'critical',
        issueType: 'bug',
      });
    });
  });
});
