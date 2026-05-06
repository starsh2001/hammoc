/**
 * Story 29.2 (Task 5.8 part): SnippetEditor component tests.
 *
 * `@uiw/react-codemirror` is mocked with a textarea so the lazy import succeeds
 * and the change pipe (onChange → setActiveDraft → debounce save) can be
 * exercised without paying the CodeMirror runtime cost.
 *
 * Covers:
 *  - editor opens the snippet via store.open() and renders body content
 *  - bundled snippets render the read-only banner and lock the textarea
 *  - editing the body schedules a debounced save through updateSnippet
 *  - self-reference (%cardName% appearing in the body) surfaces the inline warning
 *  - clicking the close affordance triggers onClose
 *  - the resolved absolute path is shown for orientation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SnippetCard, SnippetReadResponse } from '@hammoc/shared';

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

vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    onChange,
    editable,
  }: {
    value: string;
    onChange?: (v: string) => void;
    editable?: boolean;
  }) => (
    <textarea
      data-testid="cm-mock"
      value={value}
      readOnly={editable === false}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({ extension: 'markdown-mock' }),
}));

vi.mock('../snippetTokenHighlight', async () => {
  const actual = await vi.importActual<typeof import('../snippetTokenHighlight')>(
    '../snippetTokenHighlight',
  );
  return {
    ...actual,
    snippetTokenHighlightExtension: { extension: 'snippet-token-highlight-mock' },
  };
});

vi.mock('../../../../services/api/snippetsApi', () => ({
  listSnippets: vi.fn(),
  readSnippet: vi.fn(),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  copySnippet: vi.fn(),
}));

import {
  readSnippet,
  updateSnippet,
} from '../../../../services/api/snippetsApi';
import { SnippetEditor } from '../SnippetEditor';
import { useSnippetStore } from '../../../../stores/snippetStore';

const mockedRead = vi.mocked(readSnippet);
const mockedUpdate = vi.mocked(updateSnippet);

function sampleCard(overrides: Partial<SnippetCard> = {}): SnippetCard {
  return {
    scope: 'project',
    name: 'commit-and-done',
    preview: 'first line of body',
    mtime: '2026-05-07T00:00:00.000Z',
    size: 24,
    ...overrides,
  };
}

function sampleRead(overrides: Partial<SnippetReadResponse> = {}): SnippetReadResponse {
  return {
    scope: 'project',
    name: 'commit-and-done',
    content: 'body line one\nbody line two',
    mtime: '2026-05-07T00:00:00.000Z',
    size: 24,
    absolutePath: '/tmp/.hammoc/snippets/commit-and-done.md',
    ...overrides,
  };
}

async function renderEditor(card = sampleCard()) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<SnippetEditor card={card} projectSlug="slug" onClose={() => {}} />);
    // Resolve the lazy CodeMirror dynamic import.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return result!;
}

describe('SnippetEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useSnippetStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    useSnippetStore.getState().reset();
  });

  it('opens the snippet via the store and renders the body content', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    await waitFor(() => {
      const ta = screen.getByTestId('cm-mock') as HTMLTextAreaElement;
      expect(ta.value).toBe('body line one\nbody line two');
    });
    expect(mockedRead).toHaveBeenCalledWith({
      scope: 'project',
      name: 'commit-and-done',
      projectSlug: 'slug',
    });
  });

  it('renders the bundled-readonly banner and locks the textarea for bundled snippets', async () => {
    mockedRead.mockResolvedValue(sampleRead({ scope: 'bundled' }));
    await renderEditor(sampleCard({ scope: 'bundled' }));
    await waitFor(() => {
      expect(screen.getByText(/bundled snippet/i)).toBeTruthy();
    });
    const ta = (await screen.findByTestId('cm-mock')) as HTMLTextAreaElement;
    expect(ta.readOnly).toBe(true);
  });

  it('shows the absolute path so the user can locate the file on disk', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    await waitFor(() => {
      expect(
        screen.getByText('/tmp/.hammoc/snippets/commit-and-done.md'),
      ).toBeTruthy();
    });
  });

  it('debounces auto-save and forwards the new body via updateSnippet', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    mockedUpdate.mockResolvedValue({
      success: true,
      size: 9,
      mtime: '2026-05-07T00:01:00.000Z',
    });
    // listSnippets is called by save → store.load(); satisfy it lazily.
    const { listSnippets } = await import('../../../../services/api/snippetsApi');
    vi.mocked(listSnippets).mockResolvedValue({ snippets: [] });

    await renderEditor();
    const ta = (await screen.findByTestId('cm-mock')) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'fresh body' } });
      // Debounce window is 300ms; advance just past it.
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate.mock.calls[0][1]).toBe('fresh body');
  });

  it('shows the inline self-reference warning when the body references itself', async () => {
    mockedRead.mockResolvedValue(sampleRead({ content: 'use %commit-and-done% here' }));
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId('snippet-cycle-warning').textContent).toMatch(
        /references itself/i,
      );
    });
  });

  it('triggers onClose when the backdrop is clicked', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    const onClose = vi.fn();
    await act(async () => {
      render(<SnippetEditor card={sampleCard()} projectSlug="slug" onClose={onClose} />);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    const dialog = await screen.findByTestId('snippet-editor');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });
});
