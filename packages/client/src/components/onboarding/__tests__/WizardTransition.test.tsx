// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WizardTransition } from '../WizardTransition';

describe('WizardTransition', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders children', () => {
    render(
      <WizardTransition stepKey="step-1">
        <div>Step 1 Content</div>
      </WizardTransition>
    );
    expect(screen.getByText('Step 1 Content')).toBeInTheDocument();
  });

  it('applies enter animation class initially', () => {
    const { container } = render(
      <WizardTransition stepKey="step-1">
        <div>Step 1</div>
      </WizardTransition>
    );
    expect(container.querySelector('.wizard-step-enter')).toBeInTheDocument();
  });

  it('has aria-live="polite" for screen readers', () => {
    const { container } = render(
      <WizardTransition stepKey="step-1">
        <div>Step 1</div>
      </WizardTransition>
    );
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('applies exit animation on step change, then re-enters with new content', () => {
    const { container, rerender } = render(
      <WizardTransition stepKey="step-1">
        <div>Step 1</div>
      </WizardTransition>
    );

    rerender(
      <WizardTransition stepKey="step-2">
        <div>Step 2</div>
      </WizardTransition>
    );

    expect(container.querySelector('.wizard-step-exit')).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(200); });

    expect(container.querySelector('.wizard-step-enter')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });
});
