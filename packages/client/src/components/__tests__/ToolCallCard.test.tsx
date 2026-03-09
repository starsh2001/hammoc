/**
 * ToolCallCard Tests
 * [Source: Story 3.5 - Task 6]
 *
 * The component now:
 * - Shows tool_use with compact card (tool name, checkmark, and path display)
 * - Shows tool_result only for errors (success results are not rendered)
 * - Edit/Write tools show line changes and Diff button (same card format)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCallCard } from '../ToolCallCard';
import type { HistoryMessage } from '@hammoc/shared';

// Mock DiffViewer
vi.mock('../DiffViewer', () => ({
  DiffViewer: vi.fn(({ filePath, onClose }: { filePath: string; onClose?: () => void }) => (
    <div data-testid="mock-diff-viewer">
      <span>DiffViewer: {filePath}</span>
      <button onClick={onClose}>Close</button>
    </div>
  )),
}));

// Mock ToolResultRenderer
vi.mock('../ToolResultRenderer', () => ({
  ToolResultRenderer: vi.fn(({ toolName, result }: { toolName: string; result?: string }) => (
    result ? <div data-testid="mock-tool-result-renderer">{toolName}: {result}</div> : null
  )),
}));

describe('ToolCallCard', () => {
  const toolUseMessage: HistoryMessage = {
    id: 'msg-1',
    type: 'tool_use',
    content: 'Calling Read',
    timestamp: '2026-01-15T10:00:00Z',
    toolName: 'Read',
    toolInput: { file_path: '/src/index.ts' },
  };

  const toolResultSuccess: HistoryMessage = {
    id: 'msg-2',
    type: 'tool_result',
    content: 'file content here',
    timestamp: '2026-01-15T10:00:01Z',
    toolResult: {
      success: true,
      output: 'export const app = express();',
    },
  };

  const toolResultError: HistoryMessage = {
    id: 'msg-3',
    type: 'tool_result',
    content: 'File not found',
    timestamp: '2026-01-15T10:00:01Z',
    toolResult: {
      success: false,
      error: 'ENOENT: no such file or directory',
    },
  };

  it('should render tool_use with tool name', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('should render tool_use with file path from toolInput', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    // ToolPathDisplay shows the file path
    expect(screen.getByText(/index\.ts/)).toBeInTheDocument();
  });

  it('should not render successful Edit tool_result (already shown via tool_use)', () => {
    const editToolResult: HistoryMessage = {
      ...toolResultSuccess,
      toolName: 'Edit',
    };
    const { container } = render(<ToolCallCard message={editToolResult} />);

    // Edit success results return null
    expect(container.firstChild).toBeNull();
  });

  it('should not render successful Read tool_result (already shown via tool_use)', () => {
    const readToolResult: HistoryMessage = {
      ...toolResultSuccess,
      toolName: 'Read',
      toolInput: { file_path: '/src/index.ts' },
    };
    const { container } = render(<ToolCallCard message={readToolResult} />);

    // Read success results return null (skipped like Edit/Write)
    expect(container.firstChild).toBeNull();
  });

  it('should render failed tool_result with error', () => {
    render(<ToolCallCard message={toolResultError} />);

    expect(screen.getByText(/ENOENT/)).toBeInTheDocument();
  });

  it('should have correct aria label for tool_use', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      '도구 완료: Read'
    );
  });

  it('should have correct aria label for failed tool_result', () => {
    render(<ToolCallCard message={toolResultError} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      '도구 결과: 실패'
    );
  });

  it('should display Wrench icon for tool_use', () => {
    const { container } = render(<ToolCallCard message={toolUseMessage} />);

    // Lucide icons render as SVG
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('should display CheckCircle icon for tool_use (completed state)', () => {
    const { container } = render(<ToolCallCard message={toolUseMessage} />);

    // tool_use shows Wrench, CheckCircle, and possibly icons from ToolPathDisplay
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2); // At least Wrench + CheckCircle
  });

  it('should display XCircle icon for failed result', () => {
    const { container } = render(<ToolCallCard message={toolResultError} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should show failure message for failed tool_result', () => {
    render(<ToolCallCard message={toolResultError} />);

    expect(screen.getByText('도구 실패')).toBeInTheDocument();
  });

  it('should truncate long error messages', () => {
    const longError = 'a'.repeat(600);
    const message: HistoryMessage = {
      ...toolResultError,
      toolResult: {
        success: false,
        error: longError,
      },
    };

    render(<ToolCallCard message={message} />);

    // Error is sliced to 500 characters
    const errorText = screen.getByText((_, element) => {
      return element?.textContent?.length === 500;
    });
    expect(errorText).toBeInTheDocument();
  });

  it('should render TodoWrite with todo items', () => {
    const todoMessage: HistoryMessage = {
      id: 'msg-todo',
      type: 'tool_use',
      content: 'Updating todos',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'TodoWrite',
      toolInput: {
        todos: [
          { content: 'Task 1', status: 'completed' },
          { content: 'Task 2', status: 'in_progress' },
          { content: 'Task 3', status: 'pending' },
        ],
      },
    };

    render(<ToolCallCard message={todoMessage} />);

    expect(screen.getByText('Update Todos')).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
  });

  // Edit/Write tool tests - collapsible path with Diff button
  it('renders Edit tool with collapsed filename and line changes', () => {
    const editMessage: HistoryMessage = {
      id: 'msg-edit',
      type: 'tool_use',
      content: 'Editing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Edit',
      toolInput: { file_path: '/src/app.ts', old_string: 'line1\nline2', new_string: 'line1\nline2\nline3' },
    };

    render(<ToolCallCard message={editMessage} />);

    // Same card format with tool name
    expect(screen.getByText('Edit')).toBeInTheDocument();
    // Collapsed: shows filename only
    expect(screen.getByText('app.ts')).toBeInTheDocument();
    // Line changes displayed
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    // Diff button always visible alongside collapsed filename
    expect(screen.getByRole('button', { name: 'Diff 보기' })).toBeInTheDocument();
  });

  it('expands to show full path and Diff button', () => {
    const editMessage: HistoryMessage = {
      id: 'msg-edit',
      type: 'tool_use',
      content: 'Editing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Edit',
      toolInput: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
    };

    render(<ToolCallCard message={editMessage} />);

    // Click to expand
    fireEvent.click(screen.getByRole('button', { name: '전체 경로 보기' }));

    // Full path shown
    expect(screen.getByText('/src/app.ts')).toBeInTheDocument();
    // Diff button now visible
    expect(screen.getByRole('button', { name: 'Diff 보기' })).toBeInTheDocument();
  });

  it('renders Write tool with line changes', () => {
    const writeMessage: HistoryMessage = {
      id: 'msg-write',
      type: 'tool_use',
      content: 'Writing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Write',
      toolInput: { file_path: '/src/new.ts', content: 'line1\nline2\nline3' },
    };

    render(<ToolCallCard message={writeMessage} />);

    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.getByText('new.ts')).toBeInTheDocument();
    // Write: original is empty, so -0
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('-0')).toBeInTheDocument();
  });

  it('opens DiffViewer when Diff button is clicked after expanding', () => {
    const editMessage: HistoryMessage = {
      id: 'msg-edit',
      type: 'tool_use',
      content: 'Editing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Edit',
      toolInput: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
    };

    render(<ToolCallCard message={editMessage} />);

    // DiffViewer not shown initially
    expect(screen.queryByTestId('mock-diff-viewer')).not.toBeInTheDocument();

    // Expand first
    fireEvent.click(screen.getByRole('button', { name: '전체 경로 보기' }));

    // Click Diff button
    fireEvent.click(screen.getByRole('button', { name: 'Diff 보기' }));

    // DiffViewer shown
    expect(screen.getByTestId('mock-diff-viewer')).toBeInTheDocument();
    expect(screen.getByText('DiffViewer: /src/app.ts')).toBeInTheDocument();
  });

  it('closes DiffViewer when close button is clicked', () => {
    const editMessage: HistoryMessage = {
      id: 'msg-edit',
      type: 'tool_use',
      content: 'Editing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Edit',
      toolInput: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
    };

    render(<ToolCallCard message={editMessage} />);

    // Expand and open DiffViewer
    fireEvent.click(screen.getByRole('button', { name: '전체 경로 보기' }));
    fireEvent.click(screen.getByRole('button', { name: 'Diff 보기' }));
    expect(screen.getByTestId('mock-diff-viewer')).toBeInTheDocument();

    // Close DiffViewer
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('mock-diff-viewer')).not.toBeInTheDocument();
  });

  it('renders default card for non-Edit/Write tool_use', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    expect(screen.queryByRole('button', { name: 'Diff 보기' })).not.toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  // Story 7.2 - tool icon and expand/collapse tests
  describe('tool detail expand/collapse (Story 7.2)', () => {
    it('shows path display for Read tool via ToolPathDisplay', () => {
      const readMessage: HistoryMessage = {
        id: 'msg-read',
        type: 'tool_use',
        content: 'Reading file',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Read',
        toolInput: { file_path: '/src/app.ts', limit: 100 },
      };

      render(<ToolCallCard message={readMessage} />);

      // Shows collapsed filename via ToolPathDisplay
      expect(screen.getByText('app.ts')).toBeInTheDocument();

      // Expand to see full path
      const toggle = screen.getByRole('button', { name: '전체 내용 보기' });
      fireEvent.click(toggle);
      expect(screen.getByText('/src/app.ts')).toBeInTheDocument();
    });

    it('shows expand toggle for Grep tool with extra params', () => {
      const grepMessage: HistoryMessage = {
        id: 'msg-grep',
        type: 'tool_use',
        content: 'Searching',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Grep',
        toolInput: { pattern: 'import.*from', path: '/src' },
      };

      render(<ToolCallCard message={grepMessage} />);

      // Shows pattern as primary display info
      expect(screen.getByText('import.*from')).toBeInTheDocument();

      // Expand to see extra params (path)
      const toggle = screen.getByRole('button', { name: '전체 내용 보기' });
      fireEvent.click(toggle);
      expect(screen.getByText(/path/)).toBeInTheDocument();
      expect(screen.getByText('/src')).toBeInTheDocument();
    });

    it('does not show detail toggle for Bash tool (shows full command)', () => {
      const bashMessage: HistoryMessage = {
        id: 'msg-bash',
        type: 'tool_use',
        content: 'Running command',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
      };

      render(<ToolCallCard message={bashMessage} />);

      // Bash shows command text directly via ToolPathDisplay
      expect(screen.getByText('npm test')).toBeInTheDocument();
    });

    it('does not show detail toggle for Edit tool (uses own collapse)', () => {
      const editMessage: HistoryMessage = {
        id: 'msg-edit',
        type: 'tool_use',
        content: 'Editing',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Edit',
        toolInput: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
      };

      render(<ToolCallCard message={editMessage} />);

      // Edit has its own collapse button for path
      expect(screen.getByRole('button', { name: '전체 경로 보기' })).toBeInTheDocument();
    });
  });

  // Story 7.3 - tool_result rendering integration
  describe('tool_result rendering (Story 7.3)', () => {
    it('skips result rendering for Read tool_result (success)', () => {
      const readResult: HistoryMessage = {
        id: 'msg-read-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Read',
        toolInput: { file_path: '/src/index.ts' },
        toolResult: { success: true, output: 'const x = 1;' },
      };

      const { container } = render(<ToolCallCard message={readResult} />);

      // Read success results return null (already shown via tool_use card)
      expect(container.firstChild).toBeNull();
    });

    it('renders ToolResultRenderer for Bash tool_result', () => {
      const bashResult: HistoryMessage = {
        id: 'msg-bash-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        toolResult: { success: true, output: 'All tests passed' },
      };

      render(<ToolCallCard message={bashResult} />);

      expect(screen.getByTestId('mock-tool-result-renderer')).toBeInTheDocument();
    });

    it('renders ToolResultRenderer for Glob tool_result', () => {
      const globResult: HistoryMessage = {
        id: 'msg-glob-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Glob',
        toolResult: { success: true, output: 'file1.ts\nfile2.ts' },
      };

      render(<ToolCallCard message={globResult} />);

      expect(screen.getByTestId('mock-tool-result-renderer')).toBeInTheDocument();
    });

    it('renders ToolResultRenderer for Grep tool_result', () => {
      const grepResult: HistoryMessage = {
        id: 'msg-grep-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Grep',
        toolResult: { success: true, output: 'src/app.ts:1:import' },
      };

      render(<ToolCallCard message={grepResult} />);

      expect(screen.getByTestId('mock-tool-result-renderer')).toBeInTheDocument();
    });

    it('skips result rendering for Edit tool_result (success)', () => {
      const editResult: HistoryMessage = {
        id: 'msg-edit-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Edit',
        toolResult: { success: true, output: 'File edited' },
      };

      const { container } = render(<ToolCallCard message={editResult} />);

      expect(container.firstChild).toBeNull();
    });

    it('skips result rendering for Write tool_result (success)', () => {
      const writeResult: HistoryMessage = {
        id: 'msg-write-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Write',
        toolResult: { success: true, output: 'File written' },
      };

      const { container } = render(<ToolCallCard message={writeResult} />);

      expect(container.firstChild).toBeNull();
    });

    it('skips result rendering for TodoWrite tool_result (success)', () => {
      const todoResult: HistoryMessage = {
        id: 'msg-todo-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'TodoWrite',
        toolResult: { success: true, output: 'Todos updated' },
      };

      const { container } = render(<ToolCallCard message={todoResult} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders Bash tool_use with description collapsed, expands to show command and collapsible output', () => {
      const bashUse: HistoryMessage = {
        id: 'msg-bash-use',
        type: 'tool_use',
        content: 'Running command',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Bash',
        toolInput: { command: 'npm test', description: 'Run tests' },
      };

      render(<ToolCallCard message={bashUse} resultOutput="All tests passed" />);

      // Collapsed: shows description
      expect(screen.getByText('Bash')).toBeInTheDocument();
      expect(screen.getByText('Run tests')).toBeInTheDocument();

      // Expand ToolPathDisplay to see command (IN)
      const toggle = screen.getByRole('button', { name: '전체 내용 보기' });
      fireEvent.click(toggle);
      expect(screen.getByText(/IN/)).toBeInTheDocument();
      expect(screen.getByText('npm test')).toBeInTheDocument();

      // Output is in collapsible "결과 보기" section
      const resultToggle = screen.getByRole('button', { name: /결과 보기/ });
      expect(resultToggle).toBeInTheDocument();
      fireEvent.click(resultToggle);
      expect(screen.getByText(/All tests passed/)).toBeInTheDocument();
    });

    it('does not show output when Bash tool_use has no resultOutput', () => {
      const bashUse: HistoryMessage = {
        id: 'msg-bash-use',
        type: 'tool_use',
        content: 'Running command',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
      };

      render(<ToolCallCard message={bashUse} />);

      // Shows command directly (no description, so command is primary)
      expect(screen.getByText('Bash')).toBeInTheDocument();
      expect(screen.getByText('npm test')).toBeInTheDocument();
    });

    it('still shows error for failed tool_result (existing behavior)', () => {
      const errorResult: HistoryMessage = {
        id: 'msg-error-result',
        type: 'tool_result',
        content: '',
        timestamp: '2026-01-15T10:00:01Z',
        toolName: 'Read',
        toolResult: { success: false, error: 'File not found' },
      };

      render(<ToolCallCard message={errorResult} />);

      expect(screen.getByText(/File not found/)).toBeInTheDocument();
      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });
  });
});
