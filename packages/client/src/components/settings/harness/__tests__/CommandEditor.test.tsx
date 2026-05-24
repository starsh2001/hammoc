/**
 * Story 28.5: CommandEditor component tests.
 *
 * Covers:
 *  - frontmatter form renders the four optional keys + 256-char description
 *    overflow warning + argument-hint bracket-balance validation
 *  - Body wrapper exposes the five token-usage data attributes (AC4 visual
 *    contract — the precise color/underline rendering is verified inside the
 *    integration scenario B-10-05 because jsdom does not paint CodeMirror)
 *  - Token guide inline drawer toggle reveals the AC4(b) UI
 *  - AC4(c) friendly consistency warning surfaces when $1 is used without an
 *    argument-hint
 *  - Raw mode toggle swaps the editor surface
 *  - BMad mirror card disables every input and surfaces the read-only banner
 *
 * @uiw/react-codemirror is mocked with a textarea so the lazy import succeeds
 * without paying the CodeMirror runtime cost.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  HarnessCommandCard,
  HarnessCommandReadResponse,
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

vi.mock('../commandTokenHighlight', async () => {
  const actual = await vi.importActual<
    typeof import('../commandTokenHighlight')
  >('../commandTokenHighlight');
  return {
    ...actual,
    commandTokenHighlightExtension: { extension: 'token-highlight-mock' },
  };
});

vi.mock('../../../../services/api/harnessCommandsApi', () => ({
  readCommand: vi.fn(),
  updateCommand: vi.fn(),
  deleteCommand: vi.fn(),
}));

vi.mock('../../../../hooks/useSlashCommands', () => ({
  invalidateSlashCommandsCache: vi.fn(),
  SLASH_COMMANDS_CHANGED_EVENT: 'hammoc:slashCommandsChanged',
}));

// Story 30.7 (Task C.5): mock the router so the secret-shared branch can be
// observed without hitting the network.
vi.mock('../../../../services/secretOnSharedRouter', () => ({
  getActionLabelKey: (domain: string) => `harness.tools.secretOnShared.action.${
    domain === 'mcp' ? 'routeToLocalMcp' :
    domain === 'hook' ? 'routeToLocalHook' :
    domain === 'command' ? 'replaceWithEnvRefCommand' :
    'replaceWithEnvRefAgent'
  }`,
  routeToLocal: vi.fn(),
  appendGitignorePattern: vi.fn(),
  REQUIRED_LOCAL_PATTERN: '**/.claude/**/*.local.*',
}));

import {
  readCommand,
  updateCommand,
} from '../../../../services/api/harnessCommandsApi';
import { routeToLocal as mockedRouteToLocal } from '../../../../services/secretOnSharedRouter';
import { useSecretOnSharedDialogStore } from '../../../../stores/secretOnSharedDialogStore';
import { CommandEditor } from '../CommandEditor';
import { useHarnessCommandStore } from '../../../../stores/harnessCommandStore';

const mockedRead = vi.mocked(readCommand);
const mockedUpdate = vi.mocked(updateCommand);

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

function sampleRead(
  overrides: Partial<HarnessCommandReadResponse> = {},
): HarnessCommandReadResponse {
  return {
    source: {
      scope: 'project',
      absoluteFile: '/tmp/.claude/commands/foo.md',
      projectSlug: 'slug',
      relativePath: 'foo.md',
      slashName: '/foo',
    },
    frontmatter: {},
    body: '',
    raw: '',
    mtime: '2026-04-24T00:00:00Z',
    isBmadMirror: false,
    ...overrides,
  };
}

async function renderEditor(card = sampleCard()) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <CommandEditor card={card} projectSlug="slug" onClose={() => {}} />,
    );
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
  return result!;
}

