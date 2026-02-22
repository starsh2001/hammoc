/**
 * QuickFileExplorer Component Tests
 * [Source: Story 14.1 - Task 5.1, Story 14.2 - Task 5.2]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QuickFileExplorer } from '../QuickFileExplorer';

const mockRequestFileNavigation = vi.fn();
const mockAddRecentFile = vi.fn();

vi.mock('../../../stores/fileStore.js', () => ({
  useFileStore: Object.assign(
    vi.fn((selector: any) => {
      if (selector) {
        return selector({
          recentFiles: { 'test-session': ['recent/file1.ts', 'recent/file2.ts'] },
        });
      }
      return {};
    }),
    {
      getState: vi.fn(() => ({
        requestFileNavigation: mockRequestFileNavigation,
        addRecentFile: mockAddRecentFile,
      })),
    }
  ),
}));

vi.mock('../FileTree.js', () => ({
  FileTree: vi.fn(({ onFileSelect }: { onFileSelect: (path: string) => void }) => (
    <div data-testid="file-tree">
      <button data-testid="mock-file" onClick={() => onFileSelect('src/test.ts')}>
        test.ts
      </button>
    </div>
  )),
}));

vi.mock('../../../services/api/fileSystem.js', () => ({
  fileSystemApi: {
    searchFiles: vi.fn(),
  },
}));

import { fileSystemApi } from '../../../services/api/fileSystem.js';

describe('QuickFileExplorer', () => {
  const defaultProps = {
    isOpen: true,
    projectSlug: 'test-project',
    sessionId: 'test-session',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // TC-QFE-1
  it('should not render when isOpen is false', () => {
    render(<QuickFileExplorer {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // TC-QFE-2
  it('should render panel when isOpen is true', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('quick-file-explorer-panel')).toBeInTheDocument();
  });

  // TC-QFE-3
  it('should display "퀵 파일 리스트" title in header', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByText('퀵 파일 리스트')).toBeInTheDocument();
  });

  // TC-QFE-4
  it('should render FileTree with correct props', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByTestId('file-tree')).toBeInTheDocument();
  });

  // TC-QFE-5
  it('should call onClose when close button is clicked', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QFE-6
  it('should call onClose when backdrop is clicked', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByTestId('file-explorer-backdrop'));

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QFE-7
  it('should call onClose when Escape key is pressed', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QFE-8
  it('should call requestFileNavigation, addRecentFile, and onClose when a file is selected', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByTestId('mock-file'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'src/test.ts');
    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'src/test.ts');
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QFE-9
  it('should restore focus to previously focused element when closed', async () => {
    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Trigger';
    document.body.appendChild(triggerButton);
    triggerButton.focus();

    const { rerender } = render(<QuickFileExplorer {...defaultProps} isOpen={true} />);

    // Close the panel
    rerender(<QuickFileExplorer {...defaultProps} isOpen={false} />);

    // Wait for the 350ms animation timeout
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(document.activeElement).toBe(triggerButton);

    document.body.removeChild(triggerButton);
  });

  // TC-QFE-10
  it('should display search input', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByPlaceholderText('파일 검색...')).toBeInTheDocument();
  });

  // TC-QFE-11
  it('should call search API after 300ms debounce', async () => {
    const mockSearchFiles = vi.mocked(fileSystemApi.searchFiles);
    mockSearchFiles.mockResolvedValue({
      query: 'test',
      results: [{ path: 'src/test.ts', name: 'test.ts', type: 'file' as const }],
    });

    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Should not call immediately
    expect(mockSearchFiles).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchFiles).toHaveBeenCalledWith('test-project', 'test', false);
  });

  // TC-QFE-12
  it('should call requestFileNavigation and addRecentFile when search result file is clicked', async () => {
    const mockSearchFiles = vi.mocked(fileSystemApi.searchFiles);
    mockSearchFiles.mockResolvedValue({
      query: 'app',
      results: [{ path: 'src/App.tsx', name: 'App.tsx', type: 'file' as const }],
    });

    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'app' } });

    // Advance past debounce and flush async promise resolution
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Search results should now be rendered
    expect(screen.getByText('App.tsx')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /App\.tsx/i }));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'src/App.tsx');
    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'src/App.tsx');
  });

  // TC-QFE-13
  it('should show loading indicator while searching', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // searchLoading is set to true synchronously in the useEffect
    expect(screen.getByText('검색 중...')).toBeInTheDocument();
  });

  // TC-QFE-14
  it('should show "검색 결과가 없습니다." when no results', async () => {
    const mockSearchFiles = vi.mocked(fileSystemApi.searchFiles);
    mockSearchFiles.mockResolvedValue({
      query: 'nonexistent',
      results: [],
    });

    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    // Advance past debounce and flush async promise resolution
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  // TC-QFE-15
  it('should show recent files section when recent files exist', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByText('최근 열기')).toBeInTheDocument();
    expect(screen.getByText('file1.ts')).toBeInTheDocument();
    expect(screen.getByText('file2.ts')).toBeInTheDocument();
  });

  // TC-QFE-16
  it('should open file when recent file is clicked', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByText('file1.ts'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'recent/file1.ts');
    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'recent/file1.ts');
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  // TC-QFE-17
  it('should add to recent files when FileTree file is selected', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByTestId('mock-file'));

    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'src/test.ts');
  });

  // TC-QFE-18
  it('should clear search text when panel reopens', () => {
    const { rerender } = render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Close then reopen
    rerender(<QuickFileExplorer {...defaultProps} isOpen={false} />);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    rerender(<QuickFileExplorer {...defaultProps} isOpen={true} />);

    const newSearchInput = screen.getByPlaceholderText('파일 검색...');
    expect(newSearchInput).toHaveValue('');
  });
});
