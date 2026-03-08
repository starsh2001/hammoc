/**
 * DiffViewer Component Tests
 * Story 6.1: Diff Viewer Component
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DiffViewer } from '../DiffViewer';
import { getLanguageFromPath } from '../../utils/languageDetect';

// Mock MergeView and unifiedMergeView from @codemirror/merge
const mockMergeViewDestroy = vi.fn();
const mockBDispatch = vi.fn();
const mockBFocus = vi.fn();

let mockChunks: Array<{ fromA: number; toA: number; endA: number; fromB: number; toB: number; endB: number }> = [];

const mockMergeViewInstance = {
  destroy: mockMergeViewDestroy,
  dom: document.createElement('div'),
  chunks: mockChunks,
  a: {
    state: { doc: { lineAt: vi.fn((pos: number) => ({ number: pos + 1 })), length: 100 } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  },
  b: {
    state: { doc: { lineAt: vi.fn((pos: number) => ({ number: pos + 1 })), length: 100 } },
    dispatch: mockBDispatch,
    focus: mockBFocus,
  },
};

// Mock EditorView instance for inline (unified) mode
const mockEditorViewDestroy = vi.fn();
const mockEditorViewDispatch = vi.fn();
const mockEditorViewFocus = vi.fn();
const mockEditorViewInstance = {
  destroy: mockEditorViewDestroy,
  dispatch: mockEditorViewDispatch,
  focus: mockEditorViewFocus,
  state: { doc: { lineAt: vi.fn((pos: number) => ({ number: pos + 1 })), length: 100 } },
  dom: document.createElement('div'),
};

vi.mock('@codemirror/merge', () => ({
  MergeView: vi.fn().mockImplementation(({ parent }: { parent: HTMLElement }) => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'mock-merge-view');
    parent.appendChild(div);
    mockMergeViewInstance.dom = div;
    mockMergeViewInstance.chunks = mockChunks;
    return mockMergeViewInstance;
  }),
  unifiedMergeView: vi.fn(() => [{}]),
  getChunks: vi.fn(() => ({ chunks: mockChunks })),
}));

// Mock CodeMirror dependencies
vi.mock('@codemirror/view', () => {
  // EditorView needs to work both as a constructor (new EditorView({...})) and as a namespace with static props
  const EditorViewCtor = vi.fn().mockImplementation(({ parent }: { parent?: HTMLElement }) => {
    if (parent) {
      const div = document.createElement('div');
      div.setAttribute('data-testid', 'mock-unified-view');
      parent.appendChild(div);
      mockEditorViewInstance.dom = div;
    }
    return mockEditorViewInstance;
  });
  // Static properties
  Object.assign(EditorViewCtor, {
    lineWrapping: {},
    editable: { of: vi.fn(() => ({})) },
    scrollIntoView: vi.fn((pos: number) => ({ type: 'scrollIntoView', pos })),
    theme: vi.fn(() => ({})),
  });
  return { EditorView: EditorViewCtor };
});
vi.mock('@codemirror/state', () => ({
  EditorState: {
    readOnly: { of: vi.fn(() => ({})) },
  },
}));
vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: {},
}));
vi.mock('../../utils/languageDetect', async () => {
  const actual: Record<string, unknown> = {
    getLanguageExtension: vi.fn(() => null),
    isMarkdownPath: (path: string) => path.toLowerCase().endsWith('.md'),
    getLanguageFromPath: (filePath: string) => {
      const map: Record<string, string> = {
        '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript',
        '.json': 'json', '.md': 'markdown',
        '.html': 'html', '.css': 'css',
        '.py': 'python', '.go': 'go',
        '.rs': 'rust', '.java': 'java',
        '.c': 'c', '.cpp': 'cpp', '.h': 'c',
        '.yaml': 'yaml', '.yml': 'yaml',
      };
      const lastDotIndex = filePath.lastIndexOf('.');
      if (lastDotIndex === -1) return 'plaintext';
      const ext = filePath.slice(lastDotIndex);
      return map[ext] ?? 'plaintext';
    },
    EXTENSION_TO_LANGUAGE: {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.json': 'json', '.md': 'markdown',
      '.html': 'html', '.css': 'css',
      '.py': 'python', '.go': 'go',
      '.rs': 'rust', '.java': 'java',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c',
      '.yaml': 'yaml', '.yml': 'yaml',
    },
  };
  return actual;
});

// Mock useTheme hook
let mockTheme = 'dark';
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: mockTheme,
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

// Mock useDiffLayout hook
const mockSetLayout = vi.fn();
const mockResetToAuto = vi.fn();
let mockDiffLayout = 'side-by-side';

vi.mock('../../hooks/useDiffLayout', () => ({
  useDiffLayout: vi.fn(() => ({
    layout: mockDiffLayout,
    setLayout: mockSetLayout,
    isManualOverride: false,
    resetToAuto: mockResetToAuto,
  })),
}));

describe('DiffViewer', () => {
  const defaultProps = {
    filePath: 'packages/client/src/Example.tsx',
    original: 'const a = 1;',
    modified: 'const a = 2;',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockSetLayout.mockReset();
    mockResetToAuto.mockReset();
    mockChunks = [];
    mockMergeViewInstance.chunks = mockChunks;
  });

  describe('Basic Rendering', () => {
    it('renders with file path in header', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} />);
      });
      expect(screen.getByText('packages/client/src/Example.tsx')).toBeInTheDocument();
    });

    it('renders MergeView container', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} />);
      });
      expect(screen.getByTestId('mock-merge-view')).toBeInTheDocument();
    });
  });

  describe('Layout Modes', () => {
    it('renders in side-by-side mode by default', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} />);
      });
      expect(screen.getByTestId('mock-merge-view')).toBeInTheDocument();
    });
  });

  describe('Fullscreen Mode', () => {
    it('shows close button in fullscreen mode', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} fullscreen onClose={() => {}} />);
      });
      expect(screen.getByRole('button', { name: 'Diff 뷰어 닫기' })).toBeInTheDocument();
    });

    it('does not show close button when not in fullscreen mode', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} onClose={() => {}} />);
      });
      expect(screen.queryByRole('button', { name: 'Diff 뷰어 닫기' })).not.toBeInTheDocument();
    });

    it('calls onClose when close button clicked', async () => {
      const onClose = vi.fn();
      await act(async () => {
        render(<DiffViewer {...defaultProps} fullscreen onClose={onClose} />);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Diff 뷰어 닫기' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose on Escape key in fullscreen mode', async () => {
      const onClose = vi.fn();
      await act(async () => {
        render(<DiffViewer {...defaultProps} fullscreen onClose={onClose} />);
      });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on Escape key when not in fullscreen mode', async () => {
      const onClose = vi.fn();
      await act(async () => {
        render(<DiffViewer {...defaultProps} onClose={onClose} />);
      });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows overlay in fullscreen mode', async () => {
      const onClose = vi.fn();
      await act(async () => {
        render(<DiffViewer {...defaultProps} fullscreen onClose={onClose} />);
      });
      const overlay = document.querySelector('.bg-black\\/50');
      expect(overlay).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message and retry button on force error', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} _testForceError />);
      });
      expect(screen.getByText('Diff 뷰어를 로드하지 못했습니다.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Diff 뷰어 로드 재시도' })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has correct aria-label for container', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} />);
      });
      expect(screen.getByRole('region')).toHaveAttribute(
        'aria-label',
        `Diff viewer for ${defaultProps.filePath}`
      );
    });

    it('close button has accessible label in fullscreen mode', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} fullscreen onClose={() => {}} />);
      });
      const closeButton = screen.getByRole('button', { name: 'Diff 뷰어 닫기' });
      expect(closeButton).toHaveAttribute('aria-label', 'Diff 뷰어 닫기');
    });

    it('retry button has accessible label in error state', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} _testForceError />);
      });
      const retryButton = screen.getByRole('button', { name: 'Diff 뷰어 로드 재시도' });
      expect(retryButton).toHaveAttribute('aria-label', 'Diff 뷰어 로드 재시도');
    });

    it('header has correct role and aria-level', async () => {
      await act(async () => {
        render(<DiffViewer {...defaultProps} />);
      });
      const header = screen.getByRole('heading', { level: 3 });
      expect(header).toBeInTheDocument();
    });
  });
});

describe('DiffViewer - Layout Toggle (Story 6.2)', () => {
  const defaultProps = {
    filePath: 'packages/client/src/Example.tsx',
    original: 'const a = 1;',
    modified: 'const a = 2;',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockSetLayout.mockReset();
    mockResetToAuto.mockReset();
    mockChunks = [];
  });

  it('renders layout toggle button in header', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });
    const toggleButton = screen.getByRole('button', { name: '인라인 레이아웃으로 전환' });
    expect(toggleButton).toBeInTheDocument();
  });

  it('toggles layout from side-by-side to inline on click', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });
    const toggleButton = screen.getByRole('button', { name: '인라인 레이아웃으로 전환' });
    fireEvent.click(toggleButton);
    expect(mockSetLayout).toHaveBeenCalledWith('inline');
  });

  it('toggles layout from inline to side-by-side on click', async () => {
    mockDiffLayout = 'inline';
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });
    const toggleButton = screen.getByRole('button', { name: '나란히 레이아웃으로 전환' });
    fireEvent.click(toggleButton);
    expect(mockSetLayout).toHaveBeenCalledWith('side-by-side');
  });

  it('does not render toggle button when responsiveLayout={false}', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} responsiveLayout={false} />);
    });
    expect(screen.queryByRole('button', { name: /레이아웃으로 전환/ })).not.toBeInTheDocument();
  });
});

describe('getLanguageFromPath', () => {
  it('returns typescript for .ts files', () => {
    expect(getLanguageFromPath('src/index.ts')).toBe('typescript');
  });

  it('returns typescript for .tsx files', () => {
    expect(getLanguageFromPath('Component.tsx')).toBe('typescript');
  });

  it('returns javascript for .js files', () => {
    expect(getLanguageFromPath('script.js')).toBe('javascript');
  });

  it('returns javascript for .jsx files', () => {
    expect(getLanguageFromPath('Component.jsx')).toBe('javascript');
  });

  it('returns json for .json files', () => {
    expect(getLanguageFromPath('package.json')).toBe('json');
  });

  it('returns markdown for .md files', () => {
    expect(getLanguageFromPath('README.md')).toBe('markdown');
  });

  it('returns python for .py files', () => {
    expect(getLanguageFromPath('script.py')).toBe('python');
  });

  it('returns yaml for .yaml files', () => {
    expect(getLanguageFromPath('config.yaml')).toBe('yaml');
  });

  it('returns yaml for .yml files', () => {
    expect(getLanguageFromPath('config.yml')).toBe('yaml');
  });

  it('returns plaintext for unknown extensions', () => {
    expect(getLanguageFromPath('file.xyz')).toBe('plaintext');
  });

  it('returns plaintext for files without extension', () => {
    expect(getLanguageFromPath('Dockerfile')).toBe('plaintext');
  });

  it('returns plaintext for files with only a dot', () => {
    expect(getLanguageFromPath('.gitignore')).toBe('plaintext');
  });

  it('returns go for .go files', () => {
    expect(getLanguageFromPath('main.go')).toBe('go');
  });

  it('returns rust for .rs files', () => {
    expect(getLanguageFromPath('lib.rs')).toBe('rust');
  });

  it('returns java for .java files', () => {
    expect(getLanguageFromPath('Main.java')).toBe('java');
  });

  it('returns c for .c files', () => {
    expect(getLanguageFromPath('main.c')).toBe('c');
  });

  it('returns cpp for .cpp files', () => {
    expect(getLanguageFromPath('main.cpp')).toBe('cpp');
  });

  it('returns c for .h files', () => {
    expect(getLanguageFromPath('header.h')).toBe('c');
  });

  it('returns html for .html files', () => {
    expect(getLanguageFromPath('index.html')).toBe('html');
  });

  it('returns css for .css files', () => {
    expect(getLanguageFromPath('styles.css')).toBe('css');
  });
});

describe('DiffViewer - Navigation (Story 6.4)', () => {
  const defaultProps = {
    filePath: 'packages/client/src/Example.tsx',
    original: 'const a = 1;',
    modified: 'const a = 2;',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockChunks = [];
  });

  it('renders navigation buttons in header', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });
    expect(screen.getByRole('button', { name: '이전 변경으로 이동' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 변경으로 이동' })).toBeInTheDocument();
  });

  it('disables navigation buttons when no changes exist', async () => {
    mockChunks = [];
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });

    const prevBtn = screen.getByRole('button', { name: '이전 변경으로 이동' });
    const nextBtn = screen.getByRole('button', { name: '다음 변경으로 이동' });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });

  it('has correct aria-labels on navigation buttons', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });
    expect(screen.getByRole('button', { name: '이전 변경으로 이동' })).toHaveAttribute('aria-label', '이전 변경으로 이동');
    expect(screen.getByRole('button', { name: '다음 변경으로 이동' })).toHaveAttribute('aria-label', '다음 변경으로 이동');
  });

  it('position indicator has aria-live attribute', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} />);
    });
    const indicator = screen.getByTestId('position-indicator');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });
});

describe('DiffViewer Performance (Story 6.6)', () => {
  const defaultProps = {
    filePath: 'packages/client/src/Example.tsx',
    original: 'const a = 1;',
    modified: 'const a = 2;',
  };

  const largeText = Array(5001).fill('line').join('\n');
  const smallText = Array(4999).fill('line').join('\n');

  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockChunks = [];
  });

  it('shows large file warning for files over 5000 lines', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} modified={largeText} />);
    });
    expect(screen.getByText(/대용량 파일/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대용량 파일 Diff 전체 로드' })).toBeInTheDocument();
    expect(screen.queryByTestId('mock-merge-view')).not.toBeInTheDocument();
  });

  it('loads MergeView after clicking "전체 로드" button', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} modified={largeText} />);
    });
    expect(screen.queryByTestId('mock-merge-view')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '대용량 파일 Diff 전체 로드' }));
    });

    expect(screen.queryByText(/대용량 파일/)).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-merge-view')).toBeInTheDocument();
  });

  it('does not show large file warning for files under 5000 lines', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} modified={smallText} />);
    });
    expect(screen.queryByText(/대용량 파일/)).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-merge-view')).toBeInTheDocument();
  });

  it('shows file header even when large file warning is displayed', async () => {
    await act(async () => {
      render(<DiffViewer {...defaultProps} modified={largeText} />);
    });
    expect(screen.getByText(/대용량 파일/)).toBeInTheDocument();
    expect(screen.getByText(defaultProps.filePath)).toBeInTheDocument();
  });

  it('destroys MergeView on unmount', async () => {
    let unmount: () => void;
    await act(async () => {
      const result = render(<DiffViewer {...defaultProps} />);
      unmount = result.unmount;
    });
    expect(screen.getByTestId('mock-merge-view')).toBeInTheDocument();

    await act(async () => {
      unmount();
    });
    expect(mockMergeViewDestroy).toHaveBeenCalled();
  });
});
