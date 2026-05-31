// @vitest-environment jsdom
/**
 * Story 31.1 (Task F.2): 18-key widget matrix — each key renders the right
 * widget and a value change flows to the store's optimistic update; plus the
 * glob preview debounce + searchFiles reuse.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));
vi.mock('../../../../../services/api/bmadCoreConfigApi', () => ({
  readBmadConfig: vi.fn().mockResolvedValue({ content: '', mtime: 'M', knownKeys: {}, unknownKeys: {} }),
  patchBmadConfig: vi.fn().mockResolvedValue({ mtime: 'M2' }),
  writeRawBmadConfig: vi.fn().mockResolvedValue({ mtime: 'M2' }),
}));
const searchFiles = vi.fn().mockResolvedValue({ query: '', results: [] });
vi.mock('../../../../../services/api/fileSystem', () => ({
  fileSystemApi: { searchFiles: (...a: unknown[]) => searchFiles(...a), listDirectory: vi.fn().mockResolvedValue({ path: '.', entries: [] }) },
}));

import {
  useBmadCoreConfigStore,
  BMAD_KNOWN_KEYS_MATRIX,
  getAtPath,
  type BmadKeyDef,
} from '../../../../../stores/bmadCoreConfigStore';
import { BmadToggleWidget } from '../BmadToggleWidget';
import { BmadStringWidget } from '../BmadStringWidget';
import { BmadPathWidget } from '../BmadPathWidget';
import { BmadGlobWidget } from '../BmadGlobWidget';
import { BmadArrayWidget } from '../BmadArrayWidget';

function renderWidget(keyDef: BmadKeyDef) {
  switch (keyDef.widget) {
    case 'boolean': return render(<BmadToggleWidget keyDef={keyDef} />);
    case 'string': return render(<BmadStringWidget keyDef={keyDef} />);
    case 'path': return render(<BmadPathWidget keyDef={keyDef} projectSlug="slug" />);
    case 'glob': return render(<BmadGlobWidget keyDef={keyDef} projectSlug="slug" />);
    case 'array': return render(<BmadArrayWidget keyDef={keyDef} />);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  useBmadCoreConfigStore.getState().reset();
  useBmadCoreConfigStore.setState({ projectSlug: 'slug', mtime: 'M', knownKeys: {} });
});

afterEach(() => {
  cleanup();
  useBmadCoreConfigStore.getState().reset();
});

describe('18-key widget matrix renders', () => {
  it.each(BMAD_KNOWN_KEYS_MATRIX.map((k) => [k.id, k] as const))('renders widget for %s', (_id, keyDef) => {
    renderWidget(keyDef);
    expect(screen.getByTestId(`bmad-key-${keyDef.id}`)).toBeInTheDocument();
  });
});

describe('value change → optimistic store update', () => {
  it('toggle widget writes a boolean', () => {
    const keyDef = BMAD_KNOWN_KEYS_MATRIX.find((k) => k.id === 'markdownExploder')!;
    renderWidget(keyDef);
    fireEvent.click(screen.getByTestId('bmad-toggle-markdownExploder'));
    expect(getAtPath(useBmadCoreConfigStore.getState().knownKeys, keyDef.path)).toBe(true);
  });

  it('string widget writes text', () => {
    const keyDef = BMAD_KNOWN_KEYS_MATRIX.find((k) => k.id === 'slashPrefix')!;
    renderWidget(keyDef);
    fireEvent.change(screen.getByTestId('bmad-input-slashPrefix'), { target: { value: 'XCmd' } });
    expect(getAtPath(useBmadCoreConfigStore.getState().knownKeys, keyDef.path)).toBe('XCmd');
  });

  it('path widget writes a path', () => {
    const keyDef = BMAD_KNOWN_KEYS_MATRIX.find((k) => k.id === 'devStoryLocation')!;
    renderWidget(keyDef);
    fireEvent.change(screen.getByTestId('bmad-input-devStoryLocation'), { target: { value: 'docs/v2-stories' } });
    expect(getAtPath(useBmadCoreConfigStore.getState().knownKeys, keyDef.path)).toBe('docs/v2-stories');
  });

  it('array widget add appends an item', () => {
    const keyDef = BMAD_KNOWN_KEYS_MATRIX.find((k) => k.id === 'devLoadAlwaysFiles')!;
    renderWidget(keyDef);
    fireEvent.click(screen.getByTestId('bmad-array-add-devLoadAlwaysFiles'));
    const val = getAtPath(useBmadCoreConfigStore.getState().knownKeys, keyDef.path);
    expect(Array.isArray(val)).toBe(true);
    expect((val as string[]).length).toBe(1);
  });
});

describe('glob widget preview', () => {
  it('debounces and reuses searchFiles after 500ms', async () => {
    vi.useFakeTimers();
    const keyDef = BMAD_KNOWN_KEYS_MATRIX.find((k) => k.id === 'prd.epicFilePattern')!;
    renderWidget(keyDef);
    fireEvent.change(screen.getByTestId('bmad-input-prd.epicFilePattern'), { target: { value: 'epic-{n}*.md' } });
    expect(searchFiles).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(searchFiles).toHaveBeenCalledWith('slug', 'epic-');
    vi.useRealTimers();
  });
});
