/**
 * Story 28.1: PluginPanel component tests.
 *
 * Covers AC1 (badges shown only for non-zero counts), AC2 (banner + new
 * session CTA), AC3 (scope gating disables the toggle + tooltip).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HarnessPluginCard } from '@hammoc/shared';

vi.mock('../../../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../../../services/api/harnessPluginsApi', () => ({
  listPlugins: vi.fn(),
  togglePlugin: vi.fn(),
}));

import { listPlugins, togglePlugin } from '../../../../services/api/harnessPluginsApi';
import { PluginPanel } from '../PluginPanel';
import { useHarnessPluginStore } from '../../../../stores/harnessPluginStore';

const mockedList = vi.mocked(listPlugins);
const mockedToggle = vi.mocked(togglePlugin);

const MARKET = 'claude-plugins-official';
const CURRENT_PROJECT_PATH = 'C:\\Users\\sh.choi';

function card(overrides: Partial<HarnessPluginCard> = {}): HarnessPluginCard {
  return {
    key: `context7@${MARKET}`,
    name: 'context7',
    marketplace: MARKET,
    version: 'aaaaaaa',
    scope: 'user',
    enabled: false,
    pluginType: 'standard',
    componentCounts: { skills: 0, commands: 2, agents: 0, hooks: 0, mcpServers: 0 },
    ...overrides,
  };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  // The mount-time effect calls store.load(); wrapping render + the microtask
  // flush inside act eliminates "not wrapped in act" warnings from the
  // asynchronous setState that follows listPlugins() resolving.
  await act(async () => {
    result = render(
      <MemoryRouter>
        <PluginPanel projectSlug="my-slug" />
      </MemoryRouter>,
    );
    // Flush microtasks so the load() setState completes inside this act.
    for (let i = 0; i < 3; i++) await Promise.resolve();
  });
  await waitFor(() => {
    expect(useHarnessPluginStore.getState().isLoading).toBe(false);
  });
  return result!;
}

describe('PluginPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessPluginStore.getState().reset();
  });

  afterEach(() => {
    useHarnessPluginStore.getState().reset();
  });

  it('AC1: renders only non-zero component count badges', async () => {
    mockedList.mockResolvedValueOnce({
      cards: [card({ componentCounts: { skills: 0, commands: 2, agents: 0, hooks: 0, mcpServers: 0 } })],
      enabledPluginsFormat: 'object',
      settingsMtime: '2026-04-24T00:00:00Z',
    });

    await renderPanel();

    expect(screen.getByText(/× 2/)).toBeInTheDocument();
    // No "× 0" badges should appear for agents/hooks/mcpServers/skills.
    expect(screen.queryByText(/× 0/)).toBeNull();
  });

  it('AC3: project-scope card with mismatched path renders disabled toggle', async () => {
    const projectCard = card({
      key: `frontend-design@${MARKET}`,
      name: 'frontend-design',
      scope: 'project',
      projectPath: 'D:/other',
    });
    mockedList.mockResolvedValueOnce({
      cards: [projectCard],
      enabledPluginsFormat: 'object',
      currentProjectPath: CURRENT_PROJECT_PATH,
      settingsMtime: '2026-04-24T00:00:00Z',
    });

    await renderPanel();

    const toggle = screen.getByRole('checkbox');
    expect(toggle).toBeDisabled();
    expect(toggle.closest('label')?.getAttribute('title')).toMatch(/scope|프로젝트|project/i);
  });

  it('AC3: project-scope card with matching path renders enabled toggle', async () => {
    const projectCard = card({
      key: `frontend-design@${MARKET}`,
      name: 'frontend-design',
      scope: 'project',
      projectPath: CURRENT_PROJECT_PATH,
    });
    mockedList.mockResolvedValueOnce({
      cards: [projectCard],
      enabledPluginsFormat: 'object',
      currentProjectPath: CURRENT_PROJECT_PATH,
      settingsMtime: '2026-04-24T00:00:00Z',
    });

    await renderPanel();

    const toggle = screen.getByRole('checkbox');
    expect(toggle).not.toBeDisabled();
  });

  it('AC2: renders banner after a successful toggle and CTA navigates to a new session', async () => {
    mockedList.mockResolvedValueOnce({
      cards: [card()],
      enabledPluginsFormat: 'object',
      settingsMtime: '2026-04-24T00:00:00Z',
    });
    mockedToggle.mockResolvedValueOnce({
      success: true,
      mtime: '2026-04-24T00:00:00Z',
      appliedFormat: 'object',
    });

    await renderPanel();

    // userEvent auto-wraps interactions in act and flushes pending microtasks,
    // which is what we need for the toggle()'s async setState.
    const user = userEvent.setup();
    const toggle = screen.getByRole('checkbox');
    await user.click(toggle);
    await waitFor(() => {
      expect(useHarnessPluginStore.getState().bannerVisible).toBe(true);
    });

    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();

    const cta = screen.getByRole('button', { name: /session|세션|sesión|会话|セッション|sessão/i });
    await user.click(cta);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const target = navigateMock.mock.calls[0][0] as string;
    expect(target).toMatch(/^\/project\/my-slug\/session\//);
  });
});
