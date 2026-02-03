/**
 * StreamingIndicator Component Tests
 * [Source: Story 4.5 - Task 13]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamingIndicator } from '../StreamingIndicator';

describe('StreamingIndicator', () => {
  it('renders three pulsing dots', () => {
    const { container } = render(<StreamingIndicator />);

    const dots = container.querySelectorAll('.animate-pulse');
    expect(dots).toHaveLength(3);
  });

  it('has aria-live attribute for accessibility', () => {
    render(<StreamingIndicator />);

    const indicator = screen.getByLabelText('Claude가 응답을 생성하고 있습니다');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });

  it('includes screen reader text', () => {
    render(<StreamingIndicator />);

    expect(screen.getByText('Claude is thinking...')).toBeInTheDocument();
    expect(screen.getByText('Claude is thinking...')).toHaveClass('sr-only');
  });

  it('hides dots from screen readers', () => {
    const { container } = render(<StreamingIndicator />);

    const dots = container.querySelectorAll('[aria-hidden="true"]');
    expect(dots).toHaveLength(3);
  });

  it('returns null when visible is false', () => {
    const { container } = render(<StreamingIndicator visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when visible is true (default)', () => {
    const { container } = render(<StreamingIndicator visible={true} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders with correct styling classes', () => {
    render(<StreamingIndicator />);

    const indicator = screen.getByLabelText('Claude가 응답을 생성하고 있습니다');
    expect(indicator).toHaveClass('flex', 'items-center', 'gap-1');
    expect(indicator).toHaveClass('text-gray-500', 'dark:text-gray-400');
  });

  it('dots have animation delays', () => {
    const { container } = render(<StreamingIndicator />);

    const dots = container.querySelectorAll('.animate-pulse');

    // First dot: no delay
    expect(dots[0]).not.toHaveStyle({ animationDelay: '150ms' });

    // Second dot: 150ms delay
    expect(dots[1]).toHaveStyle({ animationDelay: '150ms' });

    // Third dot: 300ms delay
    expect(dots[2]).toHaveStyle({ animationDelay: '300ms' });
  });
});
