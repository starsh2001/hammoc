/**
 * FileTree Tests
 * [Source: Story 13.1 - Task 4.1]
 * [Extended: Story 13.3 - Task 6.2 — Context menu, inline input, delete dialog tests]
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileTree } from '../FileTree.js';
import type { DirectoryEntry, DirectoryListResponse } from '@bmad-studio/shared';

// Mock fileSystemApi
vi.mock('../../../services/api/fileSystem.js', () => ({
  fileSystemApi: {
    listDirectory: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createEntry: vi.fn(),
    deleteEntry: vi.fn(),
    renameEntry: vi.fn(),
  },
}));

// Mock fileStore
let mockOpenFile: { path: string } | null = null;
vi.mock('../../../stores/fileStore.js', () => ({
  useFileStore: (selector: (state: { openFile: { path: string } | null }) => unknown) =>
    selector({ openFile: mockOpenFile }),
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

const mockSrcEntries: DirectoryEntry[] = [
  { name: 'components', type: 'directory', size: 0, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'App.tsx', type: 'file', size: 2048, modifiedAt: '2026-02-20T10:00:00Z' },
  { name: 'main.tsx', type: 'file', size: 256, modifiedAt: '2026-02-19T14:00:00Z' },
];

const mockSrcResponse: DirectoryListResponse = {
  path: 'src',
  entries: mockSrcEntries,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FileTree', () => {
  // TC-FT-1: Root directory loads and displays on mount (AC1)
  it('loads and displays root directory on mount', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(fileSystemApi.listDirectory).toHaveBeenCalledWith('test-project', '.');
  });

  // TC-FT-2: Folder click lazy-loads subdirectory (AC2)
  it('lazy-loads subdirectory on folder click', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce(mockSrcResponse);

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    expect(screen.getByText('main.tsx')).toBeInTheDocument();
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(fileSystemApi.listDirectory).toHaveBeenCalledWith('test-project', 'src');
  });

  // TC-FT-3: Clicking expanded folder collapses it (AC2)
  it('collapses expanded folder on second click', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce(mockSrcResponse);

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByText('src'));
    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByText('src'));
    expect(screen.queryByText('App.tsx')).not.toBeInTheDocument();
  });

  // TC-FT-4: File and folder icons are differentiated (AC3)
  it('differentiates file and folder icons', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    const { container } = render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Folders should have blue icon class
    const blueIcons = container.querySelectorAll('.text-blue-500');
    expect(blueIcons.length).toBeGreaterThan(0);

    // Files should have gray icon class
    const grayFileIcons = container.querySelectorAll('.text-gray-500');
    expect(grayFileIcons.length).toBeGreaterThan(0);
  });

  // TC-FT-5: File click calls onFileSelect (AC4)
  it('calls onFileSelect when file is clicked', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    const onFileSelect = vi.fn();
    render(<FileTree projectSlug="test-project" onFileSelect={onFileSelect} />);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));
    expect(onFileSelect).toHaveBeenCalledWith('package.json');
  });

  // TC-FT-6: Currently open file path is highlighted (AC5)
  it('highlights currently open file path', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    // Set mock open file
    mockOpenFile = { path: 'package.json' };

    const { container } = render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    const highlighted = container.querySelector('.bg-blue-50');
    expect(highlighted).toBeInTheDocument();
    expect(highlighted?.textContent).toContain('package.json');

    // Restore default
    mockOpenFile = null;
  });

  // TC-FT-7: Hidden files are filtered by default (AC6)
  it('filters hidden files by default', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.queryByText('.git')).not.toBeInTheDocument();
    expect(screen.queryByText('node_modules')).not.toBeInTheDocument();
    expect(screen.queryByText('.env')).not.toBeInTheDocument();
  });

  // TC-FT-8: showHidden=true shows hidden files (AC6)
  it('shows hidden files when showHidden is true', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} showHidden />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    expect(screen.getByText('.git')).toBeInTheDocument();
    expect(screen.getByText('node_modules')).toBeInTheDocument();
    expect(screen.getByText('.env')).toBeInTheDocument();
  });

  // TC-FT-9: Entries sorted directories-first, then alphabetical
  it('sorts entries with directories first then alphabetical', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    const { container } = render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const treeItems = container.querySelectorAll('[role="treeitem"]');
    const names = Array.from(treeItems).map((el) => el.textContent?.trim());

    // With hidden filtered: src (dir), package.json (file), README.md (file)
    expect(names[0]).toBe('src');
    expect(names[1]).toContain('package.json');
    expect(names[2]).toContain('README.md');
  });

  // TC-FT-10: Loading spinner shown during directory load (AC2)
  it('shows loading spinner during directory load', async () => {
    let resolveList!: (value: DirectoryListResponse) => void;
    vi.mocked(fileSystemApi.listDirectory).mockImplementation(
      () => new Promise((resolve) => { resolveList = resolve; }),
    );

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    // Should show loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Resolve the promise
    resolveList(mockRootResponse);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });
  });

  // TC-FT-11: ArrowDown/ArrowUp keyboard navigation (a11y)
  it('navigates focus with ArrowDown and ArrowUp keys', async () => {
    vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

    const { container } = render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const tree = container.querySelector('[role="tree"]')!;

    // ArrowDown to focus first item
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    await waitFor(() => {
      const focused = container.querySelector('.ring-2.ring-blue-500');
      expect(focused).toBeInTheDocument();
    });

    // ArrowDown again to move to second item
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    await waitFor(() => {
      const focused = container.querySelector('.ring-2.ring-blue-500');
      expect(focused?.textContent).toContain('package.json');
    });

    // ArrowUp to go back
    fireEvent.keyDown(tree, { key: 'ArrowUp' });
    await waitFor(() => {
      const focused = container.querySelector('.ring-2.ring-blue-500');
      expect(focused?.textContent).toContain('src');
    });
  });

  // TC-FT-12: ArrowRight expands, ArrowLeft collapses folders (a11y)
  it('expands folder with ArrowRight and collapses with ArrowLeft', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce(mockSrcResponse);

    const { container } = render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const tree = container.querySelector('[role="tree"]')!;

    // Focus src folder
    fireEvent.keyDown(tree, { key: 'ArrowDown' });

    // ArrowRight to expand
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    // ArrowLeft to collapse
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(screen.queryByText('App.tsx')).not.toBeInTheDocument();
  });

  // TC-FT-13: Enter key selects file and toggles folder (a11y)
  it('selects file with Enter key and toggles folder', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce(mockSrcResponse);

    const onFileSelect = vi.fn();
    const { container } = render(
      <FileTree projectSlug="test-project" onFileSelect={onFileSelect} />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    const tree = container.querySelector('[role="tree"]')!;

    // Focus src, press Enter to toggle
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    // Navigate to file, press Enter to select
    fireEvent.keyDown(tree, { key: 'ArrowDown' }); // components (dir)
    fireEvent.keyDown(tree, { key: 'ArrowDown' }); // App.tsx (file)
    fireEvent.keyDown(tree, { key: 'Enter' });

    expect(onFileSelect).toHaveBeenCalledWith('src/App.tsx');
  });

  // TC-FT-14: Empty directory shows "Empty folder" message (UX)
  it('shows "Empty folder" for empty directories', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce({ path: 'src', entries: [] });

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(screen.getByText('Empty folder')).toBeInTheDocument();
    });
  });

  // TC-FT-15: API error shows error message and retry button (UX)
  it('shows error message and retry button on API error', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockSrcResponse);

    render(<FileTree projectSlug="test-project" onFileSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Expand src — will fail
    fireEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Click retry
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });
  });

  // TC-FT-16: onNavigate is called when directory is expanded (Story 13.2)
  it('calls onNavigate when directory is expanded', async () => {
    vi.mocked(fileSystemApi.listDirectory)
      .mockResolvedValueOnce(mockRootResponse)
      .mockResolvedValueOnce(mockSrcResponse);

    const onNavigate = vi.fn();
    render(
      <FileTree projectSlug="test-project" onFileSelect={vi.fn()} onNavigate={onNavigate} />,
    );

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Expand src directory
    fireEvent.click(screen.getByText('src'));

    expect(onNavigate).toHaveBeenCalledWith('src');

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument();
    });

    // Collapse — onNavigate should NOT be called again
    fireEvent.click(screen.getByText('src'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  // --- Story 13.3: Context Menu Tests ---

  describe('Context Menu', () => {
    const renderWithContextMenu = async () => {
      vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

      const mockOnCreate = vi.fn().mockResolvedValue(undefined);
      const mockOnDelete = vi.fn().mockResolvedValue(undefined);
      const mockOnRename = vi.fn().mockResolvedValue(undefined);

      const result = render(
        <FileTree
          projectSlug="test-project"
          onFileSelect={vi.fn()}
          enableContextMenu={true}
          onCreateEntry={mockOnCreate}
          onDeleteEntry={mockOnDelete}
          onRenameEntry={mockOnRename}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument();
      });

      return { ...result, mockOnCreate, mockOnDelete, mockOnRename };
    };

    // TC-FT-19: Right-click shows context menu when enableContextMenu=true (AC1)
    it('shows context menu on right-click when enableContextMenu=true', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('src'));

      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });
    });

    // TC-FT-20: Context menu shows all 4 options (AC2)
    it('shows all 4 options in context menu', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('src'));

      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
        expect(screen.getByText('새 폴더')).toBeInTheDocument();
        expect(screen.getByText('이름 변경')).toBeInTheDocument();
        expect(screen.getByText('삭제')).toBeInTheDocument();
      });
    });

    // TC-FT-21: No context menu when enableContextMenu=false
    it('does not show context menu when enableContextMenu=false', async () => {
      vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

      render(
        <FileTree
          projectSlug="test-project"
          onFileSelect={vi.fn()}
          enableContextMenu={false}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('src')).toBeInTheDocument();
      });

      fireEvent.contextMenu(screen.getByText('src'));

      expect(screen.queryByText('새 파일')).not.toBeInTheDocument();
    });

    // TC-FT-22: MoreVertical menu button click shows context menu (AC1)
    it('shows context menu on MoreVertical button click', async () => {
      await renderWithContextMenu();

      const menuButton = screen.getAllByLabelText('더보기 메뉴')[0];
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });
    });

    // TC-FT-23: "새 파일" click shows inline input (AC3)
    it('shows inline input when "새 파일" is clicked', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('src'));

      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('새 파일'));

      await waitFor(() => {
        expect(screen.getByLabelText('새 항목 이름')).toBeInTheDocument();
      });
    });

    // TC-FT-24: Enter on inline input calls onCreateEntry (AC3)
    it('calls onCreateEntry when Enter is pressed on inline input', async () => {
      const { mockOnCreate } = await renderWithContextMenu();

      // Mock listDirectory for refresh after create
      vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

      fireEvent.contextMenu(screen.getByText('src'));
      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('새 파일'));

      await waitFor(() => {
        expect(screen.getByLabelText('새 항목 이름')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('새 항목 이름');
      fireEvent.change(input, { target: { value: 'newFile.ts' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockOnCreate).toHaveBeenCalledWith('src', 'file', 'newFile.ts');
      });
    });

    // TC-FT-25: Escape on inline input cancels (AC3)
    it('cancels inline input on Escape', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('src'));
      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('새 파일'));

      await waitFor(() => {
        expect(screen.getByLabelText('새 항목 이름')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('새 항목 이름');
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByLabelText('새 항목 이름')).not.toBeInTheDocument();
      });
    });

    // TC-FT-26: "삭제" click shows delete confirm dialog (AC4)
    it('shows delete confirm dialog when "삭제" is clicked', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('package.json'));
      await waitFor(() => {
        expect(screen.getByText('삭제')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('삭제'));

      await waitFor(() => {
        expect(screen.getByText('삭제 확인')).toBeInTheDocument();
      });
    });

    // TC-FT-27: Confirm delete calls onDeleteEntry (AC4)
    it('calls onDeleteEntry when delete is confirmed', async () => {
      const { mockOnDelete } = await renderWithContextMenu();

      // Mock listDirectory for refresh after delete
      vi.mocked(fileSystemApi.listDirectory).mockResolvedValue(mockRootResponse);

      fireEvent.contextMenu(screen.getByText('package.json'));
      await waitFor(() => {
        expect(screen.getByText('삭제')).toBeInTheDocument();
      });

      // Click "삭제" in context menu
      fireEvent.click(screen.getByText('삭제'));

      await waitFor(() => {
        expect(screen.getByText('삭제 확인')).toBeInTheDocument();
      });

      // The last "삭제" button in the dialog is the confirm button
      const deleteButtons = screen.getAllByText('삭제');
      fireEvent.click(deleteButtons[deleteButtons.length - 1]);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('package.json');
      });
    });

    // TC-FT-28: Cancel in delete dialog closes it (AC4)
    it('closes delete confirm dialog on cancel', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('package.json'));
      await waitFor(() => {
        expect(screen.getByText('삭제')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('삭제'));

      await waitFor(() => {
        expect(screen.getByText('삭제 확인')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('취소'));

      await waitFor(() => {
        expect(screen.queryByText('삭제 확인')).not.toBeInTheDocument();
      });
    });

    // TC-FT-29: "이름 변경" click shows inline input with current name (AC3)
    it('shows inline input with current name on rename', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('package.json'));
      await waitFor(() => {
        expect(screen.getByText('이름 변경')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('이름 변경'));

      await waitFor(() => {
        const input = screen.getByLabelText('이름 변경');
        expect(input).toBeInTheDocument();
        expect((input as HTMLInputElement).value).toBe('package.json');
      });
    });

    // TC-FT-30: Click outside closes context menu
    it('closes context menu on outside click', async () => {
      await renderWithContextMenu();

      fireEvent.contextMenu(screen.getByText('src'));
      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });

      // Click outside (on body)
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByText('새 파일')).not.toBeInTheDocument();
      });
    });

    // TC-FT-31: Tree refreshes after CRUD operations (AC6)
    it('refreshes directory after CRUD operations', async () => {
      const { mockOnCreate } = await renderWithContextMenu();

      const updatedRootResponse: DirectoryListResponse = {
        path: '.',
        entries: [
          ...mockRootEntries,
          { name: 'newFile.ts', type: 'file', size: 0, modifiedAt: '2026-02-22T10:00:00Z' },
        ],
      };

      // Setup: refresh calls return updated
      vi.mocked(fileSystemApi.listDirectory)
        .mockResolvedValue(updatedRootResponse);

      // Right-click on a root-level file to get context menu with parentPath='.'
      fireEvent.contextMenu(screen.getByText('package.json'));
      await waitFor(() => {
        expect(screen.getByText('새 파일')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('새 파일'));

      await waitFor(() => {
        expect(screen.getByLabelText('새 항목 이름')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('새 항목 이름');
      fireEvent.change(input, { target: { value: 'newFile.ts' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockOnCreate).toHaveBeenCalled();
      });

      // listDirectory should be called again for refresh
      await waitFor(() => {
        expect(fileSystemApi.listDirectory).toHaveBeenCalledWith('test-project', '.');
      });
    });
  });
});
