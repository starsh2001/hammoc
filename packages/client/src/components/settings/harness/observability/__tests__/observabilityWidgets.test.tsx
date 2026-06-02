// @vitest-environment jsdom
/**
 * Story 31.3 (Task C.4): unit tests for the 3 observability widgets —
 * McpCallChart (rows + bars + filter change), McpCallTimeline (rows + orphan +
 * empty), TokenAttributionChart (overlay + approx/exact inline + exact button +
 * fallback). i18n is stubbed to return the key (object interpolation → key) so
 * approx-vs-exact can be distinguished by the key string.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));

import { McpCallChart } from '../McpCallChart';
import { McpCallTimeline } from '../McpCallTimeline';
import { TokenAttributionChart } from '../TokenAttributionChart';
import type { McpCallAggregate, McpCallRecord, TokenAttributionItem } from '@hammoc/shared';

const agg = (over: Partial<McpCallAggregate> = {}): McpCallAggregate => ({
  serverName: 'pw',
  toolName: 'mcp__pw__nav',
  count: 5,
  avgDurationMs: 40,
  errorCount: 0,
  ...over,
});

const item = (over: Partial<TokenAttributionItem> = {}): TokenAttributionItem => ({
  kind: 'skill',
  label: 'skill: demo',
  path: '/p/SKILL.md',
  bytes: 400,
  approxTokens: 100,
  contentHash: 'h1',
  ...over,
});

describe('McpCallChart', () => {
  it('renders aggregate rows + bars', () => {
    render(<McpCallChart aggregates={[agg(), agg({ toolName: 'Read', serverName: null })]} filter={{}} onFilterChange={vi.fn()} />);
    expect(screen.getAllByTestId('observability-mcp-row')).toHaveLength(2);
    expect(screen.getAllByTestId('observability-mcp-bar').length).toBe(2);
  });

  it('shows empty state when no aggregates', () => {
    render(<McpCallChart aggregates={[]} filter={{}} onFilterChange={vi.fn()} />);
    expect(screen.getByTestId('observability-mcp-empty')).toBeTruthy();
  });

  it('fires onFilterChange when the server filter changes', () => {
    const onFilterChange = vi.fn();
    render(<McpCallChart aggregates={[agg()]} filter={{}} onFilterChange={onFilterChange} />);
    fireEvent.change(screen.getByTestId('observability-mcp-filter-server'), { target: { value: 'pw' } });
    expect(onFilterChange).toHaveBeenCalledWith({ server: 'pw' });
  });
});

describe('McpCallTimeline', () => {
  const rec = (over: Partial<McpCallRecord> = {}): McpCallRecord => ({
    id: 'tu1', projectSlug: 'p', sessionId: 'sess1234abcd', serverName: 'pw',
    toolName: 'mcp__pw__nav', startedAt: 1_700_000_000_000, durationMs: 30,
    argBytes: 10, resultBytes: 20, success: true, ...over,
  });

  it('renders timeline rows', () => {
    render(<McpCallTimeline timeline={[rec(), rec({ id: 'tu2' })]} />);
    expect(screen.getAllByTestId('observability-timeline-row')).toHaveLength(2);
  });

  it('renders an orphan row with no-duration label', () => {
    render(<McpCallTimeline timeline={[rec({ durationMs: null, resultBytes: null, success: null })]} />);
    // orphan icon carries the orphan aria-label
    expect(screen.getByLabelText('harness.observability.timeline.orphan')).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<McpCallTimeline timeline={[]} />);
    expect(screen.getByTestId('observability-timeline-empty')).toBeTruthy();
  });
});

describe('TokenAttributionChart', () => {
  it('renders overlay + a row with the approx inline hint + exact button', () => {
    render(
      <TokenAttributionChart
        items={[item()]}
        exactByHash={{}}
        exactPending={{}}
        contextWindow={200_000}
        onRequestExact={vi.fn()}
      />,
    );
    expect(screen.getByTestId('observability-token-overlay')).toBeTruthy();
    expect(screen.getByTestId('observability-token-inline').textContent).toBe('harness.observability.tokens.inlineApprox');
    expect(screen.getByTestId('observability-token-exact-btn')).toBeTruthy();
  });

  it('calls onRequestExact when the exact button is clicked', () => {
    const onRequestExact = vi.fn();
    render(
      <TokenAttributionChart items={[item()]} exactByHash={{}} exactPending={{}} contextWindow={200_000} onRequestExact={onRequestExact} />,
    );
    fireEvent.click(screen.getByTestId('observability-token-exact-btn'));
    expect(onRequestExact).toHaveBeenCalledWith(item());
  });

  it('shows the EXACT inline (no ~, no button) when an exact count is present', () => {
    render(
      <TokenAttributionChart
        items={[item()]}
        exactByHash={{ h1: { tokens: 88, cached: false } }}
        exactPending={{}}
        contextWindow={200_000}
        onRequestExact={vi.fn()}
      />,
    );
    expect(screen.getByTestId('observability-token-inline').textContent).toBe('harness.observability.tokens.inlineExact');
    expect(screen.queryByTestId('observability-token-exact-btn')).toBeNull();
  });

  it('keeps the approximation and shows a failed marker when exact count failed (AC-B3.c)', () => {
    render(
      <TokenAttributionChart
        items={[item()]}
        exactByHash={{ h1: { tokens: 0, cached: false, failed: true } }}
        exactPending={{}}
        contextWindow={200_000}
        onRequestExact={vi.fn()}
      />,
    );
    // still approximate (failed result is ignored by effectiveTokens)
    expect(screen.getByTestId('observability-token-inline').textContent).toBe('harness.observability.tokens.inlineApprox');
    expect(screen.getByTestId('observability-token-failed')).toBeTruthy();
  });
});
