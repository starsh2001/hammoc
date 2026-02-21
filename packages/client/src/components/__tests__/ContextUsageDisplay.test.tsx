/**
 * ContextUsageDisplay Component Tests
 * [Source: Story 5.6 - Task 7]
 *
 * Percentage formula: totalInputTokens / effectiveLimit
 * where effectiveLimit = contextWindow - 20000 (output reserve) - 13000 (safety buffer)
 * For 200K window: effectiveLimit = 167,000
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
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when contextWindow is 0', () => {
    const { container } = render(
      <ContextUsageDisplay contextUsage={createUsage({ contextWindow: 0 })} />
    );
    expect(container.innerHTML).toBe('');
  });

  // effectiveLimit = 167,000. totalInput = 20000+50000+3000 = 73,000 → 44% (green)
  it('shows green ring stroke when under 50%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 20000, contextWindow: 200000 })}
      />
    );
    const ring = screen.getByTestId('context-usage-progress');
    expect(ring.getAttribute('stroke')).toBe('#22c55e');
  });

  // totalInput = 50000+50000+3000 = 103,000 → 62% (yellow)
  it('shows yellow ring stroke between 50-80%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 50000, contextWindow: 200000 })}
      />
    );
    const ring = screen.getByTestId('context-usage-progress');
    expect(ring.getAttribute('stroke')).toBe('#eab308');
  });

  // totalInput = 90000+50000+3000 = 143,000 → 86% (red)
  it('shows red ring stroke above 80%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 90000, contextWindow: 200000 })}
      />
    );
    const ring = screen.getByTestId('context-usage-progress');
    expect(ring.getAttribute('stroke')).toBe('#ef4444');
  });

  // totalInput = 105000+50000+3000 = 158,000 → 95% (warning)
  it('shows warning icon when above 90%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 105000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByTestId('context-usage-warning')).toBeTruthy();
  });

  // totalInput = 80000+50000+3000 = 133,000 → 80% (no warning)
  it('does not show warning icon when under 90%', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 80000, contextWindow: 200000 })}
      />
    );
    expect(screen.queryByTestId('context-usage-warning')).toBeNull();
  });

  // totalInput = 100000+50000+3000 = 153,000 → 92%
  it('shows tooltip with detailed info', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 100000, contextWindow: 200000 })}
      />
    );
    const el = screen.getByTestId('context-usage-display');
    const title = el.getAttribute('title');
    expect(title).toContain('컨텍스트:');
    expect(title).toContain('167,000');
    expect(title).toContain('92%');
    expect(title).toContain('전체 윈도우: 200,000');
    expect(title).toContain('출력 토큰:');
    expect(title).toContain('캐시 읽기:');
    expect(title).toContain('비용:');
  });

  // totalInput = 105000+50000+3000 = 158,000 → 95% (critical)
  it('calls onNewSession when clicked and above 90%', () => {
    const onNewSession = vi.fn();
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 105000, contextWindow: 200000 })}
        onNewSession={onNewSession}
      />
    );
    fireEvent.click(screen.getByTestId('context-usage-display'));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  // totalInput = 80000+50000+3000 = 133,000 → 80% (not critical)
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

  // totalInput = 47000+50000+3000 = 100,000 → 100000/167000 = 59.9% → 60
  it('displays percent number in SVG center text', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 47000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByText('60')).toBeTruthy();
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

  // Percentage should be capped at 100%
  it('caps percentage at 100% when input exceeds effective limit', () => {
    render(
      <ContextUsageDisplay
        contextUsage={createUsage({ inputTokens: 170000, contextWindow: 200000 })}
      />
    );
    expect(screen.getByText('100')).toBeTruthy();
  });
});
