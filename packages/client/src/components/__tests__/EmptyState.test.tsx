/**
 * EmptyState Tests
 * [Source: Story 3.4 - Task 4]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState } from '../EmptyState';
import { FolderOpen } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="데이터가 없습니다"
        description="새 항목을 추가해주세요."
      />
    );

    expect(screen.getByText('데이터가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('새 항목을 추가해주세요.')).toBeInTheDocument();
  });

  it('renders action button when actionLabel and onAction are provided', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="세션이 없습니다"
        description="새 세션을 시작하세요."
        actionLabel="새 세션 시작"
        onAction={onAction}
      />
    );

    const button = screen.getByRole('button', { name: /새 세션 시작/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render button when actionLabel is not provided', () => {
    render(
      <EmptyState
        title="세션이 없습니다"
        description="새 세션을 시작하세요."
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render button when onAction is not provided', () => {
    render(
      <EmptyState
        title="세션이 없습니다"
        description="새 세션을 시작하세요."
        actionLabel="새 세션 시작"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    render(
      <EmptyState
        icon={FolderOpen}
        title="폴더가 비어있습니다"
        description="파일을 추가해주세요."
      />
    );

    // Icon should be rendered with aria-hidden
    const statusElement = screen.getByRole('status');
    const icon = statusElement.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('has accessible role="status" with aria-label', () => {
    render(
      <EmptyState
        title="세션이 없습니다"
        description="새 세션을 시작하세요."
      />
    );

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-label', '세션이 없습니다');
  });

  it('uses default MessageSquare icon when no icon provided', () => {
    render(
      <EmptyState
        title="세션이 없습니다"
        description="새 세션을 시작하세요."
      />
    );

    const statusElement = screen.getByRole('status');
    const icon = statusElement.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('button has Plus icon', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="세션이 없습니다"
        description="새 세션을 시작하세요."
        actionLabel="새 세션 시작"
        onAction={onAction}
      />
    );

    const button = screen.getByRole('button');
    const plusIcon = button.querySelector('svg');
    expect(plusIcon).toBeInTheDocument();
    expect(plusIcon).toHaveAttribute('aria-hidden', 'true');
  });
});
