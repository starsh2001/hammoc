/**
 * Story 28.1: harnessPluginStore tests.
 *
 * Covers:
 *  - load success path populates cards/format/currentProjectPath
 *  - toggle optimistic update + rollback on failure
 *  - handleExternalChange refetches on tracked user-scope paths,
 *    ignores project-scope payloads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HarnessPluginCard, HarnessPluginListResponse } from '@hammoc/shared';

vi.mock('../../services/api/harnessPluginsApi', () => ({
  listPlugins: vi.fn(),
  togglePlugin: vi.fn(),
}));

import { listPlugins, togglePlugin } from '../../services/api/harnessPluginsApi';
import { useHarnessPluginStore } from '../harnessPluginStore';
import { ApiError } from '../../services/api/client';

const mockedList = vi.mocked(listPlugins);
const mockedToggle = vi.mocked(togglePlugin);

function sampleCard(overrides: Partial<HarnessPluginCard> = {}): HarnessPluginCard {
  return {
    key: 'context7@claude-plugins-official',
    name: 'context7',
    marketplace: 'claude-plugins-official',
    version: 'aaaaaaa',
    scope: 'user',
    enabled: false,
    pluginType: 'standard',
    componentCounts: { skills: 0, commands: 1, agents: 0, hooks: 0, mcpServers: 0 },
    ...overrides,
  };
}

describe('harnessPluginStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessPluginStore.getState().reset();
  });
  afterEach(() => {
    useHarnessPluginStore.getState().reset();
  });

  it('load: stores cards, format, currentProjectPath, mtime, and lastProjectSlug', async () => {
    const resp: HarnessPluginListResponse = {
      cards: [sampleCard()],
      enabledPluginsFormat: 'object',
      currentProjectPath: 'C:/proj',
      settingsMtime: '2026-04-24T10:00:00Z',
    };
    mockedList.mockResolvedValueOnce(resp);

    await useHarnessPluginStore.getState().load('slug');

    const s = useHarnessPluginStore.getState();
    expect(s.cards).toHaveLength(1);
    expect(s.enabledPluginsFormat).toBe('object');
    expect(s.currentProjectPath).toBe('C:/proj');
    expect(s.settingsMtime).toBe('2026-04-24T10:00:00Z');
    expect(s.lastProjectSlug).toBe('slug');
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeUndefined();
  });

  it('load: reseeds settingsMtime on every call (STORE-001 regression)', async () => {
    const card = sampleCard({ enabled: false });
    mockedList.mockResolvedValueOnce({
      cards: [card],
      enabledPluginsFormat: 'object',
      settingsMtime: 'old',
    });
    await useHarnessPluginStore.getState().load('slug');
    expect(useHarnessPluginStore.getState().settingsMtime).toBe('old');

    mockedList.mockResolvedValueOnce({
      cards: [card],
      enabledPluginsFormat: 'object',
      settingsMtime: 'new',
    });
    await useHarnessPluginStore.getState().load('slug');
    expect(useHarnessPluginStore.getState().settingsMtime).toBe('new');
  });

  it('toggle: optimistic flip + banner on success', async () => {
    const card = sampleCard({ enabled: false });
    mockedList.mockResolvedValueOnce({
      cards: [card],
      enabledPluginsFormat: 'object',
      settingsMtime: '2026-04-23T00:00:00Z',
    });
    mockedToggle.mockResolvedValueOnce({
      success: true,
      mtime: '2026-04-24T00:00:00Z',
      appliedFormat: 'object',
    });

    await useHarnessPluginStore.getState().load('slug');
    await useHarnessPluginStore.getState().toggle(card.key, true, 'slug');

    const s = useHarnessPluginStore.getState();
    expect(s.cards[0].enabled).toBe(true);
    expect(s.settingsMtime).toBe('2026-04-24T00:00:00Z');
    expect(s.bannerVisible).toBe(true);
    expect(s.error).toBeUndefined();
  });

  it('toggle: reverts optimistic flip on API failure (non-stale)', async () => {
    const card = sampleCard({ enabled: false });
    mockedList.mockResolvedValueOnce({
      cards: [card],
      enabledPluginsFormat: 'object',
      settingsMtime: '2026-04-24T00:00:00Z',
    });
    mockedToggle.mockRejectedValueOnce(
      new ApiError(403, 'HARNESS_PLUGIN_SCOPE_DENIED', 'denied'),
    );

    await useHarnessPluginStore.getState().load('slug');
    await useHarnessPluginStore.getState().toggle(card.key, true, 'slug');

    const s = useHarnessPluginStore.getState();
    expect(s.cards[0].enabled).toBe(false); // reverted
    expect(s.bannerVisible).toBe(false);
    expect(s.error?.code).toBe('HARNESS_PLUGIN_SCOPE_DENIED');
  });

  it('toggle: on STALE_WRITE reloads and surfaces notice', async () => {
    const card = sampleCard({ enabled: false });
    mockedList.mockResolvedValueOnce({
      cards: [card],
      enabledPluginsFormat: 'object',
      settingsMtime: 'old-mtime',
    });
    mockedToggle.mockRejectedValueOnce(
      new ApiError(409, 'HARNESS_STALE_WRITE', 'stale', { currentMtime: 'new' }),
    );
    // second load() fires after stale-write recovery — authoritative mtime
    mockedList.mockResolvedValueOnce({
      cards: [sampleCard({ enabled: true })],
      enabledPluginsFormat: 'object',
      settingsMtime: 'fresh-mtime',
    });

    await useHarnessPluginStore.getState().load('slug');
    await useHarnessPluginStore.getState().toggle(card.key, true, 'slug');

    expect(mockedList).toHaveBeenCalledTimes(2);
    const s = useHarnessPluginStore.getState();
    expect(s.cards[0].enabled).toBe(true);
    expect(s.error?.code).toBe('HARNESS_STALE_WRITE');
    // STORE-001: recovery load must have refreshed the mtime so the *next*
    // toggle does not retrigger STALE_WRITE with the old value.
    expect(s.settingsMtime).toBe('fresh-mtime');
  });

  it('handleExternalChange: user-scope tracked path triggers reload with retained slug (STORE-002 regression)', async () => {
    mockedList.mockResolvedValueOnce({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '2026-04-24T00:00:00Z',
    });
    await useHarnessPluginStore.getState().load('my-slug');
    mockedList.mockClear();

    mockedList.mockResolvedValueOnce({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '2026-04-24T01:00:00Z',
    });
    useHarnessPluginStore.getState().handleExternalChange({
      scope: 'user',
      path: 'plugins/installed_plugins.json',
      type: 'modified',
    });
    await flushAsync();

    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedList).toHaveBeenCalledWith('my-slug');
  });

  it('handleExternalChange: settings.json triggers reload', async () => {
    mockedList.mockResolvedValue({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });
    useHarnessPluginStore.getState().handleExternalChange({
      scope: 'user',
      path: 'settings.json',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('handleExternalChange: marketplace.json under plugins/marketplaces/* triggers reload', async () => {
    mockedList.mockResolvedValue({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });
    useHarnessPluginStore.getState().handleExternalChange({
      scope: 'user',
      path: 'plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('handleExternalChange: project-scope payload is ignored', async () => {
    mockedList.mockResolvedValue({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });
    useHarnessPluginStore.getState().handleExternalChange({
      scope: 'project',
      path: 'plugins/installed_plugins.json',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(0);
  });

  it('handleExternalChange: non-tracked user-scope path is ignored', async () => {
    mockedList.mockResolvedValue({
      cards: [],
      enabledPluginsFormat: 'object',
      settingsMtime: '',
    });
    useHarnessPluginStore.getState().handleExternalChange({
      scope: 'user',
      path: 'skills/random/SKILL.md',
      type: 'modified',
    });
    await flushAsync();
    expect(mockedList).toHaveBeenCalledTimes(0);
  });
});

async function flushAsync(): Promise<void> {
  // Allow the microtask queue to settle (store.handleExternalChange calls load())
  await new Promise((r) => setTimeout(r, 0));
}
