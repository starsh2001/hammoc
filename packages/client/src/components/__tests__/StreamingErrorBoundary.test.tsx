/**
 * StreamingErrorBoundary Component Tests
 * [Source: Story 4.5 - Task 18]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StreamingErrorBoundary } from '../StreamingErrorBoundary';

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Normal content</div>;
}

describe('StreamingErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error during tests (React logs errors to console)
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('normal rendering', () => {
    it('renders children when no error', () => {
      render(
        <StreamingErrorBoundary>
          <div>Child content</div>
        </StreamingErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('passes through children without modification', () => {
      render(
        <StreamingErrorBoundary>
          <ThrowError shouldThrow={false} />
        </StreamingErrorBoundary>
      );

      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('renders fallback UI when error occurs', () => {
      render(
        <StreamingErrorBoundary>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      expect(screen.getByText('스트리밍 중 오류가 발생했습니다.')).toBeInTheDocument();
    });

    it('renders retry button when error occurs', () => {
      render(
        <StreamingErrorBoundary>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    });

    it('renders custom fallback when provided', () => {
      render(
        <StreamingErrorBoundary fallback={<div>Custom error UI</div>}>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      expect(screen.getByText('Custom error UI')).toBeInTheDocument();
      expect(screen.queryByText('스트리밍 중 오류가 발생했습니다.')).not.toBeInTheDocument();
    });

    it('logs error to console (React error boundary logging)', () => {
      render(
        <StreamingErrorBoundary>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      // React/jsdom logs errors to console.error when an error boundary catches
      expect(consoleSpy).toHaveBeenCalled();
      // Verify at least one call mentions the error
      expect(consoleSpy.mock.calls.some(
        (args: unknown[]) => args.some((a) => a instanceof Error || (typeof a === 'string' && a.includes('Test error')))
      )).toBe(true);
    });
  });

  describe('retry functionality', () => {
    it('calls onRetry callback when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(
        <StreamingErrorBoundary onRetry={onRetry}>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: '다시 시도' });
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('resets error state when retry button is clicked', () => {
      // Use a component that we can control
      let shouldThrow = true;
      function ControlledComponent() {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div>Recovered</div>;
      }

      const { rerender } = render(
        <StreamingErrorBoundary>
          <ControlledComponent />
        </StreamingErrorBoundary>
      );

      // Should show error UI
      expect(screen.getByText('스트리밍 중 오류가 발생했습니다.')).toBeInTheDocument();

      // Fix the error
      shouldThrow = false;

      // Click retry
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

      // Rerender to show recovered state
      rerender(
        <StreamingErrorBoundary>
          <ControlledComponent />
        </StreamingErrorBoundary>
      );

      expect(screen.getByText('Recovered')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has correct dark mode classes', () => {
      render(
        <StreamingErrorBoundary>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      const errorText = screen.getByText('스트리밍 중 오류가 발생했습니다.');
      expect(errorText).toHaveClass('text-red-500', 'dark:text-red-400');
    });

    it('retry button has proper styling', () => {
      render(
        <StreamingErrorBoundary>
          <ThrowError shouldThrow={true} />
        </StreamingErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: '다시 시도' });
      expect(retryButton).toHaveClass('bg-gray-100', 'dark:bg-gray-700');
    });
  });
});
