/**
 * TextEditor Component Tests
 * [Source: Story 11.3 - Task 5.2]
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TextEditor } from '../TextEditor';

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock ConfirmModal
vi.mock('../../ConfirmModal', () => ({
  ConfirmModal: ({
    isOpen,
    onConfirm,
    onCancel,
    message,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    message: string;
  }) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <p>{message}</p>
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

// Mock fileStore
const mockSaveFile = vi.fn();
const mockCloseEditor = vi.fn();
const mockSetContent = vi.fn();
const mockResetError = vi.fn();
const mockOpenFileInEditor = vi.fn();

let mockStoreState = {
  openFile: null as { projectSlug: string; path: string } | null,
  content: '',
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isTruncated: false,
  error: null as string | null,
  saveFile: mockSaveFile,
  closeEditor: mockCloseEditor,
  setContent: mockSetContent,
  resetError: mockResetError,
  openFileInEditor: mockOpenFileInEditor,
};

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: (selector?: (state: typeof mockStoreState) => unknown) => {
    if (selector) return selector(mockStoreState);
    return mockStoreState;
  },
}));

describe('TextEditor', () => {
  beforeEach(() => {
    mockStoreState = {
      openFile: null,
      content: '',
      isDirty: false,
      isLoading: false,
      isSaving: false,
      isTruncated: false,
      error: null,
      saveFile: mockSaveFile,
      closeEditor: mockCloseEditor,
      setContent: mockSetContent,
      resetError: mockResetError,
      openFileInEditor: mockOpenFileInEditor,
    };
    vi.clearAllMocks();
    mockSaveFile.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
    document.body.style.overflow = '';
  });

  it('TC-TE1: should render nothing when openFile is null', () => {
    const { container } = render(<TextEditor />);
    expect(container.innerHTML).toBe('');
  });

  it('TC-TE2: should render fullscreen overlay when openFile is set', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'file content';

    render(<TextEditor />);

    // Check z-50 panel exists
    const panel = document.querySelector('.fixed.inset-0.z-50');
    expect(panel).not.toBeNull();
  });

  it('TC-TE3: should display file path in header', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/components/App.tsx' };
    mockStoreState.content = '';

    render(<TextEditor />);

    expect(screen.getByText('src/components/App.tsx')).toBeDefined();
  });

  it('TC-TE4: should display content in textarea and allow editing', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'hello world';

    render(<TextEditor />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDefined();
    expect((textarea as HTMLTextAreaElement).value).toBe('hello world');

    fireEvent.change(textarea, { target: { value: 'changed' } });
    expect(mockSetContent).toHaveBeenCalledWith('changed');
  });

  it('TC-TE5: should show loading state', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.isLoading = true;

    render(<TextEditor />);

    expect(screen.getByText('Loading file...')).toBeDefined();
  });

  it('TC-TE6: should show error message', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.error = '파일을 찾을 수 없습니다.';

    render(<TextEditor />);

    expect(screen.getByText('파일을 찾을 수 없습니다.')).toBeDefined();
  });

  it('TC-TE7: should call handleClose on Escape', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = '';
    mockStoreState.isDirty = false;

    render(<TextEditor />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockCloseEditor).toHaveBeenCalled();
  });

  it('TC-TE8: should show confirm dialog when closing with dirty state', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'modified';
    mockStoreState.isDirty = true;

    render(<TextEditor />);

    // Click close button
    const closeButton = screen.getByLabelText('Close editor');
    fireEvent.click(closeButton);

    // Confirm modal should appear
    expect(screen.getByTestId('confirm-modal')).toBeDefined();
  });

  it('TC-TE9: should close directly when not dirty', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = '';
    mockStoreState.isDirty = false;

    render(<TextEditor />);

    const closeButton = screen.getByLabelText('Close editor');
    fireEvent.click(closeButton);

    expect(mockCloseEditor).toHaveBeenCalled();
  });

  it('TC-TE10: should show truncation warning when isTruncated is true', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'large-file.txt' };
    mockStoreState.content = 'partial...';
    mockStoreState.isTruncated = true;

    render(<TextEditor />);

    expect(screen.getByText(/크기 제한/)).toBeDefined();
  });

  it('TC-TE11: should call resetError and openFileInEditor on retry', () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.error = 'Network error';

    render(<TextEditor />);

    const retryButton = screen.getByText('다시 시도');
    fireEvent.click(retryButton);

    expect(mockResetError).toHaveBeenCalled();
    expect(mockOpenFileInEditor).toHaveBeenCalledWith('test', 'src/index.ts');
  });

  it('TC-TE12: should dismiss confirm dialog on Escape without closing editor', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'modified';
    mockStoreState.isDirty = true;

    render(<TextEditor />);

    // Open confirm dialog
    const closeButton = screen.getByLabelText('Close editor');
    fireEvent.click(closeButton);
    expect(screen.getByTestId('confirm-modal')).toBeDefined();

    // Press Escape — should dismiss dialog, not close editor
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-modal')).toBeNull();
    });
    expect(mockCloseEditor).not.toHaveBeenCalled();
  });
});
