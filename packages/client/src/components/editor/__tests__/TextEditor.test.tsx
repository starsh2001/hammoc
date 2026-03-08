/**
 * TextEditor Component Tests
 * [Source: Story 11.3 - Task 5.2]
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

// Mock MarkdownPreview
vi.mock('../MarkdownPreview', () => ({
  MarkdownPreview: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

// Mock useTheme
vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

// Mock CodeMirror
const mockEditorView = {
  focus: vi.fn(),
  dom: document.createElement('div'),
  dispatch: vi.fn(),
};
let mockOnCreateEditor: (() => void) | null = null;
vi.mock('@uiw/react-codemirror', () => ({
  default: vi.fn(({ value, onChange, onCreateEditor, readOnly }: {
    value: string;
    onChange?: (value: string) => void;
    onCreateEditor?: (view: typeof mockEditorView) => void;
    readOnly?: boolean;
  }) => {
    mockOnCreateEditor = () => onCreateEditor?.(mockEditorView);
    return (
      <div data-testid="codemirror-editor">
        <textarea
          data-testid="codemirror-textarea"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          aria-label="mock-codemirror"
        />
      </div>
    );
  }),
}));

// Mock CodeMirror dependencies
vi.mock('@codemirror/view', () => ({
  EditorView: {
    lineWrapping: {},
    editable: { of: vi.fn(() => ({})) },
  },
}));
vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: {},
}));
vi.mock('../../utils/languageDetect', async () => {
  return {
    getLanguageExtension: vi.fn(() => null),
    isMarkdownPath: (path: string) => path.toLowerCase().endsWith('.md'),
  };
});

// Mock fileStore
const mockSaveFile = vi.fn();
const mockCloseEditor = vi.fn();
const mockSetContent = vi.fn();
const mockResetError = vi.fn();
const mockOpenFileInEditor = vi.fn();
const mockToggleMarkdownPreview = vi.fn();

let mockStoreState = {
  openFile: null as { projectSlug: string; path: string } | null,
  content: '',
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isTruncated: false,
  isMarkdownPreview: false,
  error: null as string | null,
  saveFile: mockSaveFile,
  closeEditor: mockCloseEditor,
  setContent: mockSetContent,
  resetError: mockResetError,
  openFileInEditor: mockOpenFileInEditor,
  toggleMarkdownPreview: mockToggleMarkdownPreview,
  pendingNavigation: null as { projectSlug: string; path: string } | null,
  confirmPendingNavigation: vi.fn(),
  cancelPendingNavigation: vi.fn(),
};

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: Object.assign(
    (selector?: (state: typeof mockStoreState) => unknown) => {
      if (selector) return selector(mockStoreState);
      return mockStoreState;
    },
    {
      getState: () => mockStoreState,
    },
  ),
}));

// Helper to render and wait for lazy CodeMirror to load
async function renderAndWaitForEditor(ui: React.ReactElement) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
  });
  return result!;
}

describe('TextEditor', () => {
  beforeEach(() => {
    mockStoreState = {
      openFile: null,
      content: '',
      isDirty: false,
      isLoading: false,
      isSaving: false,
      isTruncated: false,
      isMarkdownPreview: false,
      error: null,
      saveFile: mockSaveFile,
      closeEditor: mockCloseEditor,
      setContent: mockSetContent,
      resetError: mockResetError,
      openFileInEditor: mockOpenFileInEditor,
      toggleMarkdownPreview: mockToggleMarkdownPreview,
      pendingNavigation: null,
      confirmPendingNavigation: vi.fn(),
      cancelPendingNavigation: vi.fn(),
    };
    vi.clearAllMocks();
    mockSaveFile.mockResolvedValue(true);
    mockOnCreateEditor = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  it('TC-TE1: should render nothing when openFile is null', async () => {
    const { container } = await renderAndWaitForEditor(<TextEditor />);
    expect(container.innerHTML).toBe('');
  });

  it('TC-TE2: should render fullscreen overlay when openFile is set', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'file content';

    await renderAndWaitForEditor(<TextEditor />);

    const panel = document.querySelector('.fixed.inset-0.z-\\[60\\]');
    expect(panel).not.toBeNull();
  });

  it('TC-TE3: should display file path in header', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/components/App.tsx' };
    mockStoreState.content = '';

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText('src/components/App.tsx')).toBeDefined();
  });

  it('TC-TE4: should display content in CodeMirror editor and allow editing', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'hello world';

    await renderAndWaitForEditor(<TextEditor />);

    const editor = await screen.findByTestId('codemirror-editor');
    expect(editor).toBeDefined();

    const textarea = screen.getByTestId('codemirror-textarea');
    expect((textarea as HTMLTextAreaElement).value).toBe('hello world');

    fireEvent.change(textarea, { target: { value: 'changed' } });
    expect(mockSetContent).toHaveBeenCalledWith('changed');
  });

  it('TC-TE5: should show loading state', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.isLoading = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText('파일 로딩 중...')).toBeDefined();
  });

  it('TC-TE6: should show error message', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.error = '파일을 찾을 수 없습니다.';

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText('파일을 찾을 수 없습니다.')).toBeDefined();
  });

  it('TC-TE7: should call handleClose on Escape', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = '';
    mockStoreState.isDirty = false;

    await renderAndWaitForEditor(<TextEditor />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockCloseEditor).toHaveBeenCalled();
  });

  it('TC-TE8: should show confirm dialog when closing with dirty state', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'modified';
    mockStoreState.isDirty = true;

    await renderAndWaitForEditor(<TextEditor />);

    const closeButton = screen.getByLabelText('편집기 닫기');
    fireEvent.click(closeButton);

    expect(screen.getByTestId('confirm-modal')).toBeDefined();
  });

  it('TC-TE9: should close directly when not dirty', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = '';
    mockStoreState.isDirty = false;

    await renderAndWaitForEditor(<TextEditor />);

    const closeButton = screen.getByLabelText('편집기 닫기');
    fireEvent.click(closeButton);

    expect(mockCloseEditor).toHaveBeenCalled();
  });

  it('TC-TE10: should show truncation warning when isTruncated is true', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'large-file.txt' };
    mockStoreState.content = 'partial...';
    mockStoreState.isTruncated = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText(/크기 제한/)).toBeDefined();
  });

  it('TC-TE11: should call resetError and openFileInEditor on retry', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.error = 'Network error';

    await renderAndWaitForEditor(<TextEditor />);

    const retryButton = screen.getByText('다시 시도');
    fireEvent.click(retryButton);

    expect(mockResetError).toHaveBeenCalled();
    expect(mockOpenFileInEditor).toHaveBeenCalledWith('test', 'src/index.ts');
  });

  it('TC-TE12: should dismiss confirm dialog on Escape without closing editor', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'modified';
    mockStoreState.isDirty = true;

    await renderAndWaitForEditor(<TextEditor />);

    const closeButton = screen.getByLabelText('편집기 닫기');
    fireEvent.click(closeButton);
    expect(screen.getByTestId('confirm-modal')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-modal')).toBeNull();
    });
    expect(mockCloseEditor).not.toHaveBeenCalled();
  });

  it('TC-TE13: should show Preview toggle button for .md files', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello';

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText('미리보기')).toBeDefined();
    expect(screen.getByLabelText('미리보기')).toBeDefined();
  });

  it('TC-TE14: should not show Preview toggle button for non-.md files', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'code';

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.queryByText('미리보기')).toBeNull();
    expect(screen.queryByText('편집')).toBeNull();
  });

  it('TC-TE15: should call toggleMarkdownPreview on toggle button click', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello';

    await renderAndWaitForEditor(<TextEditor />);

    fireEvent.click(screen.getByText('미리보기'));
    expect(mockToggleMarkdownPreview).toHaveBeenCalled();
  });

  it('TC-TE16: should render MarkdownPreview instead of editor in preview mode', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello World';
    mockStoreState.isMarkdownPreview = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByTestId('markdown-preview')).toBeDefined();
    expect(screen.getByTestId('markdown-preview').textContent).toBe('# Hello World');
    expect(screen.queryByTestId('codemirror-editor')).toBeNull();
  });

  it('TC-TE17: should be read-only in preview mode (no editor)', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'docs/guide.md' };
    mockStoreState.content = '## Guide';
    mockStoreState.isMarkdownPreview = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.queryByTestId('codemirror-editor')).toBeNull();
    expect(screen.getByTestId('markdown-preview')).toBeDefined();
    expect(screen.getByText('편집')).toBeDefined();
    expect(screen.getByLabelText('편집 모드로 전환')).toBeDefined();
  });

  it('TC-TE18: should restore editor focus when switching from preview to edit', async () => {
    // Start in edit mode to get editorRef set via onCreateEditor
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello';
    mockStoreState.isMarkdownPreview = false;

    const { rerender } = await renderAndWaitForEditor(<TextEditor />);
    await screen.findByTestId('codemirror-editor');
    // Trigger onCreateEditor to set editorRef
    if (mockOnCreateEditor) {
      act(() => { mockOnCreateEditor!(); });
    }
    vi.clearAllMocks();

    // Switch to preview mode
    mockStoreState.isMarkdownPreview = true;
    await act(async () => {
      rerender(<TextEditor />);
    });

    // Switch back to edit mode — should call focus on editorRef
    mockStoreState.isMarkdownPreview = false;
    await act(async () => {
      rerender(<TextEditor />);
    });

    expect(mockEditorView.focus).toHaveBeenCalled();
  });

  it('TC-TE19: should render CodeMirror editor within Suspense', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'code';

    await renderAndWaitForEditor(<TextEditor />);

    expect(await screen.findByTestId('codemirror-editor')).toBeDefined();
  });

  it('TC-TE20: should call setContent via CodeMirror onChange', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'original';

    await renderAndWaitForEditor(<TextEditor />);

    const textarea = await screen.findByTestId('codemirror-textarea');
    fireEvent.change(textarea, { target: { value: 'new content' } });
    expect(mockSetContent).toHaveBeenCalledWith('new content');
  });
});
