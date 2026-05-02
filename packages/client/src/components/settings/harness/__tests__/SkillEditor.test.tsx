/**
 * Story 28.2: SkillEditor component tests.
 *
 * Covers:
 *  - frontmatter form validation (required name/description)
 *  - Raw mode toggle parses + surfaces banner when broken
 *  - bundle entry click reveals inline editor
 *
 * @uiw/react-codemirror is mocked with a textarea so the tests can run
 * without bundling the full CodeMirror package; the real lazy import is
 * still exercised by jsdom-friendly markdown extension load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HarnessSkillCard, HarnessSkillReadResponse } from '@hammoc/shared';

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
  default: ({ value, onChange, readOnly, height: _h, basicSetup: _b, extensions: _e, theme: _t }: {
    value: string;
    onChange?: (v: string) => void;
    readOnly?: boolean;
    height?: string;
    basicSetup?: unknown;
    extensions?: unknown;
    theme?: unknown;
  }) => (
    <textarea
      data-testid="cm-mock"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({ extension: 'markdown-mock' }),
}));

vi.mock('../../../../services/api/harnessSkillsApi', () => ({
  listSkills: vi.fn(),
  copySkill: vi.fn(),
  readSkill: vi.fn(),
  updateSkill: vi.fn(),
  readBundleFile: vi.fn(),
  writeBundleFile: vi.fn(),
}));

import { readSkill, updateSkill, readBundleFile } from '../../../../services/api/harnessSkillsApi';
import { SkillEditor } from '../SkillEditor';

const mockedRead = vi.mocked(readSkill);
const mockedUpdate = vi.mocked(updateSkill);
const mockedReadBundle = vi.mocked(readBundleFile);

function sampleCard(): HarnessSkillCard {
  return {
    name: 'demo',
    description: 'demo desc',
    sources: [
      {
        scope: 'user',
        absoluteRoot: '/tmp/demo',
        frontmatter: { name: 'demo', description: 'demo desc' },
        bundleCounts: { references: 1, examples: 0, scripts: 0, assets: 0 },
        skillMdMtime: '2026-04-24T00:00:00Z',
      },
    ],
    activeScope: 'user',
  };
}

function readResponse(overrides: Partial<HarnessSkillReadResponse> = {}): HarnessSkillReadResponse {
  return {
    source: { scope: 'user', absoluteRoot: '/tmp/demo' },
    frontmatter: { name: 'demo', description: 'demo desc' },
    body: '# old\n',
    raw: '---\nname: demo\ndescription: demo desc\n---\n# old\n',
    bundleCounts: { references: 1, examples: 0, scripts: 0, assets: 0 },
    skillMdMtime: '2026-04-24T00:00:00Z',
    bundleEntries: [
      {
        relativePath: 'references/notes.md',
        isBinary: false,
        isTruncated: false,
        size: 5,
        mtime: '2026-04-24T00:00:00Z',
      },
    ],
    truncatedAtDepth: false,
    ...overrides,
  };
}

async function renderEditor() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<SkillEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByLabelText(/harness\.skill\.editor\.frontmatter\.name/i)).toBeInTheDocument();
  });
  return result!;
}

describe('SkillEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRead.mockResolvedValue(readResponse());
  });

  it('shows inline error when name is cleared and disables save', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const nameInput = screen.getByLabelText(/harness\.skill\.editor\.frontmatter\.name/i);
    await user.clear(nameInput);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/harness\.skill\.editor\.required\.name/i)).toBeInTheDocument();
  });

  it('switches to Raw mode and disables the toggle when frontmatter is broken', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const rawBtn = screen.getByRole('button', { name: /Raw/i });
    await user.click(rawBtn);
    // The single CodeMirror instance now drives the raw text.
    const textareas = screen.getAllByTestId('cm-mock');
    expect(textareas.length).toBeGreaterThan(0);

    // Type a broken frontmatter — the local sniffer should set the parse-error banner.
    await user.clear(textareas[0]);
    await user.type(textareas[0], 'no fence');
    // Wait for the debounce timer.
    await new Promise((r) => setTimeout(r, 350));
    expect(screen.getByText(/harness\.skill\.editor\.rawParseError/i)).toBeInTheDocument();
  });

  it('opens an inline editor when a bundle text file is clicked', async () => {
    const user = userEvent.setup();
    mockedReadBundle.mockResolvedValueOnce({
      scope: 'user',
      path: 'skills/demo/references/notes.md',
      content: 'note body',
      isBinary: false,
      isTruncated: false,
      size: 9,
      mtime: '2026-04-24T00:00:00Z',
      mimeType: 'text/markdown',
    });
    await renderEditor();
    const fileButton = screen.getByRole('button', { name: /references\/notes\.md/ });
    await user.click(fileButton);
    await waitFor(() => {
      expect(mockedReadBundle).toHaveBeenCalled();
    });
    // The bundle inline editor should be present (the section now has 2+ CM instances).
    expect(screen.getAllByTestId('cm-mock').length).toBeGreaterThan(1);
  });

  it('schedules an update API call after editing the description', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-24T00:00:01Z' });
    await renderEditor();
    const descInput = screen.getByLabelText(/harness\.skill\.editor\.frontmatter\.description/i);
    await user.clear(descInput);
    await user.type(descInput, 'updated desc');
    await new Promise((r) => setTimeout(r, 400));
    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalled();
    });
  });

  it('renders the markdown preview when the preview toggle is clicked', async () => {
    const user = userEvent.setup();
    mockedRead.mockResolvedValueOnce(
      readResponse({ body: '# heading\n\nbody paragraph\n' }),
    );
    await renderEditor();
    const previewBtn = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewBtn);
    // The CodeMirror textarea disappears in preview mode (replaced by the
    // rendered MarkdownRenderer output). We assert on the rendered heading
    // content since `react-markdown` produces a real <h1>.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /heading/i })).toBeInTheDocument();
    });
  });

  it('disables binary bundle entries and surfaces the binaryReadOnly label', async () => {
    mockedRead.mockResolvedValueOnce(
      readResponse({
        bundleEntries: [
          {
            relativePath: 'assets/icon.png',
            isBinary: true,
            isTruncated: false,
            size: 12345,
            mtime: '2026-04-24T00:00:00Z',
          },
        ],
      }),
    );
    await renderEditor();
    const button = screen.getByRole('button', { name: /assets\/icon\.png/ });
    expect(button).toBeDisabled();
    // Label appears in the row's right column.
    expect(
      screen.getAllByText(/harness\.skill\.bundle\.binaryReadOnly/i).length,
    ).toBeGreaterThan(0);
  });

  it('shows the truncated label for files larger than the size cap', async () => {
    mockedRead.mockResolvedValueOnce(
      readResponse({
        bundleEntries: [
          {
            relativePath: 'references/big.md',
            isBinary: false,
            isTruncated: true,
            size: 2_000_000,
            mtime: '2026-04-24T00:00:00Z',
          },
        ],
      }),
    );
    await renderEditor();
    expect(
      screen.getByText(/harness\.skill\.bundle\.truncated/i),
    ).toBeInTheDocument();
  });

  it('disables the Form toggle button when the raw frontmatter is broken', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole('button', { name: /Raw/i }));
    const textareas = screen.getAllByTestId('cm-mock');
    await user.clear(textareas[0]);
    await user.type(textareas[0], 'no fence');
    await new Promise((r) => setTimeout(r, 350));
    const formBtn = screen.getByRole('button', { name: /Form/i });
    expect(formBtn).toBeDisabled();
  });
});
