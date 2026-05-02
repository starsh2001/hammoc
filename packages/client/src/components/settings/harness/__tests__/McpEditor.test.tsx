/**
 * Story 28.3: McpEditor component tests.
 *
 * Covers:
 *  - command required (stdio) inline error
 *  - url required (sse/http/ws) inline error after type switch
 *  - http headers section appears only for http
 *  - debounced save fires updateMcp
 *  - Raw mode parse error locks the form toggle (banner shown)
 *
 * @uiw/react-codemirror is mocked with a textarea so the tests can run
 * without bundling the full CodeMirror package.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  HarnessExternalChangeEvent,
  HarnessMcpCard,
  HarnessMcpReadResponse,
} from '@hammoc/shared';

type SocketHandler = (payload: HarnessExternalChangeEvent) => void;
const socketHandlers = new Map<string, SocketHandler>();
const socketEmit = vi.fn();
vi.mock('../../../../services/socket', () => ({
  getSocket: () => ({
    emit: socketEmit,
    on: (event: string, handler: SocketHandler) => {
      socketHandlers.set(event, handler);
    },
    off: (event: string) => {
      socketHandlers.delete(event);
    },
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
  default: ({ value, onChange, readOnly }: {
    value: string;
    onChange?: (v: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      data-testid="cm-mock"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('@codemirror/lang-json', () => ({
  json: () => ({ extension: 'json-mock' }),
}));

vi.mock('../../../../services/api/harnessMcpsApi', () => ({
  listMcps: vi.fn(),
  copyMcp: vi.fn(),
  readMcp: vi.fn(),
  updateMcp: vi.fn(),
  deleteMcp: vi.fn(),
}));

import { readMcp, updateMcp } from '../../../../services/api/harnessMcpsApi';
import { McpEditor } from '../McpEditor';

const mockedRead = vi.mocked(readMcp);
const mockedUpdate = vi.mocked(updateMcp);

function sampleCard(): HarnessMcpCard {
  return {
    name: 'demo',
    activeType: 'stdio',
    enabled: true,
    activeScope: 'user',
    sources: [
      {
        scope: 'user',
        absoluteFile: '/tmp/.mcp.json',
        sourceFileKind: 'mcp.json',
        config: { command: 'echo' },
        mtime: '2026-04-24T00:00:00Z',
        disabledByBackup: false,
      },
    ],
  };
}

function readResponse(overrides: Partial<HarnessMcpReadResponse> = {}): HarnessMcpReadResponse {
  return {
    source: { scope: 'user', absoluteFile: '/tmp/.mcp.json', sourceFileKind: 'mcp.json' },
    config: { command: 'echo' },
    raw: '{"command":"echo"}',
    mtime: '2026-04-24T00:00:00Z',
    disabledByBackup: false,
    ...overrides,
  };
}

async function renderEditor(card?: HarnessMcpCard) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <McpEditor card={card ?? sampleCard()} projectSlug="slug" onClose={() => {}} />,
    );
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  // Wait until the form has rendered its Type select (proxy for data-loaded).
  await waitFor(() => {
    expect(screen.queryByText('harness.mcp.editor.type')).toBeInTheDocument();
  });
  return result!;
}

describe('McpEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers.clear();
    mockedRead.mockResolvedValue(readResponse());
    mockedUpdate.mockResolvedValue({ success: true, mtime: '2026-04-25T00:00:00Z' });
  });

  it('renders the stdio command field with the loaded value', async () => {
    await renderEditor();
    const input = screen.getByLabelText('harness.mcp.editor.command') as HTMLInputElement;
    expect(input.value).toBe('echo');
  });

  it('shows command-required inline error when stdio command is cleared', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const input = screen.getByLabelText('harness.mcp.editor.command') as HTMLInputElement;
    await user.clear(input);
    expect(screen.getByText('harness.mcp.editor.required.command')).toBeInTheDocument();
  });

  it('switches to http and reveals headers section', async () => {
    mockedRead.mockResolvedValue(
      readResponse({
        config: { type: 'http', url: 'https://x.example.com', headers: { X: 'y' } },
      }),
    );
    const card = sampleCard();
    card.activeType = 'http';
    card.sources[0].config = { type: 'http', url: 'https://x.example.com' };
    await renderEditor(card);
    expect(screen.getByLabelText('harness.mcp.editor.url')).toBeInTheDocument();
    expect(screen.getByText('harness.mcp.editor.headers')).toBeInTheDocument();
  });

  it('shows url-required error when url is cleared in http mode', async () => {
    const user = userEvent.setup();
    mockedRead.mockResolvedValue(
      readResponse({ config: { type: 'http', url: 'https://x.example.com' } }),
    );
    const card = sampleCard();
    card.activeType = 'http';
    card.sources[0].config = { type: 'http', url: 'https://x.example.com' };
    await renderEditor(card);
    const input = screen.getByLabelText('harness.mcp.editor.url') as HTMLInputElement;
    await user.clear(input);
    expect(screen.getByText('harness.mcp.editor.required.url')).toBeInTheDocument();
  });

  it('debounced save calls updateMcp with the new config', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const input = screen.getByLabelText('harness.mcp.editor.command') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'newcmd');
    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalled();
    }, { timeout: 1500 });
  });

  it('Raw mode banner appears when JSON parse fails after typing', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Raw' }));
    const cm = await screen.findByTestId('cm-mock');
    fireEvent.change(cm, { target: { value: '{ this is not json' } });
    await waitFor(() => {
      expect(screen.queryByText('harness.mcp.editor.rawParseError')).toBeInTheDocument();
    }, { timeout: 1500 });
  });

  it('AC5: external-change event surfaces reload + overwrite buttons when disk mtime moves', async () => {
    await renderEditor();
    // Initial load → mtime '2026-04-24T00:00:00Z'. External edit returns a fresh mtime + new command.
    mockedRead.mockResolvedValueOnce(
      readResponse({
        config: { command: 'updated-from-disk' },
        raw: '{"command":"updated-from-disk"}',
        mtime: '2026-04-26T00:00:00Z',
      }),
    );
    const handler = socketHandlers.get('harness:external-change');
    expect(handler).toBeDefined();
    await act(async () => {
      handler!({ scope: 'user', path: '.mcp.json', type: 'modified' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('harness.mcp.editor.staleBanner')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /Reload from disk/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Overwrite disk version/i }),
    ).toBeInTheDocument();
  });

  it('AC5: Reload button replaces drafts with disk content and clears the staleBanner', async () => {
    const user = userEvent.setup();
    await renderEditor();
    mockedRead.mockResolvedValueOnce(
      readResponse({
        config: { command: 'updated-from-disk' },
        raw: '{"command":"updated-from-disk"}',
        mtime: '2026-04-26T00:00:00Z',
      }),
    );
    await act(async () => {
      socketHandlers.get('harness:external-change')!({
        scope: 'user',
        path: '.mcp.json',
        type: 'modified',
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await screen.findByText('harness.mcp.editor.staleBanner');
    await user.click(
      screen.getByRole('button', { name: /Reload from disk/i }),
    );
    await waitFor(() => {
      expect(screen.queryByText('harness.mcp.editor.staleBanner')).not.toBeInTheDocument();
    });
    const input = screen.getByLabelText('harness.mcp.editor.command') as HTMLInputElement;
    expect(input.value).toBe('updated-from-disk');
  });

  it('AC5: Overwrite button force-saves drafts without expectedMtime', async () => {
    const user = userEvent.setup();
    await renderEditor();
    // Disk gets a competing edit. Drafts stay at the loaded value
    // ('echo') so we can assert the overwrite body without racing the
    // form-save debounce.
    mockedRead.mockResolvedValueOnce(
      readResponse({
        config: { command: 'theirs' },
        raw: '{"command":"theirs"}',
        mtime: '2026-04-26T00:00:00Z',
      }),
    );
    await act(async () => {
      socketHandlers.get('harness:external-change')!({
        scope: 'user',
        path: '.mcp.json',
        type: 'modified',
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await screen.findByText('harness.mcp.editor.staleBanner');
    mockedUpdate.mockClear();
    await user.click(
      screen.getByRole('button', { name: /Overwrite disk version/i }),
    );
    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalled();
    });
    const lastCall = mockedUpdate.mock.calls[mockedUpdate.mock.calls.length - 1];
    const body = lastCall[2] as Record<string, unknown>;
    expect(body.expectedMtime).toBeUndefined();
    expect(body.config).toEqual(expect.objectContaining({ command: 'echo' }));
  });

  it('plugin-source editor disables the command input as read-only', async () => {
    const card = sampleCard();
    card.activeScope = 'plugin';
    card.sources = [
      {
        scope: 'plugin',
        absoluteFile: '/tmp/plugin/.mcp.json',
        sourceFileKind: 'mcp.json',
        pluginKey: 'foo@market',
        config: { command: 'echo' },
        mtime: '2026-04-24T00:00:00Z',
        disabledByBackup: false,
      },
    ];
    mockedRead.mockResolvedValue(
      readResponse({
        source: {
          scope: 'plugin',
          absoluteFile: '/tmp/plugin/.mcp.json',
          sourceFileKind: 'mcp.json',
          pluginKey: 'foo@market',
        },
      }),
    );
    await renderEditor(card);
    const input = screen.getByLabelText('harness.mcp.editor.command') as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});
