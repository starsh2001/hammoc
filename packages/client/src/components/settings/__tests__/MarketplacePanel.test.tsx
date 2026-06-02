// @vitest-environment jsdom
/**
 * Story 31.4 (Task D.3): MarketplacePanel — card grid render, AC5 per-market
 * error badges, AC6 format-warning banner, and the copy-guide modal openers
 * (add / install). The api + socket are mocked; the real store drives state.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HarnessMarketplaceCatalogResponse } from '@hammoc/shared';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../../services/socket', () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
}));

vi.mock('../../../services/api/marketplaceApi', () => ({
  fetchMarketplaceCatalog: vi.fn(),
}));

import { MarketplacePanel } from '../MarketplacePanel';
import { fetchMarketplaceCatalog } from '../../../services/api/marketplaceApi';
import { useMarketplaceStore } from '../../../stores/marketplaceStore';

const mockedFetch = vi.mocked(fetchMarketplaceCatalog);

function catalog(over: Partial<HarnessMarketplaceCatalogResponse> = {}): HarnessMarketplaceCatalogResponse {
  return {
    marketplaces: ['claude-plugins-official'],
    entries: [
      { key: 'context7@claude-plugins-official', name: 'context7', marketplace: 'claude-plugins-official', pluginType: 'external-mcp', installed: false },
    ],
    errors: [],
    ...over,
  };
}

describe('MarketplacePanel', () => {
  beforeEach(() => {
    useMarketplaceStore.getState().reset();
    mockedFetch.mockReset();
  });

  it('renders a card per catalog entry after load', async () => {
    mockedFetch.mockResolvedValue(catalog());
    render(<MarketplacePanel projectSlug="p" />);
    await waitFor(() => expect(screen.getByTestId('marketplace-card')).toBeInTheDocument());
  });

  it('renders the AC6 format-warning banner', async () => {
    mockedFetch.mockResolvedValue(catalog({ formatWarning: { detectedVersion: 99, reason: 'unrecognizedVersion' } }));
    render(<MarketplacePanel projectSlug="p" />);
    await waitFor(() => expect(screen.getByTestId('marketplace-format-warning')).toBeInTheDocument());
  });

  it('renders AC5 per-market error badges', async () => {
    mockedFetch.mockResolvedValue(catalog({ errors: [{ marketplace: 'bad', code: 'HARNESS_PARSE_ERROR' }] }));
    render(<MarketplacePanel projectSlug="p" />);
    await waitFor(() => expect(screen.getByTestId('marketplace-market-errors')).toBeInTheDocument());
    expect(screen.getAllByTestId('marketplace-market-error')).toHaveLength(1);
  });

  it('opens the add-marketplace modal from the add button', async () => {
    mockedFetch.mockResolvedValue(catalog());
    render(<MarketplacePanel projectSlug="p" />);
    await waitFor(() => expect(screen.getByTestId('marketplace-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('marketplace-add-button'));
    expect(screen.getByTestId('marketplace-modal-url-input')).toBeInTheDocument();
  });

  it('opens the install guide modal from a card install button', async () => {
    mockedFetch.mockResolvedValue(catalog());
    render(<MarketplacePanel projectSlug="p" />);
    await waitFor(() => expect(screen.getByTestId('marketplace-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('marketplace-card-install'));
    expect(screen.getByTestId('marketplace-modal-command').textContent).toBe(
      '/plugin install context7@claude-plugins-official',
    );
  });
});
