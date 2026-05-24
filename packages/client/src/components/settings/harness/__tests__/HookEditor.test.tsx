/**
 * Story 28.4: HookEditor component tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HarnessHookCard } from '@hammoc/shared';

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

vi.mock('../../../../services/api/harnessHooksApi', () => ({
  listHooks: vi.fn(),
  copyHook: vi.fn(),
  readHook: vi.fn(),
  createHook: vi.fn(),
  updateHook: vi.fn(),
  deleteHook: vi.fn(),
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
  readHook,
  createHook,
  updateHook,
} from '../../../../services/api/harnessHooksApi';
import { routeToLocal as mockedRouteToLocal } from '../../../../services/secretOnSharedRouter';
import { useSecretOnSharedDialogStore } from '../../../../stores/secretOnSharedDialogStore';
import { HookEditor } from '../HookEditor';
import { useHarnessHookStore } from '../../../../stores/harnessHookStore';

const mockedRead = vi.mocked(readHook);
const mockedCreate = vi.mocked(createHook);
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

describe('HookEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHarnessHookStore.getState().reset();
  });
  afterEach(() => {
    useHarnessHookStore.getState().reset();
  });

  it('shows inline error when command body is empty (existing card)', async () => {
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: '' },
      raw: '{"hooks":[{"type":"command","command":""}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('harness.hook.editor.required.command')).toBeTruthy();
    });
  });

  it('shows matcher invalid-regex error live', async () => {
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: 'echo' },
      raw: '{"hooks":[{"type":"command","command":"echo"}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    const matcherInput = await screen.findByDisplayValue('Write');
    const user = userEvent.setup();
    await user.clear(matcherInput);
    await user.type(matcherInput, '(unclosed');
    await waitFor(() => {
      expect(screen.getByText('harness.hook.editor.matcher.invalidRegex')).toBeTruthy();
    });
  });

  it('disables prompt radio when promptTypeSupport === unsupported', async () => {
    useHarnessHookStore.setState({ promptTypeSupport: 'unsupported' });
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: 'echo' },
      raw: '{"hooks":[{"type":"command","command":"echo"}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    const promptRadio = await screen.findByRole('radio', { name: /prompt/i });
    expect(promptRadio).toBeDisabled();
  });

  it('PreToolUse + command shows the decision builder + quick-template buttons', async () => {
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: 'echo' },
      raw: '{"hooks":[{"type":"command","command":"echo"}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    expect(screen.getByText('PreToolUse decision builder')).toBeTruthy();
    expect(screen.getByText('harness.hook.editor.decisionTemplate.allow')).toBeTruthy();
  });

  it('quick-template "allow" prepends the echo snippet to body', async () => {
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: 'existing' },
      raw: '{"hooks":[{"type":"command","command":"existing"}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-25T00:00:00Z' });
    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    const user = userEvent.setup();
    const allowBtn = await screen.findByRole('button', {
      name: 'harness.hook.editor.decisionTemplate.allow',
    });
    await user.click(allowBtn);
    const textarea = (await screen.findByDisplayValue(
      /permissionDecision/,
    )) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/permissionDecision":"allow"/);
  });

  it('decision-form generate button replaces body with valid JSON snippet', async () => {
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: '' },
      raw: '{"hooks":[{"type":"command","command":""}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-25T00:00:00Z' });
    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    const user = userEvent.setup();
    const panel = await screen.findByRole('button', {
      name: /PreToolUse decision builder/,
    });
    await user.click(panel);
    const generate = await screen.findByRole('button', {
      name: 'Generate shell snippet from form',
    });
    await user.click(generate);
    const textarea = (await screen.findByDisplayValue(
      /permissionDecision/,
    )) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/permissionDecision":"allow"/);
  });

  it('create mode wires up createHook on the Create button', async () => {
    mockedCreate.mockResolvedValue({
      success: true,
      newGroupIndex: 0,
      newHookIndex: 0,
      mtime: '2026-04-25T00:00:00Z',
    });
    await act(async () => {
      render(
        <HookEditor createForEvent="Stop" projectSlug="slug" onClose={() => {}} />,
      );
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    const user = userEvent.setup();
    // The body textarea sits inside the form region. There are several textareas
    // (decision systemMessage, etc.) — pick the largest one (rows={6}).
    const textareas = await screen.findAllByRole('textbox');
    const bodyTextarea = textareas.find(
      (el) => el.tagName === 'TEXTAREA' && (el as HTMLTextAreaElement).rows === 6,
    ) as HTMLTextAreaElement;
    expect(bodyTextarea).toBeTruthy();
    await user.type(bodyTextarea, 'echo hi');
    const createBtn = await screen.findByRole('button', {
      name: 'Create hook',
    });
    await user.click(createBtn);
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(mockedCreate.mock.calls[0][0]).toMatchObject({
      scope: 'project',
      event: 'Stop',
      config: { type: 'command', command: 'echo hi' },
    });
  });

  /**
   * Story 30.7 (Task C.5): regression guard — the hook editor must wire
   * its SecretOnSharedDialog to the hook-domain routeToLocal call with
   * the matching actionLabelKey. The editor here uses `setSaveError` (not
   * `setError`) — the polled grep in Task F.5 must OR-match both.
   */
  it('opens the SecretOnSharedDialog with the hook actionLabelKey + dispatches routeToLocal on click', async () => {
    const { ApiError } = await import('../../../../services/api/client');
    mockedRead.mockResolvedValue({
      source: sampleCard(),
      matcher: 'Write',
      config: { type: 'command', command: 'echo "Bearer aaaaaaaaaaaaaaaaaaaaaaaa"' },
      raw: '{"hooks":[{"type":"command","command":"echo"}]}',
      mtime: '2026-04-24T00:00:00Z',
      disabledByBackup: false,
    });
    mockedUpdate.mockRejectedValueOnce(
      new ApiError(409, 'HARNESS_SECRET_ON_SHARED', 'blocked', {
        relativePath: '.claude/settings.json',
        lines: [3],
      }),
    );
    vi.mocked(mockedRouteToLocal).mockResolvedValue({ ok: true });
    useSecretOnSharedDialogStore.getState().close();

    await act(async () => {
      render(<HookEditor card={sampleCard()} projectSlug="slug" onClose={() => {}} />);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    });
    const user = userEvent.setup();
    const matcherInput = await screen.findByDisplayValue('Write');
    // Trigger any save — a matcher change will do.
    await user.clear(matcherInput);
    await user.type(matcherInput, 'Read');
    await waitFor(() => {
      expect(useSecretOnSharedDialogStore.getState().payload).not.toBeNull();
    }, { timeout: 1500 });
    const payload = useSecretOnSharedDialogStore.getState().payload!;
    expect(payload.origin).toBe('hook');
    expect(payload.actionLabelKey).toBe(
      'harness.tools.secretOnShared.action.routeToLocalHook',
    );
    payload.onMoveToLocal();
    await waitFor(() => {
      expect(mockedRouteToLocal).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'hook', projectSlug: 'slug' }),
      );
    });
  });
});
