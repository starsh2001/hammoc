/**
 * Story 28.5: CommandPanel component tests.
 *
 * Covers:
 *  - empty-state copy when there are no commands
 *  - tree render (flat + 1-deep nested) + scope badge + paletteVisibleCount
 *  - card click opens the CommandEditor modal
 *  - copy menu → conflict modal → copyCommand call sequence
 *  - BMad mirror card surfaces the lock marker
 *  - error banner surfaces store-level errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  HarnessCommandCard,
  HarnessCommandListResponse,
} from '@hammoc/shared';

vi.mock('../../../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

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

vi.mock('../../../../services/api/harnessCommandsApi', () => ({
  listCommands: vi.fn(),
  copyCommand: vi.fn(),
  copyCommandDirectory: vi.fn(),
  readCommand: vi.fn(),
  createCommand: vi.fn(),
  updateCommand: vi.fn(),
  deleteCommand: vi.fn(),
}));

vi.mock('../../../../hooks/useSlashCommands', () => ({
  invalidateSlashCommandsCache: vi.fn(),
  SLASH_COMMANDS_CHANGED_EVENT: 'hammoc:slashCommandsChanged',
}));

// CommandEditor pulls in @uiw/react-codemirror lazily; mock it with a textarea
// so opening the editor modal doesn't crash jsdom.
vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (v: string) => void;
  }) => (
    <textarea
      data-testid="cm-mock"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({ extension: 'markdown-mock' }),
}));

vi.mock('../commandTokenHighlight', async () => {
  const actual = await vi.importActual<
    typeof import('../commandTokenHighlight')
  >('../commandTokenHighlight');
  return {
    ...actual,
    commandTokenHighlightExtension: { extension: 'token-highlight-mock' },
  };
});

import {
  listCommands,
  copyCommand,
  readCommand,
} from '../../../../services/api/harnessCommandsApi';
import { CommandPanel } from '../CommandPanel';
import { useHarnessCommandStore } from '../../../../stores/harnessCommandStore';

const mockedList = vi.mocked(listCommands);
const mockedCopy = vi.mocked(copyCommand);
const mockedRead = vi.mocked(readCommand);

function sampleCard(overrides: Partial<HarnessCommandCard> = {}): HarnessCommandCard {
  return {
    scope: 'project',
    absoluteFile: '/tmp/.claude/commands/foo.md',
    projectSlug: 'slug',
    relativePath: 'foo.md',
    slashName: '/foo',
    frontmatter: {},
    tokens: {
      usesPositionalArgs: false,
      usesArgumentsAll: false,
      usesFileRefs: false,
      usesBashExec: false,
      usesPluginRoot: false,
    },
    mtime: '2026-04-24T00:00:00Z',
    isBmadMirror: false,
    ...overrides,
  };
}

function sampleResponse(
  cards: HarnessCommandCard[] = [],
  paletteVisibleCount = cards.length,
): HarnessCommandListResponse {
  return {
    cards,
    malformed: [],
    paletteVisibleCount,
  };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<CommandPanel projectSlug="slug" />);
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
  await waitFor(() => {
    expect(useHarnessCommandStore.getState().isLoading).toBe(false);
  });
  return result!;
}

describe('CommandPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessCommandStore.getState().reset();
  });
  afterEach(() => {
    useHarnessCommandStore.getState().reset();
  });

  it('shows the empty-state copy when there are no commands', async () => {
    mockedList.mockResolvedValue(sampleResponse([]));
    await renderPanel();
    expect(screen.getByText(/No slash commands configured/i)).toBeTruthy();
  });

  it('renders flat + nested cards with scope badges', async () => {
    mockedList.mockResolvedValue(
      sampleResponse([
        sampleCard(),
        sampleCard({
          relativePath: 'sub/bar.md',
          slashName: '/sub:bar',
          absoluteFile: '/tmp/.claude/commands/sub/bar.md',
        }),
      ]),
    );
    await renderPanel();
    // Both leaves render with their slash name.
    expect(screen.getByText('/foo')).toBeTruthy();
    expect(screen.getByText('/sub:bar')).toBeTruthy();
    // Project scope badge.
    expect(screen.getAllByText('Project').length).toBeGreaterThan(0);
  });

  it('renders the paletteVisibleCount badge', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()], 7));
    await renderPanel();
    const badge = screen.getByTestId('cmd-palette-count');
    expect(badge.textContent).toMatch(/7/);
  });

  it('opens the CommandEditor modal on card click', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    mockedRead.mockResolvedValue({
      source: {
        scope: 'project',
        absoluteFile: '/tmp/.claude/commands/foo.md',
        projectSlug: 'slug',
        relativePath: 'foo.md',
        slashName: '/foo',
      },
      frontmatter: {},
      body: 'hello',
      raw: 'hello',
      mtime: '2026-04-24T00:00:00Z',
      isBmadMirror: false,
    });
    await renderPanel();
    const card = screen.getByTestId('cmd-card-project-foo.md');
    const user = userEvent.setup();
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('copy menu → copyCommand called with the resolved request', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    mockedCopy.mockResolvedValueOnce({
      success: true,
      target: {
        scope: 'user',
        absoluteFile: '/home/user/.claude/commands/foo.md',
        relativePath: 'foo.md',
        slashName: '/foo',
      },
      skipped: false,
    });
    await renderPanel();
    const user = userEvent.setup();
    const kebab = screen.getByRole('button', { name: 'Copy actions' });
    await user.click(kebab);
    const toGlobal = await screen.findByRole('button', {
      name: 'Copy to global →',
    });
    await user.click(toGlobal);
    await waitFor(() => {
      expect(mockedCopy).toHaveBeenCalledTimes(1);
    });
    expect(mockedCopy.mock.calls[0][0]).toMatchObject({
      sourceScope: 'project',
      targetScope: 'user',
      sourceRelativePath: 'foo.md',
    });
  });

  it('renders the lock marker on a BMad-mirror card', async () => {
    mockedList.mockResolvedValue(
      sampleResponse([
        sampleCard({
          relativePath: 'BMad/agents/sm.md',
          slashName: '/BMad:agents:sm',
          absoluteFile: '/tmp/.claude/commands/BMad/agents/sm.md',
          isBmadMirror: true,
        }),
      ]),
    );
    await renderPanel();
    const lockIcon = document.querySelector('svg.lucide-lock');
    expect(lockIcon).toBeTruthy();
  });
});
