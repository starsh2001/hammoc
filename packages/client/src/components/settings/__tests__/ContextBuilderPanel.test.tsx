// @vitest-environment jsdom
/**
 * Story 31.2 (Task D.4): ContextBuilderPanel — enable toggle, AC4.c size
 * threshold warning, AC5.c secret notice, external-change banner, STALE_WRITE
 * modal, and the "managed entry registered" note.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDefaultContextBuilderManifest } from '@hammoc/shared';

const actions = {
  load: vi.fn(),
  setEnabled: vi.fn(),
  toggleVariable: vi.fn(),
  setRecentCommitsCount: vi.fn(),
  addFile: vi.fn(),
  removeFile: vi.fn(),
  addCustomCommand: vi.fn(),
  updateCustomCommand: vi.fn(),
  removeCustomCommand: vi.fn(),
  disable: vi.fn(),
  handleExternalChange: vi.fn(),
  resolveStale: vi.fn(),
  reset: vi.fn(),
};
let storeData: Record<string, unknown> = {};
function fullState() {
  return { ...storeData, ...actions };
}

vi.mock('../../../stores/contextBuilderStore', async (importActual) => {
  const actual = await importActual<typeof import('../../../stores/contextBuilderStore')>();
  const useStore = ((selector: (s: unknown) => unknown) => selector(fullState())) as unknown as {
    (selector: (s: unknown) => unknown): unknown;
    getState: () => unknown;
  };
  useStore.getState = () => fullState();
  return { ...actual, useContextBuilderStore: useStore };
});

let mockSizes = { sizes: new Map<string, number>(), totalBytes: 0, loading: false };
vi.mock('../harness/contextBuilder/useReferenceFileSizes', () => ({
  useReferenceFileSizes: () => mockSizes,
  formatBytes: (b: number) => `${b} B`,
}));
vi.mock('../harness/contextBuilder/FileListEditor', () => ({ FileListEditor: () => <div data-testid="w-files" /> }));
vi.mock('../harness/contextBuilder/VariableToggleList', () => ({ VariableToggleList: () => <div data-testid="w-vars" /> }));
vi.mock('../harness/contextBuilder/CustomCommandBlock', () => ({ CustomCommandBlock: () => <div data-testid="w-cmds" /> }));
vi.mock('../../../services/socket', () => ({ getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));

import { ContextBuilderPanel } from '../ContextBuilderPanel';

function baseState(over: Record<string, unknown> = {}) {
  storeData = {
    projectSlug: 'slug',
    manifest: createDefaultContextBuilderManifest(),
    mtime: 'M1',
    scriptExists: false,
    entryRegistered: false,
    isLoading: false,
    isSaving: false,
    error: undefined,
    staleConflict: undefined,
    externalChangePending: false,
    secretWarningCommandIndices: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSizes = { sizes: new Map(), totalBytes: 0, loading: false };
  baseState();
});

describe('ContextBuilderPanel', () => {
  it('renders the 3 widgets and toggles enable', () => {
    render(<ContextBuilderPanel projectSlug="slug" />);
    expect(screen.getByTestId('w-files')).toBeTruthy();
    expect(screen.getByTestId('w-vars')).toBeTruthy();
    expect(screen.getByTestId('w-cmds')).toBeTruthy();
    fireEvent.click(screen.getByTestId('context-builder-enable-toggle'));
    expect(actions.setEnabled).toHaveBeenCalledWith(true);
  });

  it('shows the size threshold warning when the assembled estimate exceeds the soft limit (AC4.c)', () => {
    mockSizes = { sizes: new Map(), totalBytes: 9000, loading: false };
    render(<ContextBuilderPanel projectSlug="slug" />);
    expect(screen.getByTestId('context-builder-size-warning')).toBeTruthy();
  });

  it('shows the non-blocking secret notice (AC5.c)', () => {
    baseState({ secretWarningCommandIndices: [0, 1] });
    render(<ContextBuilderPanel projectSlug="slug" />);
    expect(screen.getByTestId('context-builder-secret-notice')).toBeTruthy();
  });

  it('shows the external-change banner and reloads on click', () => {
    baseState({ externalChangePending: true });
    render(<ContextBuilderPanel projectSlug="slug" />);
    fireEvent.click(screen.getByText('harness.contextBuilder.externalChange.reload'));
    expect(actions.load).toHaveBeenCalled();
  });

  it('shows the STALE_WRITE modal and resolves it', () => {
    baseState({ staleConflict: { currentMtime: 'M9', pendingManifest: createDefaultContextBuilderManifest() } });
    render(<ContextBuilderPanel projectSlug="slug" />);
    fireEvent.click(screen.getByTestId('context-builder-stale-overwrite'));
    expect(actions.resolveStale).toHaveBeenCalledWith('overwrite');
  });

  it('shows the registered note when enabled + entry registered', () => {
    baseState({ manifest: { ...createDefaultContextBuilderManifest(), enabled: true }, entryRegistered: true });
    render(<ContextBuilderPanel projectSlug="slug" />);
    expect(screen.getByTestId('context-builder-registered-note')).toBeTruthy();
  });
});
