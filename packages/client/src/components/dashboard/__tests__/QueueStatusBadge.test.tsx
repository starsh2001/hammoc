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
    expect(badge).toHaveTextContent('Running');
    expect(badge.className).toContain('bg-blue-500/20');
    expect(badge.className).toContain('text-blue-400');
  });

  it('renders yellow badge for paused status', () => {
    render(<QueueStatusBadge status="paused" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Paused');
    expect(badge.className).toContain('bg-yellow-500/20');
    expect(badge.className).toContain('text-yellow-400');
  });

  it('renders red badge for error status', () => {
    render(<QueueStatusBadge status="error" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Error');
    expect(badge.className).toContain('bg-red-500/20');
    expect(badge.className).toContain('text-red-400');
  });

  it('contains correct status text label', () => {
    const { rerender } = render(<QueueStatusBadge status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();

    rerender(<QueueStatusBadge status="paused" />);
    expect(screen.getByText('Paused')).toBeInTheDocument();

    rerender(<QueueStatusBadge status="error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders role="status" attribute on badge element', () => {
    render(<QueueStatusBadge status="running" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders correct aria-label for each status', () => {
    const { rerender } = render(<QueueStatusBadge status="running" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Queue status: Running');

    rerender(<QueueStatusBadge status="paused" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Queue status: Paused');

    rerender(<QueueStatusBadge status="error" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Queue status: Error');
  });
});
