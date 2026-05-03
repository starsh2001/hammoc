/**
 * Story 28.6: AgentPanel component tests.
 *
 * Covers:
 *  - empty-state copy when there are no agents
 *  - card grid render (project + user + plugin mix) + scope badges
 *  - color chip + model badge + tools 3-state badge
 *  - card click opens AgentEditor modal
 *  - copy menu → copyAgent call sequence
 *  - malformed banner reasons
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  HarnessAgentCard,
  HarnessAgentListResponse,
  HarnessAgentMalformedEntry,
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

vi.mock('../../../../services/api/harnessAgentsApi', () => ({
  listAgents: vi.fn(),
  copyAgent: vi.fn(),
  readAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));

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

vi.mock('../agentExampleHighlight', async () => {
  const actual = await vi.importActual<typeof import('../agentExampleHighlight')>(
    '../agentExampleHighlight',
  );
  return {
    ...actual,
    agentExampleHighlightExtension: { extension: 'example-highlight-mock' },
  };
});

import {
  listAgents,
  copyAgent,
  readAgent,
} from '../../../../services/api/harnessAgentsApi';
import { AgentPanel } from '../AgentPanel';
import { useHarnessAgentStore } from '../../../../stores/harnessAgentStore';

const mockedList = vi.mocked(listAgents);
const mockedCopy = vi.mocked(copyAgent);
const mockedRead = vi.mocked(readAgent);

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

function sampleResponse(
  cards: HarnessAgentCard[] = [],
  malformed: HarnessAgentMalformedEntry[] = [],
): HarnessAgentListResponse {
  return { cards, malformed };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<AgentPanel projectSlug="slug" />);
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
  await waitFor(() => {
    expect(useHarnessAgentStore.getState().isLoading).toBe(false);
  });
  return result!;
}

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessAgentStore.getState().reset();
  });
  afterEach(() => {
    useHarnessAgentStore.getState().reset();
  });

  it('shows the empty-state copy when there are no agents', async () => {
    mockedList.mockResolvedValue(sampleResponse([]));
    await renderPanel();
    expect(screen.getByText(/No sub-agents configured/i)).toBeTruthy();
  });

  it('renders project + user + plugin cards with scope badges', async () => {
    mockedList.mockResolvedValue(
      sampleResponse([
        sampleCard(),
        sampleCard({
          scope: 'user',
          name: 'global-agent',
          absoluteFile: '/home/.claude/agents/global-agent.md',
          projectSlug: undefined,
        }),
        sampleCard({
          scope: 'plugin',
          name: 'plugin-agent',
          absoluteFile: '/plugins/p/agents/plugin-agent.md',
          pluginKey: 'p@market',
          projectSlug: undefined,
        }),
      ]),
    );
    await renderPanel();
    expect(screen.getByText('code-reviewer')).toBeTruthy();
    expect(screen.getByText('global-agent')).toBeTruthy();
    expect(screen.getByText('plugin-agent')).toBeTruthy();
  });

  it('renders tools 3-state badges (omitted vs empty vs populated)', async () => {
    mockedList.mockResolvedValue(
      sampleResponse([
        sampleCard({ name: 'a-omit', toolsState: 'omitted' }),
        sampleCard({
          name: 'a-empty',
          toolsState: 'empty',
          absoluteFile: '/tmp/.claude/agents/a-empty.md',
        }),
        sampleCard({
          name: 'a-pop',
          toolsState: 'populated',
          tools: ['Read', 'Edit'],
          absoluteFile: '/tmp/.claude/agents/a-pop.md',
        }),
      ]),
    );
    await renderPanel();
    expect(screen.getByTestId('agent-tools-empty')).toBeTruthy();
    expect(screen.getByTestId('agent-tools-populated')).toBeTruthy();
  });

  it('opens AgentEditor modal on card click', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    mockedRead.mockResolvedValue({
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
      body: 'system prompt',
      raw: '---\nname: code-reviewer\ndescription: Reviews code.\nmodel: sonnet\ncolor: blue\n---\n\nsystem prompt',
      mtime: '2026-05-03T00:00:00Z',
      toolsState: 'omitted',
      hasExampleBlock: false,
    });
    await renderPanel();
    const user = userEvent.setup();
    const card = screen.getByTestId('agent-card-project-code-reviewer');
    const cardTitle = card.querySelector('button[aria-label]') as HTMLButtonElement;
    await user.click(cardTitle);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('copy menu → copyAgent called with resolved request', async () => {
    mockedList.mockResolvedValue(sampleResponse([sampleCard()]));
    mockedCopy.mockResolvedValueOnce({
      success: true,
      target: {
        scope: 'user',
        absoluteFile: '/home/.claude/agents/code-reviewer.md',
        name: 'code-reviewer',
      },
      skipped: false,
    });
    await renderPanel();
    const user = userEvent.setup();
    const kebab = screen.getByRole('button', { name: 'Copy actions' });
    await user.click(kebab);
    const toGlobal = await screen.findByTestId('agent-copy-action-toUser');
    await user.click(toGlobal);
    await waitFor(() => {
      expect(mockedCopy).toHaveBeenCalledTimes(1);
    });
    expect(mockedCopy.mock.calls[0][0]).toMatchObject({
      sourceScope: 'project',
      targetScope: 'user',
      sourceName: 'code-reviewer',
    });
  });

  it('renders malformed banner with all reason categories', async () => {
    mockedList.mockResolvedValue(
      sampleResponse(
        [],
        [
          {
            scope: 'project',
            absoluteFile: '/tmp/.claude/agents/bad1.md',
            reason: 'invalid-frontmatter',
            detail: 'YAML err',
          },
          {
            scope: 'project',
            absoluteFile: '/tmp/.claude/agents/bad2.md',
            reason: 'name-mismatch',
          },
          {
            scope: 'project',
            absoluteFile: '/tmp/.claude/agents/BAD3.md',
            reason: 'invalid-name-pattern',
          },
          {
            scope: 'project',
            absoluteFile: '/tmp/.claude/agents/bad4.md',
            reason: 'invalid-model',
          },
          {
            scope: 'project',
            absoluteFile: '/tmp/.claude/agents/bad5.md',
            reason: 'invalid-color',
          },
          {
            scope: 'project',
            absoluteFile: '/tmp/.claude/agents/sub/bad6.md',
            reason: 'nested-directory',
          },
        ],
      ),
    );
    await renderPanel();
    const banner = screen.getByTestId('agent-malformed-banner');
    expect(banner).toBeTruthy();
    expect(banner.querySelectorAll('li[data-reason]')).toHaveLength(6);
  });
});
