// @vitest-environment jsdom
/**
 * Story 31.4 (Task C.4): unit tests for the 3 marketplace widgets —
 * MarketplaceCard (badges/counts/install vs uninstall), MarketplaceFilters
 * (store-backed filter changes), InstallGuideModal (command per mode, URL form,
 * copy, close). i18n is stubbed to return the key.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
  // i18n.ts (pulled in via the store → api client chain) calls
  // `.use(initReactI18next)` at module load, so the mock must provide it.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { MarketplaceCard } from '../MarketplaceCard';
import { MarketplaceFilters } from '../MarketplaceFilters';
import { InstallGuideModal } from '../InstallGuideModal';
import { useMarketplaceStore } from '../../../../../stores/marketplaceStore';
import type { HarnessMarketplaceCatalogEntry } from '@hammoc/shared';

const entry = (over: Partial<HarnessMarketplaceCatalogEntry> = {}): HarnessMarketplaceCatalogEntry => ({
  key: 'context7@claude-plugins-official',
  name: 'context7',
  marketplace: 'claude-plugins-official',
  pluginType: 'external-mcp',
  installed: false,
  ...over,
});

describe('MarketplaceCard', () => {
  it('renders name, type badge, and an Install button when not installed', () => {
    const onInstall = vi.fn();
    render(<MarketplaceCard entry={entry({ description: 'docs lookup' })} onInstall={onInstall} onUninstall={vi.fn()} />);
    expect(screen.getByTestId('marketplace-card')).toBeTruthy();
    expect(screen.getByTestId('marketplace-type-badge').textContent).toContain('externalMcp');
    fireEvent.click(screen.getByTestId('marketplace-card-install'));
    expect(onInstall).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('marketplace-card-installed-badge')).toBeNull();
  });

  it('renders an installed badge + Uninstall button when installed', () => {
    const onUninstall = vi.fn();
    render(<MarketplaceCard entry={entry({ installed: true })} onInstall={vi.fn()} onUninstall={onUninstall} />);
    expect(screen.getByTestId('marketplace-card-installed-badge')).toBeTruthy();
    fireEvent.click(screen.getByTestId('marketplace-card-uninstall'));
    expect(onUninstall).toHaveBeenCalledOnce();
  });

  it('renders component counts only for non-zero kinds', () => {
    render(
      <MarketplaceCard
        entry={entry({ componentCounts: { skills: 2, commands: 0, agents: 0, hooks: 0, mcpServers: 1 } })}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );
    const card = screen.getByTestId('marketplace-card');
    expect(card.textContent).toContain('harness.marketplace.counts.skills');
    expect(card.textContent).toContain('harness.marketplace.counts.mcpServers');
    expect(card.textContent).not.toContain('harness.marketplace.counts.commands');
  });
});

describe('MarketplaceFilters', () => {
  beforeEach(() => {
    useMarketplaceStore.getState().reset();
    useMarketplaceStore.setState({
      entries: [
        entry({ key: 'a@m', category: 'development' }),
        entry({ key: 'b@m', category: 'productivity' }),
      ],
    });
  });

  it('lists distinct categories and updates store filters on change', () => {
    render(<MarketplaceFilters />);
    const categorySelect = screen.getByTestId('marketplace-filter-category') as HTMLSelectElement;
    // 2 categories + the "all" option
    expect(categorySelect.querySelectorAll('option')).toHaveLength(3);

    fireEvent.change(categorySelect, { target: { value: 'development' } });
    expect(useMarketplaceStore.getState().filters.category).toBe('development');

    fireEvent.change(screen.getByTestId('marketplace-filter-type'), { target: { value: 'external-mcp' } });
    expect(useMarketplaceStore.getState().filters.pluginType).toBe('external-mcp');

    fireEvent.change(screen.getByTestId('marketplace-filter-installed'), { target: { value: 'installed' } });
    expect(useMarketplaceStore.getState().filters.installed).toBe('installed');

    fireEvent.change(screen.getByTestId('marketplace-filter-search'), { target: { value: 'ctx' } });
    expect(useMarketplaceStore.getState().filters.search).toBe('ctx');
  });
});

describe('InstallGuideModal', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the install command for the entry key', () => {
    render(<InstallGuideModal mode="install" entryKey="context7@claude-plugins-official" onClose={vi.fn()} />);
    expect(screen.getByTestId('marketplace-modal-command').textContent).toBe(
      '/plugin install context7@claude-plugins-official',
    );
  });

  it('shows the uninstall command in uninstall mode', () => {
    render(<InstallGuideModal mode="uninstall" entryKey="context7@claude-plugins-official" onClose={vi.fn()} />);
    expect(screen.getByTestId('marketplace-modal-command').textContent).toBe(
      '/plugin uninstall context7@claude-plugins-official',
    );
  });

  it('builds the marketplace-add command live from the URL input', () => {
    render(<InstallGuideModal mode="add" onClose={vi.fn()} />);
    const input = screen.getByTestId('marketplace-modal-url-input');
    fireEvent.change(input, { target: { value: 'https://github.com/acme/market' } });
    expect(screen.getByTestId('marketplace-modal-command').textContent).toBe(
      '/plugin marketplace add https://github.com/acme/market',
    );
  });

  it('copies the command and fires onClose', () => {
    const onClose = vi.fn();
    render(<InstallGuideModal mode="install" entryKey="x@m" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('marketplace-modal-copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/plugin install x@m');
    fireEvent.click(screen.getByTestId('marketplace-modal-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
