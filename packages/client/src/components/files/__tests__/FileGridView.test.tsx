/**
 * FileGridView Tests
 * Grid view for file explorer — Finder-style directory navigation.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileGridView } from '../FileGridView.js';
import type { DirectoryEntry } from '@bmad-studio/shared';

// Mock fileSystemApi
vi.mock('../../../services/api/fileSystem.js', () => ({
  fileSystemApi: {
    listDirectory: vi.fn(),
    createEntry: vi.fn(),
    deleteEntry: vi.fn(),
    renameEntry: vi.fn(),
  },
}));

// Mock fileStore
let mockOpenFile: { path: string } | null = null;
vi.mock('../../../stores/fileStore.js', () => ({
  useFileStore: Object.assign(
    (selector: (state: { openFile: { path: string } | null }) => unknown) =>
      selector({ openFile: mockOpenFile }),
    {
      getState: () => ({
        requestFileNavigation: vi.fn(),
      }),
    },
  ),
}));

import { fileSystemApi } from '../../../services/api/fileSystem.js';

const mockEntries: DirectoryEntry[] = [
  { name: 'src', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'node_modules', type: 'directory', size: 0, modifiedAt: '2026-02-20T09:00:00Z' },
  { name: '.git', type: 'directory', size: 0, modifiedAt: '2026-02-20T08:00:00Z' },
  { name: 'package.json', type: 'file', size: 1024, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'README.md', type: 'file', size: 512, modifiedAt: '2026-02-19T15:00:00Z' },
  { name: '.env', type: 'file', size: 128, modifiedAt: '2026-02-18T12:00:00Z' },
];

const defaultProps = {
  projectSlug: 'test-project',
  currentPath: '.',
  showHidden: false,
  onFileSelect: vi.fn(),
  onNavigate: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenFile = null;
  vi.mocked(fileSystemApi.listDirectory).mockResolvedValue({ path: '.', entries: mockEntries });
});

describe('FileGridView', () => {
  // TC-FGV-1: Directory loads and items are displayed as grid
  it('displays entries in a grid after loading', async () => {
    render(<FileGridView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(fileSystemApi.listDirectory).toHaveBeenCalledWith('test-project', '.');
  });

  // TC-FGV-2: Folder click calls onNavigate
  it('calls onNavigate when folder is clicked', async () => {
    const onNavigate = vi.fn();
    render(<FileGridView {...defaultProps} onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('src'));
    expect(onNavigate).toHaveBeenCalledWith('src');
  });

  // TC-FGV-3: File click calls onFileSelect
  it('calls onFileSelect when file is clicked', async () => {
    const onFileSelect = vi.fn();
    render(<FileGridView {...defaultProps} onFileSelect={onFileSelect} />);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));
    expect(onFileSelect).toHaveBeenCalledWith('package.json');
  });

  // TC-FGV-4: Hidden files are filtered when showHidden=false
  it('filters hidden files when showHidden is false', async () => {
    render(<FileGridView {...defaultProps} showHidden={false} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.queryByText('.git')).not.toBeInTheDocument();
    expect(screen.queryByText('node_modules')).not.toBeInTheDocument();
    expect(screen.queryByText('.env')).not.toBeInTheDocument();
  });

  // TC-FGV-4b: Hidden files shown when showHidden=true
  it('shows hidden files when showHidden is true', async () => {
    render(<FileGridView {...defaultProps} showHidden={true} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.getByText('.git')).toBeInTheDocument();
    expect(screen.getByText('node_modules')).toBeInTheDocument();
  });

  // TC-FGV-5: Loading spinner is displayed after delay
  it('shows loading spinner after 300ms delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fileSystemApi.listDirectory).mockReturnValue(new Promise(() => {}));
    render(<FileGridView {...defaultProps} />);

    // Spinner should NOT be visible immediately
    expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();

    // After 300ms, spinner should appear
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    vi.useRealTimers();
  });

  // TC-FGV-6: Context menu on right-click
  it('shows context menu on right-click when enableContextMenu is true', async () => {
    render(<FileGridView {...defaultProps} enableContextMenu={true} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText('src'));

    await waitFor(() => {
      expect(screen.getByText('새 파일')).toBeInTheDocument();
    });
  });

  // TC-FGV-7: Reloads when currentPath changes
  it('reloads directory when currentPath changes', async () => {
    const { rerender } = render(<FileGridView {...defaultProps} currentPath="." />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue({
      path: 'src',
      entries: [
        { name: 'App.tsx', type: 'file', size: 2048, modifiedAt: '2026-02-20T10:00:00Z' },
      ],
    });

    rerender(<FileGridView {...defaultProps} currentPath="src" />);

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    expect(fileSystemApi.listDirectory).toHaveBeenCalledWith('test-project', 'src');
  });

  // TC-FGV-8: Error state with retry
  it('shows error message and retry button on load failure', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockRejectedValue(new Error('Network error'));

    render(<FileGridView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  // TC-FGV-9: Empty folder message
  it('shows empty folder message when directory is empty', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue({ path: '.', entries: [] });

    render(<FileGridView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('빈 폴더')).toBeInTheDocument();
    });
  });

  // TC-FGV-10: Full path for nested directories
  it('builds correct full path for nested currentPath', async () => {
    const onNavigate = vi.fn();
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue({
      path: 'src',
      entries: [
        { name: 'components', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
      ],
    });

    render(<FileGridView {...defaultProps} currentPath="src" onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('components'));
    expect(onNavigate).toHaveBeenCalledWith('src/components');
  });
});
