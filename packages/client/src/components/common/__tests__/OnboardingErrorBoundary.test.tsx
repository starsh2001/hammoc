import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnboardingErrorBoundary } from '../OnboardingErrorBoundary';

// Component that throws an error
function ErrorComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal content</div>;
}

describe('OnboardingErrorBoundary', () => {
  // Suppress console.error during tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('should render children when no error', () => {
    render(
      <OnboardingErrorBoundary>
        <div>Test content</div>
      </OnboardingErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should render fallback UI when error occurs', () => {
    render(
      <OnboardingErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </OnboardingErrorBoundary>
    );

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument();
    expect(
      screen.getByText('페이지를 불러오는 중 오류가 발생했습니다. 다시 시도해 주세요.')
    ).toBeInTheDocument();
  });

  it('should display error message', () => {
    render(
      <OnboardingErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </OnboardingErrorBoundary>
    );

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should have alert role for accessibility', () => {
    render(
      <OnboardingErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </OnboardingErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should render retry button', () => {
    render(
      <OnboardingErrorBoundary>
        <ErrorComponent shouldThrow={true} />
      </OnboardingErrorBoundary>
    );

    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('should reset error state when retry button is clicked', () => {
    // Using a stateful wrapper to control when error is thrown
    let shouldThrow = true;

    function ConditionalErrorComponent() {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div>Normal content</div>;
    }

    render(
      <OnboardingErrorBoundary>
        <ConditionalErrorComponent />
      </OnboardingErrorBoundary>
    );

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument();

    // Stop throwing and click retry
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    render(
      <OnboardingErrorBoundary fallback={<div>Custom fallback</div>}>
        <ErrorComponent shouldThrow={true} />
      </OnboardingErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('문제가 발생했습니다')).not.toBeInTheDocument();
  });
});
