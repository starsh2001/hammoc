/**
 * QuickFileExplorer Component Tests (Content-only, post-refactor)
 * [Source: Story 14.1 - Task 5.1, Story 14.2 - Task 5.2, Story 19.1 - Task 9.3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QuickFileExplorer } from '../QuickFileExplorer';

// Mock react-router-dom useParams
vi.mock('react-router-dom', () => ({
  useParams: () => ({ sessionId: 'test-session' }),
}));

const mockRequestFileNavigation = vi.fn();
const mockAddRecentFile = vi.fn();

vi.mock('../../../stores/fileStore.js', () => ({
  useFileStore: Object.assign(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    projectSlug: 'test-project',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render panel with search input and file tree', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByPlaceholderText('파일 검색...')).toBeInTheDocument();
    expect(screen.getByTestId('file-tree')).toBeInTheDocument();
  });

  it('should call requestFileNavigation and addRecentFile when a file is selected from tree', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByTestId('mock-file'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'src/test.ts');
    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'src/test.ts');
  });

  it('should call search API after 300ms debounce', async () => {
    const mockSearchFiles = vi.mocked(fileSystemApi.searchFiles);
    mockSearchFiles.mockResolvedValue({
      query: 'test',
      results: [{ path: 'src/test.ts', name: 'test.ts', type: 'file' as const }],
    });

    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    expect(mockSearchFiles).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchFiles).toHaveBeenCalledWith('test-project', 'test', false);
  });

  it('should call requestFileNavigation and addRecentFile when search result file is clicked', async () => {
    const mockSearchFiles = vi.mocked(fileSystemApi.searchFiles);
    mockSearchFiles.mockResolvedValue({
      query: 'app',
      results: [{ path: 'src/App.tsx', name: 'App.tsx', type: 'file' as const }],
    });

    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'app' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('App.tsx')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /App\.tsx/i }));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'src/App.tsx');
    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'src/App.tsx');
  });

  it('should show loading indicator while searching', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    expect(screen.getByText('검색 중...')).toBeInTheDocument();
  });

  it('should show "검색 결과가 없습니다." when no results', async () => {
    const mockSearchFiles = vi.mocked(fileSystemApi.searchFiles);
    mockSearchFiles.mockResolvedValue({
      query: 'nonexistent',
      results: [],
    });

    render(<QuickFileExplorer {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('파일 검색...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('should show recent files section when recent files exist', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByText('최근 열기')).toBeInTheDocument();
    expect(screen.getByText('file1.ts')).toBeInTheDocument();
    expect(screen.getByText('file2.ts')).toBeInTheDocument();
  });

  it('should open file when recent file is clicked', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByText('file1.ts'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'recent/file1.ts');
    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'recent/file1.ts');
  });

  it('should add to recent files when FileTree file is selected', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByTestId('mock-file'));

    expect(mockAddRecentFile).toHaveBeenCalledWith('test-session', 'src/test.ts');
  });
});
