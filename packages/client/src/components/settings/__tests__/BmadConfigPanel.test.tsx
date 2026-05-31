// @vitest-environment jsdom
/**
 * Story 31.1 (Task D.6): BmadConfigPanel — Raw/Form toggle, unsaved-changes
 * confirm modal, raw parse-error inline warning, read-only unknown-keys
 * section, and the STALE_WRITE reload/overwrite modal.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the store (selector reads + getState() actions) -------------------
const actions = {
  load: vi.fn(),
  setMode: vi.fn(),
  patchKey: vi.fn(),
  writeRaw: vi.fn(),
  setDirtyRawDraft: vi.fn(),
  handleExternalChange: vi.fn(),
  resolveStale: vi.fn(),
  reset: vi.fn(),
};
let storeData: Record<string, unknown> = {};
function fullState() {
  return { ...storeData, ...actions };
}

vi.mock('../../../stores/bmadCoreConfigStore', async (importActual) => {
  const actual = await importActual<typeof import('../../../stores/bmadCoreConfigStore')>();
  const useStore = ((selector: (s: unknown) => unknown) => selector(fullState())) as unknown as {
    (selector: (s: unknown) => unknown): unknown;
    getState: () => unknown;
  };
  useStore.getState = () => fullState();
  return { ...actual, useBmadCoreConfigStore: useStore };
});

// --- Mock heavy children so the panel test stays focused --------------------
vi.mock('../../../services/socket', () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
}));
vi.mock('../harness/bmad/BmadToggleWidget', () => ({ BmadToggleWidget: ({ keyDef }: any) => <div data-testid={`w-${keyDef.id}`} /> }));
vi.mock('../harness/bmad/BmadStringWidget', () => ({ BmadStringWidget: ({ keyDef }: any) => <div data-testid={`w-${keyDef.id}`} /> }));
vi.mock('../harness/bmad/BmadPathWidget', () => ({ BmadPathWidget: ({ keyDef }: any) => <div data-testid={`w-${keyDef.id}`} /> }));
vi.mock('../harness/bmad/BmadGlobWidget', () => ({ BmadGlobWidget: ({ keyDef }: any) => <div data-testid={`w-${keyDef.id}`} /> }));
vi.mock('../harness/bmad/BmadArrayWidget', () => ({ BmadArrayWidget: ({ keyDef }: any) => <div data-testid={`w-${keyDef.id}`} /> }));
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-testid="cm" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));
vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => [] }));
vi.mock('yaml', () => ({
  parse: (s: string) => {
    if (s.includes('BAD')) throw new Error('bad yaml');
    return {};
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));

import { BmadConfigPanel } from '../BmadConfigPanel';

function baseState(over: Record<string, unknown> = {}) {
  storeData = {
    projectSlug: 'slug',
    isLoading: false,
    error: undefined,
    mode: 'form',
    rawContent: 'devStoryLocation: docs/stories\n',
    unknownKeys: {},
    isSaving: false,
    dirtyRawDraft: undefined,
    staleConflict: undefined,
    externalChangePending: false,
    knownKeys: {},
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  baseState();
});

describe('BmadConfigPanel', () => {
  it('renders the 5 collapsible groups with their widgets', () => {
    render(<BmadConfigPanel projectSlug="slug" />);
    for (const group of ['general', 'qa', 'prd', 'architecture', 'brownfieldEpic']) {
      expect(screen.getByTestId(`bmad-group-${group}`)).toBeInTheDocument();
    }
    // A representative widget from each widget family renders.
    expect(screen.getByTestId('w-markdownExploder')).toBeInTheDocument();
    expect(screen.getByTestId('w-prd.epicFilePattern')).toBeInTheDocument();
    expect(screen.getByTestId('w-devLoadAlwaysFiles')).toBeInTheDocument();
  });

  it('renders unknown keys read-only with a JS-type hint', () => {
    baseState({ unknownKeys: { customFooBar: 'hello', experimentalFlag: true } });
    render(<BmadConfigPanel projectSlug="slug" />);
    fireEvent.click(screen.getByTestId('bmad-unknown-keys-header'));
    expect(screen.getByTestId('bmad-unknown-key-customFooBar')).toHaveTextContent('string');
    expect(screen.getByTestId('bmad-unknown-key-experimentalFlag')).toHaveTextContent('boolean');
  });

  it('switches to Raw mode when not saving', () => {
    render(<BmadConfigPanel projectSlug="slug" />);
    fireEvent.click(screen.getByTestId('bmad-mode-raw'));
    expect(actions.setMode).toHaveBeenCalledWith('raw');
  });

  it('shows the unsaved-changes confirm modal when toggling to Raw mid-save', () => {
    baseState({ isSaving: true });
    render(<BmadConfigPanel projectSlug="slug" />);
    fireEvent.click(screen.getByTestId('bmad-mode-raw'));
    expect(screen.getByTestId('bmad-unsaved-confirm')).toBeInTheDocument();
    // Did NOT switch yet — waits for confirmation.
    expect(actions.setMode).not.toHaveBeenCalledWith('raw');
  });

  it('shows an inline parse-error and keeps Raw mode on invalid YAML', async () => {
    baseState({ mode: 'raw' });
    render(<BmadConfigPanel projectSlug="slug" />);
    const cm = await screen.findByTestId('cm');
    fireEvent.change(cm, { target: { value: 'BAD: : :' } });
    await waitFor(() => expect(screen.getByTestId('bmad-raw-parse-error')).toBeInTheDocument());
    // Save is disabled while the parse is broken.
    expect(screen.getByTestId('bmad-raw-save')).toBeDisabled();
  });

  it('resolves a STALE_WRITE conflict via reload or overwrite', () => {
    baseState({ staleConflict: { currentMtime: 'M9', pendingOps: [] } });
    render(<BmadConfigPanel projectSlug="slug" />);
    fireEvent.click(screen.getByTestId('bmad-stale-reload'));
    expect(actions.resolveStale).toHaveBeenCalledWith('reload');
    fireEvent.click(screen.getByTestId('bmad-stale-overwrite'));
    expect(actions.resolveStale).toHaveBeenCalledWith('overwrite');
  });
});
