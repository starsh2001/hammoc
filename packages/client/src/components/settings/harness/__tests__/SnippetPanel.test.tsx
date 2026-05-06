/**
 * Story 29.2 (Task 5.8 part): SnippetPanel component tests.
 *
 * Covers:
 *  - mount triggers store.load with the project slug
 *  - the Snippets section renders the SystemBadge variant="hammoc"
 *  - the Favorites section renders the SystemBadge variant="claudeCode"
 *  - the empty-state CTA fires when there are no cards
 *  - card grid renders one article per snippet with the scope pill
 *  - scope filter narrows the visible card grid
 *  - favorite reorder via Arrow keys keeps focus and calls reorderFavorites
 *  - the MAX_FAVORITES guard disables the "Add favorite" CTA
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SnippetCard } from '@hammoc/shared';

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

// Lightweight CodeMirror mock so the editor modal can mount without paying the
// runtime cost when a card click opens it. Tests in this file do not exercise
// the editor body — that's covered by SnippetEditor.test.tsx.
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <textarea data-testid="cm-mock" value={value} readOnly />,
}));
vi.mock('@codemirror/lang-markdown', () => ({ markdown: () => ({ extension: 'md' }) }));
vi.mock('../snippetTokenHighlight', async () => {
  const actual = await vi.importActual<typeof import('../snippetTokenHighlight')>(
    '../snippetTokenHighlight',
  );
  return { ...actual, snippetTokenHighlightExtension: { extension: 'sth' } };
});

vi.mock('../../../../services/api/snippetsApi', () => ({
  listSnippets: vi.fn(),
  readSnippet: vi.fn(),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  copySnippet: vi.fn(),
}));

// Stub the project store so the panel can resolve the working directory.
vi.mock('../../../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ projects: [{ projectSlug: 'slug', originalPath: '/tmp/proj' }] }),
}));

// Stub favorite + slash command hooks. The panel passes the favoriteCommands
// array directly to the rendering layer, so a controllable mock keeps the test
// surface minimal and deterministic.
const reorderSpy = vi.fn();
const removeSpy = vi.fn();
const addSpy = vi.fn();
let favoriteCommandsMock: Array<{ command: string; scope?: 'project' | 'global' }> = [];

vi.mock('../../../../hooks/useFavoriteCommands', () => ({
  useFavoriteCommands: () => ({
    favoriteCommands: favoriteCommandsMock,
    addFavorite: addSpy,
    removeFavorite: removeSpy,
    reorderFavorites: reorderSpy,
    isFavorite: (cmd: string) =>
      favoriteCommandsMock.some((entry) => entry.command === cmd),
  }),
}));

vi.mock('../../../../hooks/useSlashCommands', () => ({
  useSlashCommands: () => ({
    commands: [
      { command: '/foo', name: '/foo', description: 'foo desc' },
      { command: '/bar', name: '/bar', description: 'bar desc' },
    ],
  }),
}));

import { listSnippets } from '../../../../services/api/snippetsApi';
import { SnippetPanel } from '../SnippetPanel';
import { useSnippetStore } from '../../../../stores/snippetStore';

const mockedList = vi.mocked(listSnippets);

function sampleCard(overrides: Partial<SnippetCard> = {}): SnippetCard {
  return {
    scope: 'project',
    name: 'commit-and-done',
    preview: 'first body line',
    mtime: '2026-05-07T00:00:00.000Z',
    size: 32,
    ...overrides,
  };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<SnippetPanel projectSlug="slug" />);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  });
  return result!;
}

describe('SnippetPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSnippetStore.getState().reset();
    favoriteCommandsMock = [];
  });
  afterEach(() => {
    useSnippetStore.getState().reset();
  });

  it('triggers store.load with the project slug on mount', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    await renderPanel();
    expect(mockedList).toHaveBeenCalledWith('slug');
  });

  it('renders the Snippets section with the Hammoc system badge', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('system-badge-hammoc')).toBeTruthy();
    });
  });

  it('renders the Favorites section with the Claude Code system badge', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('system-badge-claudeCode')).toBeTruthy();
    });
  });

  it('shows the empty-state CTA when there are no snippets', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('snippets-empty-state')).toBeTruthy();
    });
  });

  it('renders one card per snippet with the scope pill', async () => {
    mockedList.mockResolvedValue({
      snippets: [
        sampleCard({ name: 'a', scope: 'project' }),
        sampleCard({ name: 'b', scope: 'user' }),
        sampleCard({ name: 'c', scope: 'bundled' }),
      ],
    });
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('snippet-card-project-a')).toBeTruthy();
    });
    expect(screen.getByTestId('snippet-card-user-b')).toBeTruthy();
    expect(screen.getByTestId('snippet-card-bundled-c')).toBeTruthy();
    expect(screen.getByTestId('snippet-scope-pill-project')).toBeTruthy();
  });

  it('narrows the card grid when a scope filter is selected', async () => {
    mockedList.mockResolvedValue({
      snippets: [
        sampleCard({ name: 'a', scope: 'project' }),
        sampleCard({ name: 'g', scope: 'user' }),
      ],
    });
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('snippet-card-project-a')).toBeTruthy();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-filter-user'));
    await waitFor(() => {
      expect(screen.queryByTestId('snippet-card-project-a')).toBeNull();
    });
    expect(screen.getByTestId('snippet-card-user-g')).toBeTruthy();
  });

  it('reorders favorites with ArrowDown and reports the new order via reorderFavorites', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    favoriteCommandsMock = [
      { command: '/foo', scope: 'project' },
      { command: '/bar', scope: 'project' },
    ];
    await renderPanel();
    const row0 = await screen.findByTestId('favorite-row-0');
    fireEvent.keyDown(row0, { key: 'ArrowDown' });
    expect(reorderSpy).toHaveBeenCalledTimes(1);
    expect(reorderSpy.mock.calls[0][0].map((e: { command: string }) => e.command)).toEqual([
      '/bar',
      '/foo',
    ]);
  });

  it('disables the Add favorite CTA when MAX_FAVORITES is reached', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    favoriteCommandsMock = Array.from({ length: 20 }, (_, i) => ({
      command: `/cmd-${i}`,
      scope: 'project' as const,
    }));
    await renderPanel();
    const cta = await screen.findByTestId('favorites-add-cta');
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks deleted favorites as "Not found"', async () => {
    mockedList.mockResolvedValue({ snippets: [] });
    favoriteCommandsMock = [{ command: '/missing', scope: 'project' }];
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeTruthy();
    });
  });
});
