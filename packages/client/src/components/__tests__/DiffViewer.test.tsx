/**
 * DiffViewer Component Tests
 * Story 6.1: Diff Viewer Component
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DiffEditor as MockDiffEditor } from '@monaco-editor/react';
import { DiffViewer, getLanguageFromPath } from '../DiffViewer';

// Store onMount callback for manual triggering in tests
let mockOnMount: (() => void) | null = null;

// Mock editor instance for Story 6.4 navigation tests
const mockRevealLineInCenter = vi.fn();
const mockGetLineChanges = vi.fn<() => unknown[] | null>().mockReturnValue(null);
const mockDispose = vi.fn();
const mockOnDidUpdateDiff = vi.fn((callback: () => void) => {
  callback();
  return { dispose: mockDispose };
});

const mockEditorInstance = {
  getLineChanges: mockGetLineChanges,
  getModifiedEditor: () => ({
    revealLineInCenter: mockRevealLineInCenter,
  }),
  onDidUpdateDiff: mockOnDidUpdateDiff,
};

// Mock @monaco-editor/react
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: vi.fn(({ original, modified, onMount }) => {
    // Store the callback for manual triggering — passes editor instance
    mockOnMount = () => onMount?.(mockEditorInstance, {});
    return (
      <div data-testid="mock-diff-editor">
        <div data-testid="original-content">{original}</div>
        <div data-testid="modified-content">{modified}</div>
      </div>
    );
  }),
}));

// Helper to trigger Monaco mount
function triggerMonacoMount() {
  if (mockOnMount) {
    mockOnMount();
  }
}

// Mock useTheme hook (dynamic via mockTheme variable)
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
    mockOnMount = null;
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockSetLayout.mockReset();
    mockResetToAuto.mockReset();
    mockGetLineChanges.mockReturnValue(null);
    mockRevealLineInCenter.mockReset();
    mockDispose.mockReset();
  });

  describe('Basic Rendering', () => {
    it('renders with file path in header', () => {
      render(<DiffViewer {...defaultProps} />);
      expect(screen.getByText('packages/client/src/Example.tsx')).toBeInTheDocument();
    });

    it('renders DiffEditor with original and modified content', () => {
      render(<DiffViewer {...defaultProps} />);
      expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
      expect(screen.getByTestId('original-content')).toHaveTextContent('const a = 1;');
      expect(screen.getByTestId('modified-content')).toHaveTextContent('const a = 2;');
    });
  });

  describe('Layout Modes', () => {
    it('renders in inline mode when layout prop is inline', () => {
      render(<DiffViewer {...defaultProps} layout="inline" />);
      expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
    });

    it('renders in side-by-side mode by default', () => {
      render(<DiffViewer {...defaultProps} />);
      expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
    });
  });

  describe('Fullscreen Mode', () => {
    it('shows close button in fullscreen mode', () => {
      render(<DiffViewer {...defaultProps} fullscreen onClose={() => {}} />);
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('does not show close button when not in fullscreen mode', () => {
      render(<DiffViewer {...defaultProps} onClose={() => {}} />);
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(<DiffViewer {...defaultProps} fullscreen onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose on Escape key in fullscreen mode', () => {
      const onClose = vi.fn();
      render(<DiffViewer {...defaultProps} fullscreen onClose={onClose} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on Escape key when not in fullscreen mode', () => {
      const onClose = vi.fn();
      render(<DiffViewer {...defaultProps} onClose={onClose} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows overlay in fullscreen mode', () => {
      const onClose = vi.fn();
      render(<DiffViewer {...defaultProps} fullscreen onClose={onClose} />);
      // Overlay has bg-black/50 class and is clickable
      const overlay = document.querySelector('.bg-black\\/50');
      expect(overlay).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      render(<DiffViewer {...defaultProps} />);
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('hides loading spinner after Monaco mounts', async () => {
      render(<DiffViewer {...defaultProps} />);

      // Initially shows loading
      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      // Trigger onMount callback
      await act(async () => {
        triggerMonacoMount();
      });

      // Loading should be hidden
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message and retry button on Monaco load failure', () => {
      render(<DiffViewer {...defaultProps} _testForceError />);
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('retry button calls the retry handler', async () => {
      const { rerender } = render(<DiffViewer {...defaultProps} _testForceError />);
      expect(screen.getByText(/failed/i)).toBeInTheDocument();

      const retryButton = screen.getByRole('button', { name: /retry/i });

      // Click retry - this sets isLoading: true, error: null
      await act(async () => {
        fireEvent.click(retryButton);
      });

      // Re-render without _testForceError to verify retry works
      rerender(<DiffViewer {...defaultProps} />);

      // After retry without force error, should show loading state
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has correct aria-label for container', () => {
      render(<DiffViewer {...defaultProps} />);
      expect(screen.getByRole('region')).toHaveAttribute(
        'aria-label',
        `Diff viewer for ${defaultProps.filePath}`
      );
    });

    it('close button has accessible label in fullscreen mode', () => {
      render(<DiffViewer {...defaultProps} fullscreen onClose={() => {}} />);
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close diff viewer');
    });

    it('retry button has accessible label in error state', () => {
      render(<DiffViewer {...defaultProps} _testForceError />);
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toHaveAttribute('aria-label', 'Retry loading diff viewer');
    });

    it('Monaco editor container has tabIndex -1 to prevent tab focus', () => {
      render(<DiffViewer {...defaultProps} />);
      const editorContainer = screen.getByTestId('mock-diff-editor').parentElement;
      expect(editorContainer).toHaveAttribute('tabIndex', '-1');
    });

    it('header has correct role and aria-level', () => {
      render(<DiffViewer {...defaultProps} />);
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
  });

  it('renders layout toggle button in header', () => {
    render(<DiffViewer {...defaultProps} />);
    const toggleButton = screen.getByRole('button', { name: /switch to inline layout/i });
    expect(toggleButton).toBeInTheDocument();
  });

  it('toggles layout from side-by-side to inline on click', () => {
    render(<DiffViewer {...defaultProps} />);
    const toggleButton = screen.getByRole('button', { name: /switch to inline layout/i });
    fireEvent.click(toggleButton);
    expect(mockSetLayout).toHaveBeenCalledWith('inline');
  });

  it('toggles layout from inline to side-by-side on click', () => {
    mockDiffLayout = 'inline';

    render(<DiffViewer {...defaultProps} />);
    const toggleButton = screen.getByRole('button', { name: /switch to side-by-side layout/i });
    fireEvent.click(toggleButton);
    expect(mockSetLayout).toHaveBeenCalledWith('side-by-side');
  });

  it('dynamically changes aria-label based on current layout', () => {
    // Side-by-side mode
    render(<DiffViewer {...defaultProps} />);
    expect(screen.getByRole('button', { name: /switch to inline layout/i })).toBeInTheDocument();
  });

  it('does not render toggle button when responsiveLayout={false}', () => {
    render(<DiffViewer {...defaultProps} responsiveLayout={false} />);
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument();
  });

  it('uses layout prop directly when responsiveLayout={false}', () => {
    render(<DiffViewer {...defaultProps} responsiveLayout={false} layout="inline" />);
    // No toggle button should exist
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument();
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

  // Story 6.3: AC2 missing language tests
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

describe('DiffViewer - Syntax Highlighting (Story 6.3)', () => {
  const defaultProps = {
    filePath: 'packages/client/src/Example.tsx',
    original: 'const a = 1;',
    modified: 'const a = 2;',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMount = null;
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockSetLayout.mockReset();
    mockResetToAuto.mockReset();
  });

  // DiffEditor language prop tests
  it('passes correct language prop to DiffEditor for TypeScript files', () => {
    render(<DiffViewer {...defaultProps} filePath="Component.tsx" original="a" modified="b" />);
    expect(vi.mocked(MockDiffEditor)).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'typescript' }),
      expect.anything()
    );
  });

  it('passes correct language prop to DiffEditor for Python files', () => {
    render(<DiffViewer {...defaultProps} filePath="script.py" original="a" modified="b" />);
    expect(vi.mocked(MockDiffEditor)).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'python' }),
      expect.anything()
    );
  });

  it('passes plaintext language for unknown file extensions', () => {
    render(<DiffViewer {...defaultProps} filePath="data.xyz" original="a" modified="b" />);
    expect(vi.mocked(MockDiffEditor)).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'plaintext' }),
      expect.anything()
    );
  });

  // Theme prop tests
  it('passes vs-dark theme to DiffEditor in dark mode', () => {
    mockTheme = 'dark';
    render(<DiffViewer {...defaultProps} />);
    expect(vi.mocked(MockDiffEditor)).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'vs-dark' }),
      expect.anything()
    );
  });

  it('passes vs theme to DiffEditor in light mode', () => {
    mockTheme = 'light';
    render(<DiffViewer {...defaultProps} />);
    expect(vi.mocked(MockDiffEditor)).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'vs' }),
      expect.anything()
    );
  });
});

describe('DiffViewer - Diff Navigation (Story 6.4)', () => {
  const defaultProps = {
    filePath: 'packages/client/src/Example.tsx',
    original: 'const a = 1;',
    modified: 'const a = 2;',
  };

  const mockChanges = [
    { originalStartLineNumber: 1, originalEndLineNumber: 3, modifiedStartLineNumber: 1, modifiedEndLineNumber: 5 },
    { originalStartLineNumber: 10, originalEndLineNumber: 12, modifiedStartLineNumber: 13, modifiedEndLineNumber: 13 },
    { originalStartLineNumber: 20, originalEndLineNumber: 20, modifiedStartLineNumber: 21, modifiedEndLineNumber: 25 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMount = null;
    mockTheme = 'dark';
    mockDiffLayout = 'side-by-side';
    mockSetLayout.mockReset();
    mockResetToAuto.mockReset();
    mockGetLineChanges.mockReturnValue(mockChanges);
    mockRevealLineInCenter.mockReset();
    mockDispose.mockReset();
  });

  function renderAndMount(props = {}) {
    const result = render(<DiffViewer {...defaultProps} {...props} />);
    act(() => {
      triggerMonacoMount();
    });
    return result;
  }

  it('renders navigation buttons in header', () => {
    renderAndMount();
    expect(screen.getByRole('button', { name: 'Go to previous change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next change' })).toBeInTheDocument();
  });

  it('displays change summary with added and removed line counts', () => {
    renderAndMount();
    // mockChanges: added = (5-1+1) + (13-13+1) + (25-21+1) = 5+1+5 = 11
    // mockChanges: removed = (3-1+1) + (12-10+1) + (20-20+1) = 3+3+1 = 7
    const summary = screen.getByTestId('change-summary');
    expect(summary).toHaveTextContent('+11');
    expect(summary).toHaveTextContent('-7');
  });

  it('displays initial position indicator as dash', () => {
    renderAndMount();
    const indicator = screen.getByTestId('position-indicator');
    expect(indicator).toHaveTextContent('\u2014/3');
  });

  it('navigates to next change on next button click', () => {
    renderAndMount();
    const nextBtn = screen.getByRole('button', { name: 'Go to next change' });

    act(() => {
      fireEvent.click(nextBtn);
    });

    expect(mockRevealLineInCenter).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('position-indicator')).toHaveTextContent('1/3');
  });

  it('navigates to previous change on previous button click', () => {
    renderAndMount();
    const nextBtn = screen.getByRole('button', { name: 'Go to next change' });
    const prevBtn = screen.getByRole('button', { name: 'Go to previous change' });

    // First go to change 0, then 1
    act(() => { fireEvent.click(nextBtn); });
    act(() => { fireEvent.click(nextBtn); });
    // Now at index 1, go previous to index 0
    act(() => { fireEvent.click(prevBtn); });

    expect(screen.getByTestId('position-indicator')).toHaveTextContent('1/3');
  });

  it('navigates to first change on next button when at initial state', () => {
    renderAndMount();
    const nextBtn = screen.getByRole('button', { name: 'Go to next change' });

    act(() => {
      fireEvent.click(nextBtn);
    });

    // From initial state (-1), next should go to index 0
    expect(mockRevealLineInCenter).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('position-indicator')).toHaveTextContent('1/3');
  });

  it('navigates to last change on previous button when at initial state', () => {
    renderAndMount();
    const prevBtn = screen.getByRole('button', { name: 'Go to previous change' });

    act(() => {
      fireEvent.click(prevBtn);
    });

    // From initial state (-1), previous should go to last change (index 2)
    expect(mockRevealLineInCenter).toHaveBeenCalledWith(21);
    expect(screen.getByTestId('position-indicator')).toHaveTextContent('3/3');
  });

  it('wraps around from last to first change', () => {
    renderAndMount();
    const nextBtn = screen.getByRole('button', { name: 'Go to next change' });

    // Navigate to index 0, 1, 2, then wrap to 0
    act(() => { fireEvent.click(nextBtn); });
    act(() => { fireEvent.click(nextBtn); });
    act(() => { fireEvent.click(nextBtn); });
    act(() => { fireEvent.click(nextBtn); }); // wraps to 0

    expect(screen.getByTestId('position-indicator')).toHaveTextContent('1/3');
  });

  it('disables navigation buttons when no changes exist', () => {
    mockGetLineChanges.mockReturnValue([]);
    renderAndMount();

    const prevBtn = screen.getByRole('button', { name: 'Go to previous change' });
    const nextBtn = screen.getByRole('button', { name: 'Go to next change' });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });

  it('navigates to next change on F7 key press', () => {
    renderAndMount();

    act(() => {
      fireEvent.keyDown(document, { key: 'F7' });
    });

    expect(mockRevealLineInCenter).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('position-indicator')).toHaveTextContent('1/3');
  });

  it('navigates to previous change on Shift+F7 key press', () => {
    renderAndMount();

    act(() => {
      fireEvent.keyDown(document, { key: 'F7', shiftKey: true });
    });

    // From initial state, Shift+F7 goes to last change
    expect(mockRevealLineInCenter).toHaveBeenCalledWith(21);
    expect(screen.getByTestId('position-indicator')).toHaveTextContent('3/3');
  });

  it('passes hideUnchangedRegions option to DiffEditor', () => {
    renderAndMount();
    expect(vi.mocked(MockDiffEditor)).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          hideUnchangedRegions: { enabled: true },
        }),
      }),
      expect.anything()
    );
  });

  it('has correct aria-labels on navigation buttons', () => {
    renderAndMount();
    expect(screen.getByRole('button', { name: 'Go to previous change' })).toHaveAttribute('aria-label', 'Go to previous change');
    expect(screen.getByRole('button', { name: 'Go to next change' })).toHaveAttribute('aria-label', 'Go to next change');
  });

  it('position indicator has aria-live attribute', () => {
    renderAndMount();
    const indicator = screen.getByTestId('position-indicator');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });
});
