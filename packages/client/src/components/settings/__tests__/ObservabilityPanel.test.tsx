// @vitest-environment jsdom
/**
 * Story 31.3 (Task D.3): ObservabilityPanel integration — loads MCP aggregates +
 * timeline + token attribution + tokenizer pref on mount, wires the exact-count
 * button and the server filter to the store, and renders the tokenizer toggle.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));
vi.mock('../../../stores/chatStore', () => ({
  useChatStore: (sel: (s: unknown) => unknown) => sel({ contextUsage: null }),
}));
vi.mock('../../../services/api/observabilityApi', () => ({
  fetchMcpCalls: vi.fn(),
  fetchTokenAttribution: vi.fn(),
  fetchExactCount: vi.fn(),
  fetchTokenizerPref: vi.fn(),
  saveTokenizerPref: vi.fn(),
}));

import { ObservabilityPanel } from '../ObservabilityPanel';
import { useObservabilityStore } from '../../../stores/observabilityStore';
import * as api from '../../../services/api/observabilityApi';

beforeEach(() => {
  vi.clearAllMocks();
  useObservabilityStore.getState().reset();
  vi.mocked(api.fetchMcpCalls).mockResolvedValue({
    aggregates: [{ serverName: 'pw', toolName: 'mcp__pw__nav', count: 4, avgDurationMs: 30, errorCount: 0 }],
    timeline: [{ id: 'tu1', projectSlug: 'p', sessionId: 's', serverName: 'pw', toolName: 'mcp__pw__nav', startedAt: 1_700_000_000_000, durationMs: 20, argBytes: 5, resultBytes: 5, success: true }],
  });
  vi.mocked(api.fetchTokenAttribution).mockResolvedValue({
    items: [{ kind: 'claudeMd-project', label: 'CLAUDE.md', path: '/p/CLAUDE.md', bytes: 400, approxTokens: 100, contentHash: 'h1' }],
  });
  vi.mocked(api.fetchTokenizerPref).mockResolvedValue({ tokenizer: 'size/4', options: ['size/4'] });
});

describe('ObservabilityPanel', () => {
  it('loads and renders MCP + token sections on mount', async () => {
    render(<ObservabilityPanel projectSlug="p" />);
    expect(screen.getByTestId('observability-panel')).toBeTruthy();
    expect(await screen.findByTestId('observability-mcp-row')).toBeTruthy();
    expect(await screen.findByTestId('observability-token-row')).toBeTruthy();
    expect(api.fetchMcpCalls).toHaveBeenCalledWith('p', expect.any(Object));
    expect(api.fetchTokenAttribution).toHaveBeenCalledWith('p');
    expect(api.fetchTokenizerPref).toHaveBeenCalled();
  });

  it('renders the tokenizer toggle + rationale note', async () => {
    render(<ObservabilityPanel projectSlug="p" />);
    expect(await screen.findByTestId('observability-tokenizer-size4')).toBeTruthy();
    expect(screen.getByTestId('observability-tokenizer-note')).toBeTruthy();
  });

  it('requests an exact count when the button is clicked', async () => {
    vi.mocked(api.fetchExactCount).mockResolvedValue({ tokens: 88, cached: false });
    render(<ObservabilityPanel projectSlug="p" />);
    const btn = await screen.findByTestId('observability-token-exact-btn');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(api.fetchExactCount).toHaveBeenCalledWith('p', expect.objectContaining({ kind: 'claudeMd-project', contentHash: 'h1' })),
    );
  });

  it('re-queries MCP calls when the server filter changes', async () => {
    render(<ObservabilityPanel projectSlug="p" />);
    await screen.findByTestId('observability-mcp-row');
    vi.mocked(api.fetchMcpCalls).mockClear();
    fireEvent.change(screen.getByTestId('observability-mcp-filter-server'), { target: { value: 'pw' } });
    await waitFor(() => expect(api.fetchMcpCalls).toHaveBeenCalledWith('p', expect.objectContaining({ server: 'pw' })));
  });

  it('persists a tokenizer change when a second tier is available', async () => {
    // server reports two tiers so the toggle has something to switch to.
    vi.mocked(api.fetchTokenizerPref).mockResolvedValue({ tokenizer: 'size/4', options: ['size/4', 'anthropic-tokenizer'] });
    vi.mocked(api.saveTokenizerPref).mockResolvedValue({ tokenizer: 'anthropic-tokenizer', options: ['size/4', 'anthropic-tokenizer'] });
    render(<ObservabilityPanel projectSlug="p" />);
    const second = await screen.findByTestId('observability-tokenizer-anthropic-tokenizer');
    fireEvent.click(second);
    await waitFor(() => expect(api.saveTokenizerPref).toHaveBeenCalledWith('anthropic-tokenizer'));
  });
});
