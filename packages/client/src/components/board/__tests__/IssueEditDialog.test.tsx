/**
 * IssueEditDialog Component Tests
 * [Source: Story 21.3 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueEditDialog } from '../IssueEditDialog';
import type { BoardItem } from '@hammoc/shared';

const mockIssue: BoardItem = {
  id: 'issue-1',
  type: 'issue',
  title: 'Fix login bug',
  status: 'Open',
  description: 'Login form does not validate',
  severity: 'high',
  issueType: 'bug',
};

describe('IssueEditDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('should not render when open is false', () => {
    render(
      <IssueEditDialog open={false} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    expect(screen.queryByText('이슈 편집')).not.toBeInTheDocument();
  });

  it('should not render when issue is null', () => {
    render(
      <IssueEditDialog open={true} issue={null} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    expect(screen.queryByText('이슈 편집')).not.toBeInTheDocument();
  });

  it('should populate form with issue data', () => {
    render(
      <IssueEditDialog open={true} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    expect(screen.getByText('이슈 편집')).toBeInTheDocument();
    expect(screen.getByLabelText(/제목/)).toHaveValue('Fix login bug');
    expect(screen.getByLabelText(/설명/)).toHaveValue('Login form does not validate');
    expect(screen.getByLabelText(/심각도/)).toHaveValue('high');
    expect(screen.getByLabelText(/타입/)).toHaveValue('bug');
  });

  it('should call onSubmit with correct data when submitted', async () => {
    const user = userEvent.setup();
    render(
      <IssueEditDialog open={true} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    // Modify title
    const titleInput = screen.getByLabelText(/제목/);
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');
    await user.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('issue-1', expect.objectContaining({
        title: 'Updated title',
      }));
    });
  });

  it('should disable submit when title is empty', async () => {
    const user = userEvent.setup();
    render(
      <IssueEditDialog open={true} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    const titleInput = screen.getByLabelText(/제목/);
    await user.clear(titleInput);
    expect(screen.getByText('저장')).toBeDisabled();
  });

  it('should close dialog when Escape key is pressed', () => {
    render(
      <IssueEditDialog open={true} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close dialog when overlay is clicked', () => {
    render(
      <IssueEditDialog open={true} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );
    const overlay = document.querySelector('.bg-black\\/50');
    if (overlay) {
      fireEvent.click(overlay);
    }
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not close when submit fails', async () => {
    mockOnSubmit.mockRejectedValue(new Error('API error'));
    const user = userEvent.setup();
    render(
      <IssueEditDialog open={true} issue={mockIssue} onClose={mockOnClose} onSubmit={mockOnSubmit} />,
    );

    await user.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    expect(screen.getByLabelText(/제목/)).toHaveValue('Fix login bug');
    expect(screen.getByText('저장')).not.toBeDisabled();
  });
});