describe('CommandEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessCommandStore.getState().reset();
  });
  afterEach(() => {
    useHarnessCommandStore.getState().reset();
  });

  it('renders the four frontmatter inputs once readCommand resolves', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId('cmd-frontmatter-description')).toBeTruthy();
    });
    expect(screen.getByTestId('cmd-frontmatter-argument-hint')).toBeTruthy();
    expect(screen.getByTestId('cmd-frontmatter-allowed-tools')).toBeTruthy();
    expect(screen.getByTestId('cmd-frontmatter-model')).toBeTruthy();
  });

  it('shows the description-too-long warning past 256 characters', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    mockedUpdate.mockResolvedValue({
      success: true,
      mtime: '2026-04-25T00:00:00Z',
      slashName: '/foo',
      tokens: {
        usesPositionalArgs: false,
        usesArgumentsAll: false,
        usesFileRefs: false,
        usesBashExec: false,
        usesPluginRoot: false,
      },
    });
    await renderEditor();
    const desc = await screen.findByTestId('cmd-frontmatter-description');
    const long = 'a'.repeat(260);
    await act(async () => {
      (desc as HTMLInputElement).focus();
      // userEvent.type is too slow for 260 chars; use a direct change event.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(desc, long);
      desc.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('cmd-description-too-long')).toBeTruthy();
    });
  });

  it('flags an unbalanced bracket in the argument-hint field', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    const argHint = await screen.findByTestId('cmd-frontmatter-argument-hint');
    // userEvent.type interprets `[` as a key-binding directive, so apply the
    // value via a direct change event instead.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(argHint, '[arg');
      argHint.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('cmd-argument-hint-invalid')).toBeTruthy();
    });
  });

  it('exposes the five data-uses-* token attributes on the body wrapper', async () => {
    mockedRead.mockResolvedValue(
      sampleRead({
        body: 'Use $1 with $ARGUMENTS see @doc.md and !`pwd` plus ${CLAUDE_PLUGIN_ROOT}',
      }),
    );
    await renderEditor();
    const wrapper = await screen.findByTestId('cmd-body-tokens');
    expect(wrapper.getAttribute('data-uses-args')).toBe('true');
    expect(wrapper.getAttribute('data-uses-arguments-all')).toBe('true');
    expect(wrapper.getAttribute('data-uses-file-refs')).toBe('true');
    expect(wrapper.getAttribute('data-uses-bash-exec')).toBe('true');
    expect(wrapper.getAttribute('data-uses-plugin-root')).toBe('true');
  });

  it('reveals the token-guide drawer when the toggle is clicked', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    const toggle = await screen.findByTestId('cmd-token-guide-toggle');
    expect(screen.queryByTestId('cmd-token-guide-drawer')).toBeNull();
    const user = userEvent.setup();
    await user.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId('cmd-token-guide-drawer')).toBeTruthy();
    });
  });

  it('surfaces the AC4(c) friendly warning when $1 is used without an argument-hint', async () => {
    mockedRead.mockResolvedValue(sampleRead({ body: 'Echo $1 back.' }));
    await renderEditor();
    await waitFor(() => {
      const warnings = screen.getByTestId('cmd-consistency-warnings');
      expect(warnings.querySelector('[data-warning="argumentsWithoutHint"]')).toBeTruthy();
    });
  });

  it('Raw mode toggle swaps the editor surface', async () => {
    mockedRead.mockResolvedValue(sampleRead());
    await renderEditor();
    const user = userEvent.setup();
    const rawBtn = await screen.findByTestId('cmd-mode-raw');
    await user.click(rawBtn);
    // The form fieldset disappears once raw mode is active.
    await waitFor(() => {
      expect(screen.queryByTestId('cmd-frontmatter-description')).toBeNull();
    });
  });

  it('disables every input on a BMad-mirror card and shows the read-only banner', async () => {
    mockedRead.mockResolvedValue(sampleRead({ isBmadMirror: true }));
    const card = sampleCard({ isBmadMirror: true });
    await renderEditor(card);
    await waitFor(() => {
      expect(screen.getByText(/\.bmad-core mirror/i)).toBeTruthy();
    });
    const desc = await screen.findByTestId('cmd-frontmatter-description');
    const fieldset = desc.closest('fieldset');
    expect(fieldset?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Story 30.7 (Task C.5): regression guard — the command editor must wire
   * its SecretOnSharedDialog to the command-domain routeToLocal call with
   * the matching actionLabelKey.
   */
  it('opens the SecretOnSharedDialog with the command actionLabelKey + dispatches routeToLocal on click', async () => {
    const { ApiError } = await import('../../../../services/api/client');
    mockedRead.mockResolvedValue(sampleRead());
    mockedUpdate.mockRejectedValueOnce(
      new ApiError(409, 'HARNESS_SECRET_ON_SHARED', 'blocked', {
        relativePath: '.claude/commands/foo.md',
        lines: [2],
      }),
    );
    vi.mocked(mockedRouteToLocal).mockResolvedValue({ ok: true });
    useSecretOnSharedDialogStore.getState().close();

    const user = userEvent.setup();
    await renderEditor();
    const desc = await screen.findByTestId('cmd-frontmatter-description');
    await user.type(desc, 'X');
    await waitFor(() => {
      expect(useSecretOnSharedDialogStore.getState().payload).not.toBeNull();
    }, { timeout: 1500 });
    const payload = useSecretOnSharedDialogStore.getState().payload!;
    expect(payload.origin).toBe('command');
    expect(payload.actionLabelKey).toBe(
      'harness.tools.secretOnShared.action.replaceWithEnvRefCommand',
    );
    payload.onMoveToLocal();
    await waitFor(() => {
      expect(mockedRouteToLocal).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'command', projectSlug: 'slug' }),
      );
    });
  });
});
