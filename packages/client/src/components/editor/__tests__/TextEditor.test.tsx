/**
 * TextEditor Component Tests
 * [Source: Story 11.3 - Task 5.2]
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor as _MockEditor } from '@monaco-editor/react';
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

// Mock Monaco Editor
const mockEditorInstance = {
  focus: vi.fn(),
};
let mockOnMount: (() => void) | null = null;
vi.mock('@monaco-editor/react', () => ({
  Editor: vi.fn(({ value, language, onChange, onMount }: {
    value: string;
    language: string;
    onChange?: (value: string | undefined) => void;
    onMount?: (editor: typeof mockEditorInstance, monaco: unknown) => void;
  }) => {
    mockOnMount = () => onMount?.(mockEditorInstance, {});
    return (
      <div data-testid="monaco-editor" data-language={language}>
        <textarea
          data-testid="monaco-textarea"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          aria-label="mock-monaco"
        />
      </div>
    );
  }),
}));

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
  language: 'plaintext',
  error: null as string | null,
  saveFile: mockSaveFile,
  closeEditor: mockCloseEditor,
  setContent: mockSetContent,
  resetError: mockResetError,
  openFileInEditor: mockOpenFileInEditor,
  toggleMarkdownPreview: mockToggleMarkdownPreview,
};

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: (selector?: (state: typeof mockStoreState) => unknown) => {
    if (selector) return selector(mockStoreState);
    return mockStoreState;
  },
}));

// Helper to render and wait for lazy Monaco Editor to load
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
      language: 'plaintext',
      error: null,
      saveFile: mockSaveFile,
      closeEditor: mockCloseEditor,
      setContent: mockSetContent,
      resetError: mockResetError,
      openFileInEditor: mockOpenFileInEditor,
      toggleMarkdownPreview: mockToggleMarkdownPreview,
    };
    vi.clearAllMocks();
    mockSaveFile.mockResolvedValue(true);
    mockOnMount = null;
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

    const panel = document.querySelector('.fixed.inset-0.z-50');
    expect(panel).not.toBeNull();
  });

  it('TC-TE3: should display file path in header', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/components/App.tsx' };
    mockStoreState.content = '';

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText('src/components/App.tsx')).toBeDefined();
  });

  it('TC-TE4: should display content in Monaco Editor and allow editing', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'hello world';

    await renderAndWaitForEditor(<TextEditor />);

    const editor = await screen.findByTestId('monaco-editor');
    expect(editor).toBeDefined();

    const textarea = screen.getByTestId('monaco-textarea');
    expect((textarea as HTMLTextAreaElement).value).toBe('hello world');

    fireEvent.change(textarea, { target: { value: 'changed' } });
    expect(mockSetContent).toHaveBeenCalledWith('changed');
  });

  it('TC-TE5: should show loading state', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.isLoading = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByText('Loading file...')).toBeDefined();
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

    const closeButton = screen.getByLabelText('Close editor');
    fireEvent.click(closeButton);

    expect(screen.getByTestId('confirm-modal')).toBeDefined();
  });

  it('TC-TE9: should close directly when not dirty', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = '';
    mockStoreState.isDirty = false;

    await renderAndWaitForEditor(<TextEditor />);

    const closeButton = screen.getByLabelText('Close editor');
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

    const closeButton = screen.getByLabelText('Close editor');
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

    expect(screen.getByText('Preview')).toBeDefined();
    expect(screen.getByLabelText('Switch to preview mode')).toBeDefined();
  });

  it('TC-TE14: should not show Preview toggle button for non-.md files', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'code';

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.queryByText('Preview')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('TC-TE15: should call toggleMarkdownPreview on toggle button click', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello';

    await renderAndWaitForEditor(<TextEditor />);

    fireEvent.click(screen.getByText('Preview'));
    expect(mockToggleMarkdownPreview).toHaveBeenCalled();
  });

  it('TC-TE16: should render MarkdownPreview instead of Monaco Editor in preview mode', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello World';
    mockStoreState.isMarkdownPreview = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.getByTestId('markdown-preview')).toBeDefined();
    expect(screen.getByTestId('markdown-preview').textContent).toBe('# Hello World');
    expect(screen.queryByTestId('monaco-editor')).toBeNull();
  });

  it('TC-TE17: should be read-only in preview mode (no Monaco Editor)', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'docs/guide.md' };
    mockStoreState.content = '## Guide';
    mockStoreState.isMarkdownPreview = true;

    await renderAndWaitForEditor(<TextEditor />);

    expect(screen.queryByTestId('monaco-editor')).toBeNull();
    expect(screen.getByTestId('markdown-preview')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
    expect(screen.getByLabelText('Switch to edit mode')).toBeDefined();
  });

  it('TC-TE18: should restore editor focus when switching from preview to edit', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'README.md' };
    mockStoreState.content = '# Hello';
    mockStoreState.isMarkdownPreview = true;

    const { rerender } = await renderAndWaitForEditor(<TextEditor />);
    expect(screen.queryByTestId('monaco-editor')).toBeNull();

    // Switch to edit mode
    mockStoreState.isMarkdownPreview = false;
    await act(async () => {
      rerender(<TextEditor />);
    });

    await screen.findByTestId('monaco-editor');
    // Trigger onMount to set editorRef
    if (mockOnMount) {
      act(() => { mockOnMount!(); });
    }
    expect(mockEditorInstance.focus).toHaveBeenCalled();
  });

  it('TC-TE19: should pass language prop to Monaco Editor for .ts file', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/app.ts' };
    mockStoreState.content = 'const x = 1;';
    mockStoreState.language = 'typescript';

    await renderAndWaitForEditor(<TextEditor />);

    const editor = await screen.findByTestId('monaco-editor');
    expect(editor.getAttribute('data-language')).toBe('typescript');
  });

  it('TC-TE20: should pass plaintext language for files without extension', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'Dockerfile' };
    mockStoreState.content = 'FROM node:22';
    mockStoreState.language = 'plaintext';

    await renderAndWaitForEditor(<TextEditor />);

    const editor = await screen.findByTestId('monaco-editor');
    expect(editor.getAttribute('data-language')).toBe('plaintext');
  });

  it('TC-TE21: should render Monaco Editor within Suspense', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'code';

    await renderAndWaitForEditor(<TextEditor />);

    expect(await screen.findByTestId('monaco-editor')).toBeDefined();
  });

  it('TC-TE22: should call setContent via Monaco onChange', async () => {
    mockStoreState.openFile = { projectSlug: 'test', path: 'src/index.ts' };
    mockStoreState.content = 'original';

    await renderAndWaitForEditor(<TextEditor />);

    const textarea = await screen.findByTestId('monaco-textarea');
    fireEvent.change(textarea, { target: { value: 'new content' } });
    expect(mockSetContent).toHaveBeenCalledWith('new content');
  });
});
