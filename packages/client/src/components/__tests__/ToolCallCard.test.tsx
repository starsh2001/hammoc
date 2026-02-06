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
import type { HistoryMessage } from '@bmad-studio/shared';

// Mock DiffViewer
vi.mock('../DiffViewer', () => ({
  DiffViewer: vi.fn(({ filePath, onClose }: { filePath: string; onClose?: () => void }) => (
    <div data-testid="mock-diff-viewer">
      <span>DiffViewer: {filePath}</span>
      <button onClick={onClose}>Close</button>
    </div>
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

  it('should not render successful tool_result (implicit in tool_use)', () => {
    const { container } = render(<ToolCallCard message={toolResultSuccess} />);

    // Success results return null, so container should be empty
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
    it('shows expand toggle for Read tool with detail params', () => {
      const readMessage: HistoryMessage = {
        id: 'msg-read',
        type: 'tool_use',
        content: 'Reading file',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Read',
        toolInput: { file_path: '/src/app.ts', limit: 100 },
      };

      render(<ToolCallCard message={readMessage} />);

      const toggle = screen.getByRole('button', { name: '도구 상세 정보 펼치기' });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      // Expand
      fireEvent.click(toggle);
      expect(screen.getByText(/file_path/)).toBeInTheDocument();
      expect(screen.getByText(/\/src\/app\.ts/)).toBeInTheDocument();
      expect(screen.getByText(/limit/)).toBeInTheDocument();

      // aria-expanded is true
      expect(screen.getByRole('button', { name: '도구 상세 정보 접기' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows expand toggle for Grep tool', () => {
      const grepMessage: HistoryMessage = {
        id: 'msg-grep',
        type: 'tool_use',
        content: 'Searching',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Grep',
        toolInput: { pattern: 'import.*from', path: '/src' },
      };

      render(<ToolCallCard message={grepMessage} />);

      const toggle = screen.getByRole('button', { name: '도구 상세 정보 펼치기' });
      expect(toggle).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.getByText(/pattern/)).toBeInTheDocument();
      expect(screen.getByText(/import\.\*from/)).toBeInTheDocument();
    });

    it('does not show expand toggle for Bash tool', () => {
      const bashMessage: HistoryMessage = {
        id: 'msg-bash',
        type: 'tool_use',
        content: 'Running command',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
      };

      render(<ToolCallCard message={bashMessage} />);

      expect(screen.queryByRole('button', { name: '도구 상세 정보 펼치기' })).not.toBeInTheDocument();
    });

    it('does not show expand toggle for Edit tool (uses own collapse)', () => {
      const editMessage: HistoryMessage = {
        id: 'msg-edit',
        type: 'tool_use',
        content: 'Editing',
        timestamp: '2026-01-15T10:00:00Z',
        toolName: 'Edit',
        toolInput: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
      };

      render(<ToolCallCard message={editMessage} />);

      // Edit has its own collapse button, not the generic one
      expect(screen.queryByRole('button', { name: '도구 상세 정보 펼치기' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '전체 경로 보기' })).toBeInTheDocument();
    });
  });
});
