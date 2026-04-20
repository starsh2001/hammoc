import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueueStatusBadge } from '../QueueStatusBadge';

describe('QueueStatusBadge', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<QueueStatusBadge status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders blue badge for running status', () => {
    render(<QueueStatusBadge status="running" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('큐 실행중');
    expect(badge.className).toContain('bg-blue-500/20');
    expect(badge.className).toContain('text-blue-400');
  });

  it('renders amber badge for paused status', () => {
    render(<QueueStatusBadge status="paused" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('큐 일시 중지');
    expect(badge.className).toContain('bg-amber-500/20');
    expect(badge.className).toContain('text-amber-400');
  });

  it('renders red badge for error status', () => {
    render(<QueueStatusBadge status="error" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('큐 오류');
    expect(badge.className).toContain('bg-red-500/20');
    expect(badge.className).toContain('text-red-400');
  });

  it('contains correct status text label', () => {
    const { rerender } = render(<QueueStatusBadge status="running" />);
    expect(screen.getByText('큐 실행중')).toBeInTheDocument();

    rerender(<QueueStatusBadge status="paused" />);
    expect(screen.getByText('큐 일시 중지')).toBeInTheDocument();

    rerender(<QueueStatusBadge status="error" />);
    expect(screen.getByText('큐 오류')).toBeInTheDocument();
  });

  it('renders role="status" attribute on badge element', () => {
    render(<QueueStatusBadge status="running" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders correct aria-label for each status', () => {
    const { rerender } = render(<QueueStatusBadge status="running" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '큐 상태: 큐 실행중');

    rerender(<QueueStatusBadge status="paused" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '큐 상태: 큐 일시 중지');

    rerender(<QueueStatusBadge status="error" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '큐 상태: 큐 오류');
  });
});
