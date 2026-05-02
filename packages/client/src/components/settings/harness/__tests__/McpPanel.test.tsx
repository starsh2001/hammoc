/**
 * Story 28.3: McpPanel component tests.
 *
 * Covers empty-state, card rendering with type/scope badges, copy menu reveal,
 * the secret modal → conflict modal sequence, and toggle click behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HarnessMcpCard } from '@hammoc/shared';

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

// Echo i18n keys back so assertions stay locale-independent.
vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object' && opts.defaultValue) {
          return String(opts.defaultValue);
        }
        return key;
      },
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

vi.mock('../../../../services/api/harnessMcpsApi', () => ({
  listMcps: vi.fn(),
  copyMcp: vi.fn(),
  readMcp: vi.fn(),
  updateMcp: vi.fn(),
  deleteMcp: vi.fn(),
}));

import { listMcps, copyMcp, updateMcp } from '../../../../services/api/harnessMcpsApi';
import { McpPanel } from '../McpPanel';
import { useHarnessMcpStore } from '../../../../stores/harnessMcpStore';

const mockedList = vi.mocked(listMcps);
const mockedCopy = vi.mocked(copyMcp);
const mockedUpdate = vi.mocked(updateMcp);

function sampleCard(overrides: Partial<HarnessMcpCard> = {}): HarnessMcpCard {
  return {
    name: 'foo',
    activeType: 'stdio',
    enabled: true,
    activeScope: 'user',
    sources: [
      {
        scope: 'user',
        absoluteFile: '/tmp/.mcp.json',
        sourceFileKind: 'mcp.json',
        config: { command: 'echo' },
        mtime: '2026-04-24T00:00:00Z',
        disabledByBackup: false,
      },
    ],
    ...overrides,
  };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <McpPanel projectSlug="slug" />
      </MemoryRouter>,
    );
    for (let i = 0; i < 3; i++) await Promise.resolve();
  });
  await waitFor(() => {
    expect(useHarnessMcpStore.getState().isLoading).toBe(false);
  });
  return result!;
}

describe('McpPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    useHarnessMcpStore.getState().reset();
  });
  afterEach(() => {
    useHarnessMcpStore.getState().reset();
  });

  it('renders the empty-state when there are no cards', async () => {
    mockedList.mockResolvedValueOnce({
      cards: [],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    await renderPanel();
    expect(screen.getByText('harness.mcp.empty.title')).toBeInTheDocument();
    expect(screen.getByText('harness.mcp.empty.description')).toBeInTheDocument();
  });

  it('shows the noGlobalSupport hint when userFileKind is null', async () => {
    mockedList.mockResolvedValueOnce({
      cards: [],
      malformed: [],
      userFileKind: null,
      disableStrategy: 'backup',
    });
    await renderPanel();
    expect(screen.getByText('harness.mcp.empty.noGlobalSupport')).toBeInTheDocument();
  });

  it('renders a card with type + scope badges and toggle button', async () => {
    mockedList.mockResolvedValueOnce({
      cards: [sampleCard()],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    await renderPanel();
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('harness.mcp.scopeBadge.user')).toBeInTheDocument();
    expect(screen.getByText('stdio')).toBeInTheDocument();
    expect(screen.getByText('harness.mcp.toggle.on')).toBeInTheDocument();
  });

  it('opens the copy menu and triggers the conflict dialog', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce({
      cards: [sampleCard()],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    await renderPanel();
    await user.click(screen.getByLabelText(/copy actions/i));
    const item = await screen.findByText(/harness\.mcp\.copy\.toProject\.label/i);
    await user.click(item);
    expect(
      screen.getByRole('dialog', { name: /harness\.mcp\.copy\.conflict\.title/i }),
    ).toBeInTheDocument();
  });

  it('shows the secret modal when the active config contains plain secrets', async () => {
    const user = userEvent.setup();
    const card = sampleCard();
    card.sources[0].config = {
      type: 'http',
      url: 'https://x',
      headers: { Authorization: 'Bearer abcdefghijklmnopqrst' },
    };
    card.activeType = 'http';
    mockedList.mockResolvedValueOnce({
      cards: [card],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    await renderPanel();
    await user.click(screen.getByLabelText(/copy actions/i));
    await user.click(await screen.findByText(/harness\.mcp\.copy\.toProject\.label/i));
    expect(
      screen.getByRole('dialog', { name: /harness\.mcp\.copy\.secret\.title/i }),
    ).toBeInTheDocument();
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  it('toggle click sends updateMcp({enabled})', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({
      cards: [sampleCard()],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-25T00:00:00Z' });
    await renderPanel();
    await user.click(screen.getByText('harness.mcp.toggle.on'));
    expect(mockedUpdate).toHaveBeenCalledWith(
      'foo',
      expect.objectContaining({ scope: 'user' }),
      expect.objectContaining({ enabled: false }),
    );
  });

  it('AC2: shows freshSpawn banner + newSession CTA after a successful toggle', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({
      cards: [sampleCard()],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-25T00:00:00Z' });
    await renderPanel();
    expect(screen.queryByText('harness.mcp.banner.freshSpawn')).not.toBeInTheDocument();
    await user.click(screen.getByText('harness.mcp.toggle.on'));
    await waitFor(() => {
      expect(screen.getByText('harness.mcp.banner.freshSpawn')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'harness.mcp.banner.newSession' })).toBeInTheDocument();
  });

  it('AC2: newSession CTA dismisses banner and navigates to a new session', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({
      cards: [sampleCard()],
      malformed: [],
      userFileKind: 'mcp.json',
      disableStrategy: 'backup',
    });
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-25T00:00:00Z' });
    await renderPanel();
    await user.click(screen.getByText('harness.mcp.toggle.on'));
    const cta = await screen.findByRole('button', { name: 'harness.mcp.banner.newSession' });
    await user.click(cta);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/project\/slug\/session\//),
    );
    await waitFor(() => {
      expect(screen.queryByText('harness.mcp.banner.freshSpawn')).not.toBeInTheDocument();
    });
  });
});
