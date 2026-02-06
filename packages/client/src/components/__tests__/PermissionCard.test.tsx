/**
 * PermissionCard Tests
 * [Source: Story 6.5 - Task 8]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionCard } from '../PermissionCard';

// Mock DiffViewer (already tested separately)
vi.mock('../DiffViewer', () => ({
  DiffViewer: vi.fn(({ filePath, onClose }: { filePath: string; onClose: () => void }) => (
    <div data-testid="mock-diff-viewer">
      <span>{filePath}</span>
      <button onClick={onClose}>Close</button>
    </div>
  )),
  default: vi.fn(),
}));

const editToolInput = {
  file_path: '/src/app.ts',
  old_string: 'line1\nline2',
  new_string: 'line1\nline2\nline3',
};

const writeToolInput = {
  file_path: '/src/new.ts',
  content: 'new content\nline2',
};

describe('PermissionCard', () => {
  it('renders Permission Card for Edit tool', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    expect(screen.getByTestId('permission-card')).toBeInTheDocument();
  });

  it('renders Permission Card for Write tool', () => {
    render(<PermissionCard toolName="Write" toolInput={writeToolInput} />);

    expect(screen.getByTestId('permission-card')).toBeInTheDocument();
  });

  it('displays filename from toolInput.file_path', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    expect(screen.getByText('app.ts')).toBeInTheDocument();
    // Full path available via title tooltip
    expect(screen.getByTitle('/src/app.ts')).toBeInTheDocument();
  });

  it('displays +N/-M with correct colors', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    const addedEl = screen.getByText('+3');
    const removedEl = screen.getByText('-2');

    expect(addedEl.className).toContain('text-green-600');
    expect(removedEl.className).toContain('text-red-600');
  });

  it('computes correct line changes for Edit tool', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    // old_string has 2 lines, new_string has 3 lines
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('computes correct line changes for Write tool', () => {
    render(<PermissionCard toolName="Write" toolInput={writeToolInput} />);

    // content has 2 lines, original is empty = 0 removed
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('-0')).toBeInTheDocument();
  });

  it('displays summary text', () => {
    render(
      <PermissionCard toolName="Edit" toolInput={editToolInput} summary="Fix bug in app.ts" />
    );

    expect(screen.getByText('Fix bug in app.ts')).toBeInTheDocument();
  });

  it('displays default summary when summary is empty', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    expect(screen.getByText('파일 수정: /src/app.ts')).toBeInTheDocument();
  });

  it('renders approve and reject buttons', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    expect(screen.getByLabelText('변경사항 승인')).toBeInTheDocument();
    expect(screen.getByLabelText('변경사항 거절')).toBeInTheDocument();
  });

  it('calls onApprove callback when approve button clicked', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} onApprove={onApprove} />);

    await user.click(screen.getByLabelText('변경사항 승인'));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('calls onReject callback when reject button clicked', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} onReject={onReject} />);

    await user.click(screen.getByLabelText('변경사항 거절'));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('disables buttons when status is completed', () => {
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} status="completed" />);

    expect(screen.getByLabelText('변경사항 승인')).toBeDisabled();
    expect(screen.getByLabelText('변경사항 거절')).toBeDisabled();
  });

  it('opens fullscreen DiffViewer on header click', async () => {
    const user = userEvent.setup();
    render(<PermissionCard toolName="Edit" toolInput={editToolInput} />);

    expect(screen.queryByTestId('mock-diff-viewer')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('파일 변경사항 보기: /src/app.ts'));

    expect(screen.getByTestId('mock-diff-viewer')).toBeInTheDocument();
  });

  it('has correct aria labels for accessibility', () => {
    render(<PermissionCard toolName="Write" toolInput={writeToolInput} />);

    expect(screen.getByLabelText('파일 변경사항 보기: /src/new.ts')).toBeInTheDocument();
    expect(screen.getByLabelText('변경사항 승인')).toBeInTheDocument();
    expect(screen.getByLabelText('변경사항 거절')).toBeInTheDocument();
  });

  // QA Fix: edge case test for undefined toolInput
  it('renders gracefully when toolInput is undefined', () => {
    render(<PermissionCard toolName="Edit" />);

    expect(screen.getByTestId('permission-card')).toBeInTheDocument();
    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByText('-0')).toBeInTheDocument();
    expect(screen.getByText('파일 수정:')).toBeInTheDocument();
  });

  // QA Fix: error status renders XCircle icon on reject button
  it('renders XCircle icon on reject button when status is error', () => {
    const { container } = render(
      <PermissionCard toolName="Edit" toolInput={editToolInput} status="error" />
    );

    expect(screen.getByLabelText('변경사항 승인')).toBeDisabled();
    expect(screen.getByLabelText('변경사항 거절')).toBeDisabled();
    // XCircle renders as SVG inside the reject button
    const rejectButton = screen.getByLabelText('변경사항 거절');
    const svgs = rejectButton.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
  });
});
