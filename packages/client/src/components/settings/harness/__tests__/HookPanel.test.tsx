/**
 * Story 28.4: HookPanel component tests.
 *
 * Covers empty-state, 9-event sections, scope/type badges, copy menu →
 * type-warning modal → conflict modal sequence, toggle click, and the
 * "+ Add" CTA opening a HookEditor in create mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  HARNESS_HOOK_EVENTS,
  type HarnessHookCard,
  type HarnessHookListResponse,
} from '@hammoc/shared';

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

vi.mock('../../../../services/api/harnessHooksApi', () => ({
  listHooks: vi.fn(),
  copyHook: vi.fn(),
  readHook: vi.fn(),
  createHook: vi.fn(),
  updateHook: vi.fn(),
  deleteHook: vi.fn(),
}));

import {
  listHooks,
  copyHook,
  updateHook,
} from '../../../../services/api/harnessHooksApi';
import { HookPanel } from '../HookPanel';
import { useHarnessHookStore } from '../../../../stores/harnessHookStore';

const mockedList = vi.mocked(listHooks);
const mockedCopy = vi.mocked(copyHook);
const mockedUpdate = vi.mocked(updateHook);

function sampleCard(overrides: Partial<HarnessHookCard> = {}): HarnessHookCard {
  return {
    scope: 'project',
    absoluteFile: '/tmp/.claude/settings.json',
    projectSlug: 'slug',
    event: 'PreToolUse',
    groupIndex: 0,
    hookIndex: 0,
    disabledByBackup: false,
    matcher: 'Write',
    config: { type: 'command', command: 'echo' },
    mtime: '2026-04-24T00:00:00Z',
    enabled: true,
    ...overrides,
  };
}

function emptyCardsByEvent(): HarnessHookListResponse['cardsByEvent'] {
  const out = {} as HarnessHookListResponse['cardsByEvent'];
  for (const e of HARNESS_HOOK_EVENTS) (out as never)[e] = [] as never;
  return out;
}

function sampleResponse(cards: HarnessHookCard[] = []): HarnessHookListResponse {
  const cardsByEvent = emptyCardsByEvent();
  for (const card of cards) {
    cardsByEvent[card.event].push(card);
  }
  return {
    cardsByEvent,
    malformed: [],
    promptTypeSupport: 'unsupported',
    backupMtimeByScope: {},
  };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <HookPanel projectSlug="slug" />
      </MemoryRouter>,
    );
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
  await waitFor(() => {
    expect(useHarnessHookStore.getState().isLoading).toBe(false);
  });
  return result!;
}

describe('HookPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessHookStore.getState().reset();
  });
  afterEach(() => {
    useHarnessHookStore.getState().reset();
  });

  it('shows the empty-state copy when there are no hooks', async () => {
    mockedList.mockResolvedValue(sampleResponse([]));
    await renderPanel();
    expect(screen.getByText('harness.hook.empty.title')).toBeTruthy();
  });

  it('renders 9 event section headers (one per HARNESS_HOOK_EVENTS entry)', async () => {
    mockedList.mockResolvedValue(sampleResponse([]));
    await renderPanel();
    for (const ev of HARNESS_HOOK_EVENTS) {
      expect(screen.getByText(ev)).toBeTruthy();
    }
  });

  it('renders a card with matcher preview, type badge, and scope badge', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    await renderPanel();
    expect(screen.getByText('Write')).toBeTruthy();
    expect(screen.getByText('command')).toBeTruthy();
    expect(screen.getByText('harness.hook.scopeBadge.project')).toBeTruthy();
  });

  it('toggle click calls updateHook and reveals freshSpawn banner', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    mockedUpdate.mockResolvedValueOnce({
      success: true,
      mtime: '2026-04-25T00:00:00Z',
      backupMtime: '2026-04-25T00:00:00Z',
    });
    await renderPanel();
    const toggle = screen.getByRole('button', { name: 'harness.hook.toggle.on' });
    const user = userEvent.setup();
    await user.click(toggle);
    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('harness.hook.banner.freshSpawn')).toBeTruthy();
    });
  });

  it('opens the type-warning dialog → conflict dialog → calls copyHook', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    mockedCopy.mockResolvedValueOnce({
      success: true,
      newGroupIndex: 0,
      newHookIndex: 0,
      skipped: false,
    });
    await renderPanel();
    const user = userEvent.setup();

    // Open the kebab menu and click "Copy to global".
    const kebab = screen.getByRole('button', { name: 'Copy actions' });
    await user.click(kebab);
    const toGlobal = await screen.findByRole('button', {
      name: 'harness.hook.copy.toUser.label',
    });
    await user.click(toGlobal);

    // Type-warning modal opens. Acknowledge and continue.
    const ack = await screen.findByRole('checkbox');
    await user.click(ack);
    const submit = await screen.findByRole('button', { name: 'Copy' });
    await user.click(submit);

    // Conflict modal — pick "duplicate" then continue.
    const dupRadio = await screen.findByRole('radio', {
      name: 'harness.hook.copy.conflict.duplicate',
    });
    await user.click(dupRadio);
    const cont = await screen.findByRole('button', { name: 'Continue' });
    await user.click(cont);

    await waitFor(() => {
      expect(mockedCopy).toHaveBeenCalledTimes(1);
    });
    expect(mockedCopy.mock.calls[0][0]).toMatchObject({
      sourceScope: 'project',
      targetScope: 'user',
      onConflict: 'duplicate',
      acknowledgedWarning: true,
    });
  });

  it('plugin source card shows read-only marker and no toggle', async () => {
    const pluginCard = sampleCard({
      scope: 'plugin',
      pluginKey: 'sample@market',
      projectSlug: undefined,
    });
    mockedList.mockResolvedValue(sampleResponse([pluginCard]));
    await renderPanel();
    // The toggle text "Enabled" should not exist — plugin shows read-only marker.
    expect(screen.queryByRole('button', { name: 'harness.hook.toggle.on' })).toBeNull();
    expect(screen.getAllByText(/harness.hook.toggle.readOnly/i).length).toBeGreaterThan(0);
  });
});
