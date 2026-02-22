/**
 * QuickFileExplorer Component Tests
 * [Source: Story 14.1 - Task 5.1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QuickFileExplorer } from '../QuickFileExplorer';

const mockRequestFileNavigation = vi.fn();

vi.mock('../../../stores/fileStore.js', () => ({
  useFileStore: {
    getState: vi.fn(() => ({
      requestFileNavigation: mockRequestFileNavigation,
    })),
  },
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

describe('QuickFileExplorer', () => {
  const defaultProps = {
    isOpen: true,
    projectSlug: 'test-project',
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
  it('should display "파일 탐색기" title in header', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    expect(screen.getByText('파일 탐색기')).toBeInTheDocument();
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
  it('should call requestFileNavigation and onClose when a file is selected', () => {
    render(<QuickFileExplorer {...defaultProps} />);

    fireEvent.click(screen.getByTestId('mock-file'));

    expect(mockRequestFileNavigation).toHaveBeenCalledWith('test-project', 'src/test.ts');
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
});
