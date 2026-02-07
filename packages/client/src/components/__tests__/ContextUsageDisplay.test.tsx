/**
 * ContextUsageDisplay Component Tests
 * [Source: Story 5.6 - Task 7]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextUsageDisplay } from '../ContextUsageDisplay';
import type { ChatUsage } from '@bmad-studio/shared';

function createUsage(overrides: Partial<ChatUsage> = {}): ChatUsage {
  return {
    inputTokens: 100000,
    outputTokens: 500,
    cacheReadInputTokens: 50000,
    cacheCreationInputTokens: 3000,
    totalCostUSD: 0.03,
    contextWindow: 200000,
    ...overrides,
  };
}

describe('ContextUsageDisplay', () => {
  it('renders nothing when contextUsage is null', () => {
    const { container } = render(
      <ContextUsageDisplay contextUsage={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when contextWindow is 0', () => {
    const { container } = render(
      <ContextUsageDisplay contextUsage={createUsage({ contextWindow: 0 })} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows green ring stroke when under 50%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 80000, contextWindow: 200000 })}
      />
    );
    const ring = screen.getByTestId('context-usage-progress');
    expect(ring.getAttribute('stroke')).toBe('#22c55e');
  });

  it('shows yellow ring stroke between 50-80%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 120000, contextWindow: 200000 })}
      />
    );
    const ring = screen.getByTestId('context-usage-progress');
    expect(ring.getAttribute('stroke')).toBe('#eab308');
  });

  it('shows red ring stroke above 80%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 170000, contextWindow: 200000 })}
      />
    );
    const ring = screen.getByTestId('context-usage-progress');
    expect(ring.getAttribute('stroke')).toBe('#ef4444');
  });

  it('shows warning icon when above 90%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 185000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByTestId('context-usage-warning')).toBeTruthy();
  });

  it('does not show warning icon when under 90%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 80000, contextWindow: 200000 })}
      />
    );
    expect(screen.queryByTestId('context-usage-warning')).toBeNull();
  });

  it('shows tooltip with detailed info', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 100000, contextWindow: 200000 })}
      />
    );
    const el = screen.getByTestId('context-usage-display');
    const title = el.getAttribute('title');
    expect(title).toContain('컨텍스트:');
    expect(title).toContain('100,000');
    expect(title).toContain('200,000');
    expect(title).toContain('50%');
    expect(title).toContain('출력 토큰:');
    expect(title).toContain('캐시 읽기:');
    expect(title).toContain('비용:');
  });

  it('calls onNewSession when clicked and above 90%', () => {
    const onNewSession = vi.fn();
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 185000, contextWindow: 200000 })}
        onNewSession={onNewSession}
      />
    );
    fireEvent.click(screen.getByTestId('context-usage-display'));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it('does not call onNewSession when clicked and under 90%', () => {
    const onNewSession = vi.fn();
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 80000, contextWindow: 200000 })}
        onNewSession={onNewSession}
      />
    );
    fireEvent.click(screen.getByTestId('context-usage-display'));
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it('displays percent number in SVG center text', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 134000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByText('67')).toBeTruthy();
  });

  it('renders SVG donut ring', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 100000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByTestId('context-usage-ring')).toBeTruthy();
  });

  it('has role="status" attribute', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 100000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
