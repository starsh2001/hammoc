/**
 * Story 28.6: AgentEditor component tests.
 *
 * Covers:
 *  - 5 frontmatter form fields render once readAgent resolves
 *  - description empty → required marker
 *  - color 6-palette click updates state
 *  - tools 3-state radio toggles + empty warning
 *  - <example> template insertion at cursor + inserted toast
 *  - AC4.c friendly warning when no <example> blocks present
 *  - Raw mode toggle swaps the editor surface
 *  - plugin source disables every input + surfaces the read-only banner
 *
 * @uiw/react-codemirror is mocked with a textarea.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  HarnessAgentCard,
  HarnessAgentReadResponse,
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

vi.mock('../agentExampleHighlight', async () => {
  const actual = await vi.importActual<typeof import('../agentExampleHighlight')>(
    '../agentExampleHighlight',
  );
  return {
    ...actual,
    agentExampleHighlightExtension: { extension: 'example-highlight-mock' },
  };
});

vi.mock('../../../../services/api/harnessAgentsApi', () => ({
  readAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));

import {
  readAgent,
  updateAgent,
} from '../../../../services/api/harnessAgentsApi';
import { AgentEditor } from '../AgentEditor';
import { useHarnessAgentStore } from '../../../../stores/harnessAgentStore';

const mockedRead = vi.mocked(readAgent);
const mockedUpdate = vi.mocked(updateAgent);

function sampleCard(overrides: Partial<HarnessAgentCard> = {}): HarnessAgentCard {
  return {
    scope: 'project',
    absoluteFile: '/tmp/.claude/agents/code-reviewer.md',
    projectSlug: 'slug',
    name: 'code-reviewer',
    description: 'Reviews code.',
    model: 'sonnet',
    color: 'blue',
    toolsState: 'omitted',
    tools: [],
    hasExampleBlock: true,
    mtime: '2026-05-03T00:00:00Z',
    ...overrides,
  };
}

function sampleRead(
  overrides: Partial<HarnessAgentReadResponse> = {},
): HarnessAgentReadResponse {
  return {
    source: {
      scope: 'project',
      absoluteFile: '/tmp/.claude/agents/code-reviewer.md',
      projectSlug: 'slug',
      name: 'code-reviewer',
    },
    frontmatter: {
      name: 'code-reviewer',
      description: 'Reviews code.',
      model: 'sonnet',
      color: 'blue',
    },
    body: 'system prompt body with <example>case</example>.',
    raw: '---\nname: code-reviewer\ndescription: Reviews code.\nmodel: sonnet\ncolor: blue\n---\n\nbody',
    mtime: '2026-05-03T00:00:00Z',
    toolsState: 'omitted',
    hasExampleBlock: true,
    ...overrides,
  };
}

async function renderEditor(card = sampleCard()) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <AgentEditor card={card} projectSlug="slug" onClose={() => {}} />,
    );
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
  return result!;
}

describe('AgentEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessAgentStore.getState().reset();
  });
  afterEach(() => {
    useHarnessAgentStore.getState().reset();
  });

  it('renders 5 frontmatter form fields once readAgent resolves', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId('agent-frontmatter-name')).toBeTruthy();
    });
    expect(screen.getByTestId('agent-frontmatter-description')).toBeTruthy();
    expect(screen.getByTestId('agent-frontmatter-model')).toBeTruthy();
    expect(screen.getByTestId('agent-color-picker')).toBeTruthy();
    expect(screen.getByTestId('agent-tools-radio')).toBeTruthy();
  });

  it('name input is disabled in edit modal (read-only per AC2.a)', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    const nameInput = await screen.findByTestId('agent-frontmatter-name');
    expect((nameInput as HTMLInputElement).disabled).toBe(true);
  });

  it('description empty → required marker visible', async () => {
    mockedRead.mockResolvedValue(sampleRead({ frontmatter: {
      name: 'code-reviewer',
      description: '',
      model: 'sonnet',
      color: 'blue',
    }, body: '' }));
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId('agent-description-required')).toBeTruthy();
    });
  });

  it('color picker click updates the form state', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    mockedUpdate.mockResolvedValue({
      success: true,
      mtime: '2026-05-03T01:00:00Z',
      toolsState: 'omitted',
      hasExampleBlock: true,
    });
    await renderEditor();
    const user = userEvent.setup();
    const greenChip = await screen.findByTestId('agent-color-green');
    await user.click(greenChip);
    expect(greenChip.getAttribute('aria-checked')).toBe('true');
  });

  it('tools 3-state — selecting empty surfaces the warning badge', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    mockedUpdate.mockResolvedValue({
      success: true,
      mtime: '2026-05-03T01:00:00Z',
      toolsState: 'empty',
      hasExampleBlock: true,
    });
    await renderEditor();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByTestId('agent-tools-radio')).toBeTruthy();
    });
    const emptyRadio = screen.getAllByRole('radio').find(
      (r) => r.getAttribute('value') === 'empty',
    )!;
    await user.click(emptyRadio);
    await waitFor(() => {
      expect(screen.getByTestId('agent-tools-empty-warning')).toBeTruthy();
    });
  });

  it('+ Add example button inserts the template at the cursor', async () => {
    mockedRead.mockResolvedValue(sampleRead({
      body: 'plain body',
      hasExampleBlock: false,
    }));
    mockedUpdate.mockResolvedValue({
      success: true,
      mtime: '2026-05-03T01:00:00Z',
      toolsState: 'omitted',
      hasExampleBlock: false,
    });
    await renderEditor();
    const user = userEvent.setup();
    const btn = await screen.findByTestId('agent-insert-example');
    await user.click(btn);
    const desc = screen.getByTestId('agent-frontmatter-description') as HTMLTextAreaElement;
    expect(desc.value).toMatch(/<example>/);
    expect(desc.value).toMatch(/<\/example>/);
    await waitFor(() => {
      expect(screen.getByTestId('agent-example-inserted-toast')).toBeTruthy();
    });
  });

  it('AC4.c — friendly warning when body has no <example> blocks', async () => {
    mockedRead.mockResolvedValue(sampleRead({
      body: 'no example here',
      hasExampleBlock: false,
    }));
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId('agent-no-example-warning')).toBeTruthy();
    });
  });

  it('Raw mode toggle activates the raw button (mode switches)', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByTestId('agent-mode-raw')).toBeTruthy();
    });
    const rawBtn = screen.getByTestId('agent-mode-raw');
    await user.click(rawBtn);
    // The Raw button now carries the active style class.
    expect(rawBtn.className).toMatch(/blue-100/);
  });

  it('plugin source surfaces read-only banner', async () => {
    const card = sampleCard({
      scope: 'plugin',
      pluginKey: 'p@market',
      absoluteFile: '/plugins/p/agents/code-reviewer.md',
      projectSlug: undefined,
    });
    mockedRead.mockResolvedValue(sampleRead({
      source: {
        scope: 'plugin',
        absoluteFile: '/plugins/p/agents/code-reviewer.md',
        pluginKey: 'p@market',
        name: 'code-reviewer',
      },
    }));
    await renderEditor(card);
    await waitFor(() => {
      expect(
        screen.getByText(/plugin-provided agent/i),
      ).toBeTruthy();
    });
    // The fieldset wrapping the form is disabled — verify by querying the
    // fieldset element's `disabled` attribute (which propagates to children
    // via CSS pseudo-class but not through DOM property cascade).
    const fieldset = document.querySelector('fieldset[disabled]');
    expect(fieldset).toBeTruthy();
  });

  it('description input → debounced updateAgent call (real timers)', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    mockedUpdate.mockResolvedValue({
      success: true,
      mtime: '2026-05-03T01:00:00Z',
      toolsState: 'omitted',
      hasExampleBlock: true,
    });
    await renderEditor();
    const user = userEvent.setup();
    const desc = await screen.findByTestId('agent-frontmatter-description');
    await user.type(desc, 'X');
    await waitFor(
      () => {
        expect(mockedUpdate).toHaveBeenCalled();
      },
      { timeout: 1500 },
    );
  });
});
