/**
 * Story 28.2: SkillPanel component tests.
 *
 * Covers empty state, card rendering with bundle badges, copy menu reveal,
 * and conflict modal opening on a copy action.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HarnessSkillCard } from '@hammoc/shared';

vi.mock('../../../../services/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

// Force the i18n `t()` helper to echo the key back so assertions can match
// translation keys regardless of which locale i18next has bundled at import
// time. The component still renders the same DOM tree; we only swap label
// text for stable string identifiers.
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

vi.mock('../../../../services/api/harnessSkillsApi', () => ({
  listSkills: vi.fn(),
  copySkill: vi.fn(),
  readSkill: vi.fn(),
  updateSkill: vi.fn(),
  readBundleFile: vi.fn(),
  writeBundleFile: vi.fn(),
}));

import { listSkills, copySkill, readSkill } from '../../../../services/api/harnessSkillsApi';
import { SkillPanel } from '../SkillPanel';
import { useHarnessSkillStore } from '../../../../stores/harnessSkillStore';

const mockedList = vi.mocked(listSkills);
const mockedCopy = vi.mocked(copySkill);
const mockedRead = vi.mocked(readSkill);

function sampleCard(overrides: Partial<HarnessSkillCard> = {}): HarnessSkillCard {
  return {
    name: 'foo',
    description: 'a foo skill',
    sources: [
      {
        scope: 'user',
        absoluteRoot: '/tmp/foo',
        frontmatter: { name: 'foo', description: 'a foo skill' },
        bundleCounts: { references: 2, examples: 0, scripts: 0, assets: 0 },
        skillMdMtime: '2026-04-24T00:00:00Z',
      },
    ],
    activeScope: 'user',
    ...overrides,
  };
}

async function renderPanel() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<SkillPanel projectSlug="slug" />);
    for (let i = 0; i < 3; i++) await Promise.resolve();
  });
  await waitFor(() => {
    expect(useHarnessSkillStore.getState().isLoading).toBe(false);
  });
  return result!;
}

describe('SkillPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessSkillStore.getState().reset();
  });

  afterEach(() => {
    useHarnessSkillStore.getState().reset();
  });

  it('renders the empty-state message when there are no cards', async () => {
    mockedList.mockResolvedValueOnce({ cards: [], malformed: [] });
    await renderPanel();
    expect(screen.getByText('harness.skill.empty.title')).toBeInTheDocument();
    expect(screen.getByText('harness.skill.empty.description')).toBeInTheDocument();
  });

  it('renders a card with bundle count badge', async () => {
    mockedList.mockResolvedValueOnce({ cards: [sampleCard()], malformed: [] });
    await renderPanel();
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText(/harness\.skill\.bundle\.references\.count/)).toBeInTheDocument();
  });

  it('opens the copy menu and triggers the conflict dialog', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce({ cards: [sampleCard()], malformed: [] });
    await renderPanel();

    const menuButton = screen.getByLabelText(/copy actions/i);
    await user.click(menuButton);
    const menuItem = await screen.findByText(/harness\.skill\.copy\.toProject\.label/i);
    await user.click(menuItem);

    // Conflict dialog should now be on screen.
    expect(screen.getByRole('dialog', { name: /harness\.skill\.copy\.conflict\.title/i })).toBeInTheDocument();
  });

  it('does not call copySkill until the conflict dialog is submitted', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce({ cards: [sampleCard()], malformed: [] });
    await renderPanel();

    await user.click(screen.getByLabelText(/copy actions/i));
    await user.click(await screen.findByText(/harness\.skill\.copy\.toProject\.label/i));
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  it('opens the SkillEditor when a card is clicked', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce({ cards: [sampleCard()], malformed: [] });
    mockedRead.mockResolvedValueOnce({
      source: {
        scope: 'user',
        absoluteRoot: '/tmp/foo',
      },
      frontmatter: { name: 'foo', description: 'a foo skill' },
      body: '# body',
      raw: '---\nname: foo\ndescription: a foo skill\n---\n# body',
      bundleCounts: { references: 0, examples: 0, scripts: 0, assets: 0 },
      skillMdMtime: '2026-04-24T00:00:00Z',
      bundleEntries: [],
      truncatedAtDepth: false,
    });

    await renderPanel();
    const card = screen.getByRole('button', { name: /open foo/i });
    await user.click(card);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
