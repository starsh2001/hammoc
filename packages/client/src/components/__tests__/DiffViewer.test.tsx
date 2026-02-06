/**
 * DiffViewer Component Tests
 * Story 6.1: Diff Viewer Component
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiffViewer, getLanguageFromPath } from '../DiffViewer';

// Store onMount callback for manual triggering in tests
let mockOnMount: (() => void) | null = null;

// Mock @monaco-editor/react
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: vi.fn(({ original, modified, onMount }) => {
    // Store the callback for manual triggering
    mockOnMount = onMount;
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

// Mock useTheme hook
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
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
    mockDiffLayout = 'side-by-side';
    mockSetLayout.mockReset();
    mockResetToAuto.mockReset();
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
});
