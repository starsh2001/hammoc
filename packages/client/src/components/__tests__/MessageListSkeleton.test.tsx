/**
 * MessageListSkeleton Tests
 * [Source: Story 3.5 - Task 6]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageListSkeleton } from '../MessageListSkeleton';

describe('MessageListSkeleton', () => {
  it('should render default 5 skeleton messages', () => {
    const { container } = render(<MessageListSkeleton />);

    // Count skeleton message containers
    const skeletonMessages = container.querySelectorAll('.flex.justify-end, .flex.justify-start');
    expect(skeletonMessages).toHaveLength(5);
  });

  it('should render custom count of skeleton messages', () => {
    const { container } = render(<MessageListSkeleton count={3} />);

    const skeletonMessages = container.querySelectorAll('.flex.justify-end, .flex.justify-start');
    expect(skeletonMessages).toHaveLength(3);
  });

  it('should have loading status role', () => {
    render(<MessageListSkeleton />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should have aria-label for accessibility', () => {
    render(<MessageListSkeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '메시지 로딩 중');
  });

  it('should have screen reader only text', () => {
    render(<MessageListSkeleton />);

    expect(screen.getByText('메시지를 불러오는 중입니다...')).toHaveClass('sr-only');
  });

  it('should apply animation class', () => {
    const { container } = render(<MessageListSkeleton />);

    const wrapper = container.querySelector('[role="status"]');
    expect(wrapper).toHaveClass('animate-pulse');
  });

  it('should alternate between user and assistant styles', () => {
    const { container } = render(<MessageListSkeleton count={4} />);

    const rightAligned = container.querySelectorAll('.justify-end');
    const leftAligned = container.querySelectorAll('.justify-start');

    // Index 0, 2 are user (right aligned)
    expect(rightAligned).toHaveLength(2);
    // Index 1, 3 are assistant (left aligned)
    expect(leftAligned).toHaveLength(2);
  });
});
