/**
 * ToolCallCard Tests
 * [Source: Story 3.5 - Task 6]
 *
 * The component now:
 * - Shows tool_use with compact card (tool name, checkmark, and path display)
 * - Shows tool_result only for errors (success results are not rendered)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCallCard } from '../ToolCallCard';
import type { HistoryMessage } from '@bmad-studio/shared';

// Mock PermissionCard
vi.mock('../PermissionCard', () => ({
  PermissionCard: vi.fn(({ toolName, toolInput }: { toolName: string; toolInput?: Record<string, unknown> }) => (
    <div data-testid="mock-permission-card">
      <span>{toolName}</span>
      <span>{typeof toolInput?.file_path === 'string' ? toolInput.file_path : ''}</span>
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

  // Story 6.5 - PermissionCard delegation tests
  it('renders PermissionCard for Edit tool_use', () => {
    const editMessage: HistoryMessage = {
      id: 'msg-edit',
      type: 'tool_use',
      content: 'Editing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Edit',
      toolInput: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
    };

    render(<ToolCallCard message={editMessage} />);

    expect(screen.getByTestId('mock-permission-card')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('renders PermissionCard for Write tool_use', () => {
    const writeMessage: HistoryMessage = {
      id: 'msg-write',
      type: 'tool_use',
      content: 'Writing file',
      timestamp: '2026-01-15T10:00:00Z',
      toolName: 'Write',
      toolInput: { file_path: '/src/new.ts', content: 'new content' },
    };

    render(<ToolCallCard message={writeMessage} />);

    expect(screen.getByTestId('mock-permission-card')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
  });

  it('renders default card for non-Edit/Write tool_use', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    expect(screen.queryByTestId('mock-permission-card')).not.toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });
});
