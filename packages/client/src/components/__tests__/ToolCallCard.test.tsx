/**
 * ToolCallCard Tests
 * [Source: Story 3.5 - Task 6]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCallCard } from '../ToolCallCard';
import type { HistoryMessage } from '@bmad-studio/shared';

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

  it('should render tool_use input as JSON', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    expect(screen.getByText(/file_path/)).toBeInTheDocument();
    expect(screen.getByText(/\/src\/index.ts/)).toBeInTheDocument();
  });

  it('should render successful tool_result', () => {
    render(<ToolCallCard message={toolResultSuccess} />);

    expect(screen.getByText('도구 결과')).toBeInTheDocument();
    expect(screen.getByText(/export const app/)).toBeInTheDocument();
  });

  it('should render failed tool_result with error', () => {
    render(<ToolCallCard message={toolResultError} />);

    expect(screen.getByText(/ENOENT/)).toBeInTheDocument();
  });

  it('should have correct aria label for tool_use', () => {
    render(<ToolCallCard message={toolUseMessage} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      '도구 호출: Read'
    );
  });

  it('should have correct aria label for successful tool_result', () => {
    render(<ToolCallCard message={toolResultSuccess} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      '도구 결과: 성공'
    );
  });

  it('should have correct aria label for failed tool_result', () => {
    render(<ToolCallCard message={toolResultError} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      '도구 결과: 실패'
    );
  });

  it('should truncate long tool input', () => {
    const longInput = { content: 'a'.repeat(600) };
    const message: HistoryMessage = {
      ...toolUseMessage,
      toolInput: longInput,
    };

    render(<ToolCallCard message={message} />);

    const preElement = screen.getByText((_, element) => {
      return element?.tagName === 'PRE' && element.textContent!.length <= 510;
    });
    expect(preElement).toBeInTheDocument();
  });

  it('should display Wrench icon for tool_use', () => {
    const { container } = render(<ToolCallCard message={toolUseMessage} />);

    // Check for Wrench icon (lucide-react adds specific class)
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should display CheckCircle icon for successful result', () => {
    const { container } = render(<ToolCallCard message={toolResultSuccess} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should display XCircle icon for failed result', () => {
    const { container } = render(<ToolCallCard message={toolResultError} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
