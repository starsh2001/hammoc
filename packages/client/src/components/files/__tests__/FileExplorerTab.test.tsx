/**
 * FileExplorerTab Tests
 * [Source: Story 13.2 - Task 4.1]
 * [Extended: Story 13.3 - Task 6.3 — CRUD integration tests]
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FileExplorerTab } from '../FileExplorerTab.js';
import type { DirectoryEntry } from '@bmad-studio/shared';

// Mock fileSystemApi
vi.mock('../../../services/api/fileSystem.js', () => ({
  fileSystemApi: {
    listDirectory: vi.fn(),
    searchFiles: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createEntry: vi.fn(),
    deleteEntry: vi.fn(),
    renameEntry: vi.fn(),
  },
}));

// Mock fileStore
const mockRequestFileNavigation = vi.fn();
let mockOpenFile: { path: string } | null = null;
vi.mock('../../../stores/fileStore.js', () => ({
  useFileStore: Object.assign(
    (selector: (state: { openFile: { path: string } | null }) => unknown) =>
      selector({ openFile: mockOpenFile }),
    {
      getState: () => ({
        requestFileNavigation: mockRequestFileNavigation,
      }),
    },
  ),
}));

// Mock preferencesStore
vi.mock('../../../stores/preferencesStore.js', () => ({
  usePreferencesStore: (selector: (state: { preferences: { fileExplorerViewMode?: string } }) => unknown) =>
    selector({ preferences: { fileExplorerViewMode: 'list' } }),
}));

import { fileSystemApi } from '../../../services/api/fileSystem.js';

const mockRootEntries: DirectoryEntry[] = [
  { name: 'src', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'node_modules', type: 'directory', size: 0, modifiedAt: '2026-02-20T09:00:00Z' },
  { name: '.git', type: 'directory', size: 0, modifiedAt: '2026-02-20T08:00:00Z' },
  { name: 'package.json', type: 'file', size: 1024, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'README.md', type: 'file', size: 512, modifiedAt: '2026-02-19T15:00:00Z' },
  { name: '.env', type: 'file', size: 128, modifiedAt: '2026-02-18T12:00:00Z' },
];

function renderWithRouter(initialPath = '/project/test-project/files') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/project/:projectSlug/files" element={<FileExplorerTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenFile = null;
  vi.mocked(fileSystemApi.listDirectory).mockResolvedValue({ path: '.', entries: mockRootEntries });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FileExplorerTab', () => {
  // TC-FET-1: FileExplorerTab renders and FileTree is displayed (AC2)
  it('renders and displays FileTree', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  // TC-FET-2: Breadcrumb shows initial "Root" (AC3)
  it('displays breadcrumb with Root initially', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('루트')).toBeInTheDocument();
    });

    const breadcrumbNav = screen.getByRole('navigation', { name: '경로' });
    expect(breadcrumbNav).toBeInTheDocument();

    const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(currentPage?.textContent).toBe('루트');
  });

  // TC-FET-3: Search input exists with placeholder (AC4)
  it('has search input with placeholder', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('검색...');
    expect(searchInput).toBeInTheDocument();
  });

  // TC-FET-4: Search input shows search results from server API (AC4)
  it('shows search results from server API when typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.mocked(fileSystemApi.searchFiles).mockResolvedValue({
      query: 'App',
      results: [
        { path: 'src/App.tsx', name: 'App.tsx', type: 'file' },
      ],
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('검색...');
    fireEvent.change(searchInput, { target: { value: 'App' } });

    // Advance debounce timer
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(fileSystemApi.searchFiles).toHaveBeenCalledWith('test-project', 'App', false);
    });

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    // FileTree should be replaced by search results (tree role gone)
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  // TC-FET-5: Hidden files toggle works
  it('toggles hidden files visibility', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Hidden files should be hidden by default
    expect(screen.queryByText('.git')).not.toBeInTheDocument();
    expect(screen.queryByText('node_modules')).not.toBeInTheDocument();

    // Click toggle button
    const toggleButton = screen.getByLabelText('숨김 파일 표시');
    fireEvent.click(toggleButton);

    // Now hidden files should be visible
    await waitFor(() => {
      expect(screen.getByText('.git')).toBeInTheDocument();
    });
    expect(screen.getByText('node_modules')).toBeInTheDocument();
  });

  // TC-FET-6: File selection calls requestFileNavigation (AC2)
  it('calls requestFileNavigation when file is selected', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'package.json');
  });

  // TC-FET-7: Clear button resets search text and shows FileTree (AC4)
  it('clears search text when X button is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.mocked(fileSystemApi.searchFiles).mockResolvedValue({
      query: 'App',
      results: [
        { path: 'src/App.tsx', name: 'App.tsx', type: 'file' },
      ],
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('검색...');
    fireEvent.change(searchInput, { target: { value: 'App' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Should show search results (no tree)
    await waitFor(() => {
      expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    });

    // Click clear button
    const clearButton = screen.getByLabelText('검색어 지우기');
    fireEvent.click(clearButton);

    // FileTree should be back
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });
    expect((searchInput as HTMLInputElement).value).toBe('');

    vi.useRealTimers();
  });

  // TC-FET-8: Breadcrumb updates on directory navigation (AC3)
  it('updates breadcrumb when directory is expanded', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce({ path: '.', entries: mockRootEntries })
      .mockResolvedValueOnce({
        path: 'src',
        entries: [
          { name: 'components', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
          { name: 'App.tsx', type: 'file', size: 2048, modifiedAt: '2026-02-20T10:00:00Z' },
          { name: 'main.tsx', type: 'file', size: 256, modifiedAt: '2026-02-19T14:00:00Z' },
        ],
      });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Expand src directory (triggers onNavigate)
    fireEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    // Breadcrumb should now show "Root > src"
    const breadcrumbNav = screen.getByRole('navigation', { name: '경로' });
    const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(currentPage?.textContent).toBe('src');

    // Root should be clickable (not aria-current)
    const rootButton = breadcrumbNav.querySelector('button');
    expect(rootButton?.textContent).toBe('루트');

    // Click Root to reset breadcrumb
    fireEvent.click(rootButton!);

    // Now Root should be aria-current again
    const updatedCurrent = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(updatedCurrent?.textContent).toBe('루트');
  });

  // --- Story 13.3: CRUD Integration Tests ---

  // TC-FET-9: FileTree receives enableContextMenu={true} prop
  it('passes enableContextMenu={true} to FileTree', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Verify context menu works (which means enableContextMenu=true was passed)
    fireEvent.contextMenu(screen.getByText('src'));

    await waitFor(() => {
      expect(screen.getByText('새 파일')).toBeInTheDocument();
    });
  });

  // TC-FET-10: FileTree receives CRUD callback props
  it('passes CRUD callbacks to FileTree', async () => {
    vi.mocked(fileSystemApi.createEntry).mockResolvedValue({ success: true, type: 'file', path: 'src/test.txt' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Test that create callback works through the flow
    fireEvent.contextMenu(screen.getByText('src'));
    await waitFor(() => {
      expect(screen.getByText('새 파일')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('새 파일'));
    await waitFor(() => {
      expect(screen.getByLabelText('새 항목 이름')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('새 항목 이름');
    fireEvent.change(input, { target: { value: 'test.txt' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(fileSystemApi.createEntry).toHaveBeenCalledWith('test-project', 'src/test.txt', 'file');
    });
  });

  // --- View Mode Toggle Tests ---

  // TC-FET-11: View mode toggle button exists and switches between list/grid
  it('toggles between list and grid view', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Default is list view (tree role present)
    expect(screen.getByRole('tree')).toBeInTheDocument();

    // Toggle to grid view
    const toggleButton = screen.getByLabelText('그리드 뷰');
    fireEvent.click(toggleButton);

    // Tree should be gone, grid items should appear
    await waitFor(() => {
      expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    });

    // Should still show entries (loaded by FileGridView)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Toggle back to list view
    const listButton = screen.getByLabelText('리스트 뷰');
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });
  });

  // TC-FET-12: Grid view shows current directory items
  it('shows grid view with current directory items', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Switch to grid
    fireEvent.click(screen.getByLabelText('그리드 뷰'));

    await waitFor(() => {
      expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    });

    // Grid should show non-hidden entries
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });
    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  // TC-FET-13: Grid view folder click updates breadcrumb
  it('updates breadcrumb when folder is clicked in grid view', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce({ path: '.', entries: mockRootEntries })
      .mockResolvedValueOnce({ path: '.', entries: mockRootEntries })
      .mockResolvedValueOnce({
        path: 'src',
        entries: [
          { name: 'App.tsx', type: 'file', size: 2048, modifiedAt: '2026-02-20T10:00:00Z' },
        ],
      });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Switch to grid
    fireEvent.click(screen.getByLabelText('그리드 뷰'));

    await waitFor(() => {
      expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    });

    // Click src folder in grid
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('src'));

    // Breadcrumb should update to "Root > src"
    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    const breadcrumbNav = screen.getByRole('navigation', { name: '경로' });
    const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(currentPage?.textContent).toBe('src');
  });
});
