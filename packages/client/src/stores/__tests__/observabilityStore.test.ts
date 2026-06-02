/**
 * Story 31.3 (Task B.4): observabilityStore tests — filter apply, aggregate
 * load, exact-count cache + approximation fallback, and the two AC-B1.c
 * percentage helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api/observabilityApi', () => ({
  fetchMcpCalls: vi.fn(),
  fetchTokenAttribution: vi.fn(),
  fetchExactCount: vi.fn(),
  fetchTokenizerPref: vi.fn(),
  saveTokenizerPref: vi.fn(),
}));

import {
  useObservabilityStore,
  windowPercent,
  harnessSharePercent,
  effectiveTokens,
  DEFAULT_CONTEXT_WINDOW,
} from '../observabilityStore';
import * as api from '../../services/api/observabilityApi';
import type { TokenAttributionItem } from '@hammoc/shared';

const item = (over: Partial<TokenAttributionItem> = {}): TokenAttributionItem => ({
  kind: 'skill',
  label: 'skill: demo',
  path: '/p/skills/demo/SKILL.md',
  bytes: 400,
  approxTokens: 100,
  contentHash: 'hash-1',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  useObservabilityStore.getState().reset();
});

describe('loadMcpCalls', () => {
  it('populates aggregates + timeline and clears loading', async () => {
    vi.mocked(api.fetchMcpCalls).mockResolvedValue({
      aggregates: [{ serverName: 'pw', toolName: 'mcp__pw__nav', count: 3, avgDurationMs: 40, errorCount: 1 }],
      timeline: [],
    });
    await useObservabilityStore.getState().loadMcpCalls('proj');
    const s = useObservabilityStore.getState();
    expect(s.aggregates).toHaveLength(1);
    expect(s.mcpLoading).toBe(false);
    expect(s.projectSlug).toBe('proj');
  });

  it('records error on failure', async () => {
    vi.mocked(api.fetchMcpCalls).mockRejectedValue(new Error('boom'));
    await useObservabilityStore.getState().loadMcpCalls('proj');
    expect(useObservabilityStore.getState().mcpError).toBe('boom');
    expect(useObservabilityStore.getState().mcpLoading).toBe(false);
  });
});

describe('setFilter', () => {
  it('merges filters, drops empty strings, and reloads', async () => {
    vi.mocked(api.fetchMcpCalls).mockResolvedValue({ aggregates: [], timeline: [] });
    const store = useObservabilityStore.getState();
    await store.loadMcpCalls('proj'); // sets projectSlug
    vi.mocked(api.fetchMcpCalls).mockClear();

    store.setFilter({ server: 'pw' });
    expect(useObservabilityStore.getState().filter.server).toBe('pw');

    // empty string clears the key (does not over-constrain)
    store.setFilter({ server: '' });
    expect(useObservabilityStore.getState().filter.server).toBeUndefined();

    // reload was triggered with the project slug each time
    expect(api.fetchMcpCalls).toHaveBeenCalledWith('proj', expect.any(Object));
  });
});

describe('requestExactCount cache (AC-B3.b/c)', () => {
  it('caches a successful count and does not re-request', async () => {
    vi.mocked(api.fetchExactCount).mockResolvedValue({ tokens: 222, cached: false });
    const store = useObservabilityStore.getState();
    await store.requestExactCount('proj', item());
    expect(useObservabilityStore.getState().exactByHash['hash-1']).toEqual({ tokens: 222, cached: false });

    await store.requestExactCount('proj', item()); // cached → no-op
    expect(api.fetchExactCount).toHaveBeenCalledTimes(1);
  });

  it('stores a non-blocking failure result (approximation kept)', async () => {
    vi.mocked(api.fetchExactCount).mockResolvedValue({ tokens: 0, cached: false, failed: true });
    await useObservabilityStore.getState().requestExactCount('proj', item());
    const stored = useObservabilityStore.getState().exactByHash['hash-1'];
    expect(stored.failed).toBe(true);
    // effectiveTokens falls back to approximation
    expect(effectiveTokens(item(), useObservabilityStore.getState().exactByHash)).toEqual({
      tokens: 100,
      isExact: false,
    });
  });

  it('a thrown request is recorded as a failure, not surfaced as exact', async () => {
    vi.mocked(api.fetchExactCount).mockRejectedValue(new Error('network'));
    await useObservabilityStore.getState().requestExactCount('proj', item());
    expect(useObservabilityStore.getState().exactByHash['hash-1'].failed).toBe(true);
  });
});

describe('percentage helpers (AC-B1.c)', () => {
  it('windowPercent uses the shared effective-limit math', () => {
    // effective = 200000 - 20000 - 13000 = 167000; 16700/167000 = 10%
    expect(windowPercent(16700, 200000)).toBe(10);
  });

  it('windowPercent falls back to the default window when none reported', () => {
    expect(windowPercent(16700, 0)).toBe(windowPercent(16700, DEFAULT_CONTEXT_WINDOW));
  });

  it('harnessSharePercent is the element share of the total', () => {
    expect(harnessSharePercent(2500, 10000)).toBe(25);
    expect(harnessSharePercent(5, 0)).toBe(0);
  });

  it('effectiveTokens prefers an exact non-failed count', () => {
    const exactByHash = { 'hash-1': { tokens: 90, cached: true } };
    expect(effectiveTokens(item(), exactByHash)).toEqual({ tokens: 90, isExact: true });
  });
});

describe('updateTokenizer (AC-B4)', () => {
  it('persists optimistically and reverts on failure', async () => {
    vi.mocked(api.saveTokenizerPref).mockRejectedValue(new Error('nope'));
    const store = useObservabilityStore.getState();
    await store.updateTokenizer('anthropic-tokenizer');
    // reverted to the prior value
    expect(useObservabilityStore.getState().tokenizer).toBe('size/4');
  });
});
