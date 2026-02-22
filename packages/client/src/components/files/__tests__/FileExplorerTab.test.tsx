/**
 * FileExplorerTab Tests
 * [Source: Story 13.2 - Task 4.1]
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FileExplorerTab } from '../FileExplorerTab.js';
import type { DirectoryEntry, DirectoryListResponse } from '@bmad-studio/shared';

// Mock fileSystemApi
vi.mock('../../../services/api/fileSystem.js', () => ({
  fileSystemApi: {
    listDirectory: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
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

import { fileSystemApi } from '../../../services/api/fileSystem.js';

const mockRootEntries: DirectoryEntry[] = [
  { name: 'src', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'node_modules', type: 'directory', size: 0, modifiedAt: '2026-02-20T09:00:00Z' },
  { name: '.git', type: 'directory', size: 0, modifiedAt: '2026-02-20T08:00:00Z' },
  { name: 'package.json', type: 'file', size: 1024, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'README.md', type: 'file', size: 512, modifiedAt: '2026-02-19T15:00:00Z' },
  { name: '.env', type: 'file', size: 128, modifiedAt: '2026-02-18T12:00:00Z' },
];

const mockRootResponse: DirectoryListResponse = {
  path: '.',
  entries: mockRootEntries,
};

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
});

describe('FileExplorerTab', () => {
  // TC-FET-1: FileExplorerTab renders and FileTree is displayed (AC2)
  it('renders and displays FileTree', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  // TC-FET-2: Breadcrumb shows initial "Root" (AC3)
  it('displays breadcrumb with Root initially', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument();
    });

    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumbNav).toBeInTheDocument();

    // Root should have aria-current="page" as it's the only/last segment
    const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(currentPage?.textContent).toBe('Root');
  });

  // TC-FET-3: Search input exists with placeholder (AC4)
  it('has search input with placeholder', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    expect(searchInput).toBeInTheDocument();
  });

  // TC-FET-4: Search input filters FileTree entries (AC4)
  it('filters entries when typing in search input', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'package' } });

    // package.json should remain visible
    expect(screen.getByText('package.json')).toBeInTheDocument();

    // src and README.md should be filtered out
    expect(screen.queryByText('src')).not.toBeInTheDocument();
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();
  });

  // TC-FET-5: Hidden files toggle works
  it('toggles hidden files visibility', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

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
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'package.json');
  });

  // TC-FET-7: Clear button resets search text (AC4)
  it('clears search text when X button is clicked', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'package' } });

    // src should be filtered out
    expect(screen.queryByText('src')).not.toBeInTheDocument();

    // Click clear button
    const clearButton = screen.getByLabelText('검색어 지우기');
    fireEvent.click(clearButton);

    // All entries should be visible again
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });
    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect((searchInput as HTMLInputElement).value).toBe('');
  });

  // TC-FET-8: Breadcrumb updates on directory navigation (AC3)
  it('updates breadcrumb when directory is expanded', async () => {
    const mockSrcResponse: DirectoryListResponse = {
      path: 'src',
      entries: [
        { name: 'components', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
        { name: 'App.tsx', type: 'file', size: 2048, modifiedAt: '2026-02-20T10:00:00Z' },
      ],
    };

    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce(mockSrcResponse);

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
    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const currentPage = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(currentPage?.textContent).toBe('src');

    // Root should be clickable (not aria-current)
    const rootButton = breadcrumbNav.querySelector('button');
    expect(rootButton?.textContent).toBe('Root');

    // Click Root to reset breadcrumb
    fireEvent.click(rootButton!);

    // Now Root should be aria-current again
    const updatedCurrent = breadcrumbNav.querySelector('[aria-current="page"]');
    expect(updatedCurrent?.textContent).toBe('Root');
  });
});
