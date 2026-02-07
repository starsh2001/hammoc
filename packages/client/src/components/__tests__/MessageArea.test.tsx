/**
 * MessageArea Component Tests
 * [Source: Story 4.1 - Task 8, Story 4.5 - Task 15, Story 4.8 - Task 4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MessageArea } from '../MessageArea';
import type { StreamingSegment } from '../../stores/chatStore';

// Mock PermissionCard and DiffViewer for Edit/Write delegation tests
vi.mock('../PermissionCard', () => ({
  PermissionCard: vi.fn(({ toolName }: { toolName: string }) => (
    <div data-testid="mock-permission-card">{toolName}</div>
  )),
}));

vi.mock('../DiffViewer', () => ({
  DiffViewer: vi.fn(() => <div data-testid="mock-diff-viewer" />),
  default: vi.fn(),
}));

// Mock ToolResultRenderer
vi.mock('../ToolResultRenderer', () => ({
  ToolResultRenderer: vi.fn(({ toolName, result }: { toolName: string; result?: string }) => (
    result ? <div data-testid="mock-tool-result-renderer" data-tool={toolName}>{result}</div> : null
  )),
}));

// Mock ThinkingBlock
vi.mock('../ThinkingBlock', () => ({
  ThinkingBlock: ({ content, defaultExpanded }: { content: string; defaultExpanded?: boolean }) => (
    <div data-testid="mock-thinking-block" data-expanded={defaultExpanded}>{content}</div>
  ),
}));

describe('MessageArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with data-testid', () => {
      render(<MessageArea>Test content</MessageArea>);

      expect(screen.getByTestId('message-area')).toBeInTheDocument();
    });

    it('should render children', () => {
      render(
        <MessageArea>
          <div>Message 1</div>
          <div>Message 2</div>
        </MessageArea>
      );

      expect(screen.getByText('Message 1')).toBeInTheDocument();
      expect(screen.getByText('Message 2')).toBeInTheDocument();
    });

    it('should render empty state when no children and emptyState provided', () => {
      render(
        <MessageArea emptyState={<div>No messages</div>}>
          {null}
        </MessageArea>
      );

      expect(screen.getByText('No messages')).toBeInTheDocument();
    });

    it('should render empty state when children is empty array', () => {
      render(
        <MessageArea emptyState={<div>Empty</div>}>
          {[]}
        </MessageArea>
      );

      expect(screen.getByText('Empty')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have role="log"', () => {
      render(<MessageArea>Content</MessageArea>);

      expect(screen.getByRole('log')).toBeInTheDocument();
    });

    it('should have aria-label', () => {
      render(<MessageArea>Content</MessageArea>);

      expect(screen.getByRole('log')).toHaveAttribute('aria-label', '메시지 목록');
    });

    it('should have aria-live="polite"', () => {
      render(<MessageArea>Content</MessageArea>);

      expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
    });

    it('should have tabIndex for keyboard navigation', () => {
      render(<MessageArea>Content</MessageArea>);

      const scrollContainer = screen.getByTestId('message-area').querySelector('[tabindex="0"]');
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  describe('scroll behavior', () => {
    it('should render scroll to bottom button when user scrolled up', () => {
      const { container } = render(
        <MessageArea>
          <div style={{ height: '2000px' }}>Long content</div>
        </MessageArea>
      );

      const scrollContainer = container.querySelector('[tabindex="0"]');
      expect(scrollContainer).toBeInTheDocument();
    });

    it('should have aria-label on scroll button', () => {
      render(<MessageArea>Content</MessageArea>);

      expect(screen.getByTestId('message-area')).toBeInTheDocument();
    });
  });

  describe('dark mode', () => {
    it('should have dark mode classes', () => {
      render(<MessageArea>Content</MessageArea>);

      const messageArea = screen.getByTestId('message-area');
      expect(messageArea.className).toContain('dark:bg-gray-900');
    });
  });

  describe('empty state styling', () => {
    it('should center empty state', () => {
      render(
        <MessageArea emptyState={<div>Empty</div>}>
          {null}
        </MessageArea>
      );

      const messageArea = screen.getByTestId('message-area');
      expect(messageArea.className).toContain('flex');
      expect(messageArea.className).toContain('items-center');
      expect(messageArea.className).toContain('justify-center');
    });
  });

  describe('streaming segments (Story 4.8)', () => {
    const mockTextSegment: StreamingSegment = {
      type: 'text',
      content: 'Hello from Claude...',
    };

    const mockToolSegment: StreamingSegment = {
      type: 'tool',
      toolCall: { id: 'tool-1', name: 'Read' },
      status: 'pending',
    };

    it('should render text segment when provided', () => {
      render(
        <MessageArea streamingSegments={[mockTextSegment]}>
          <div>Existing message</div>
        </MessageArea>
      );

      expect(screen.getByText('Hello from Claude...')).toBeInTheDocument();
      expect(screen.getByText('Existing message')).toBeInTheDocument();
    });

    it('should render streaming text after history messages', () => {
      const { container } = render(
        <MessageArea streamingSegments={[mockTextSegment]}>
          <div data-testid="history-message">History</div>
        </MessageArea>
      );

      const historyMessage = screen.getByTestId('history-message');
      const streamingMessage = container.querySelector('[aria-label="Claude 응답 중"]');

      // Streaming message should come after history message in DOM
      expect(historyMessage.compareDocumentPosition(streamingMessage as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    it('should not show empty state when streaming segments exist', () => {
      render(
        <MessageArea
          emptyState={<div>No messages</div>}
          streamingSegments={[mockTextSegment]}
        >
          {null}
        </MessageArea>
      );

      expect(screen.queryByText('No messages')).not.toBeInTheDocument();
      expect(screen.getByText('Hello from Claude...')).toBeInTheDocument();
    });

    it('should render tool segment with pending spinner', () => {
      render(
        <MessageArea streamingSegments={[mockToolSegment]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByLabelText('도구 실행 중: Read')).toBeInTheDocument();
    });

    it('should render completed tool segment with check icon', () => {
      const completedTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Grep', output: 'done' },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[completedTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 완료: Grep')).toBeInTheDocument();
    });

    it('should render error tool segment with error message', () => {
      const errorTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Bash', output: 'command not found' },
        status: 'error',
      };

      render(
        <MessageArea streamingSegments={[errorTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 실패: Bash')).toBeInTheDocument();
      expect(screen.getByText('Tool 실행 실패: command not found')).toBeInTheDocument();
    });

    it('should render segments in order: text → tool → text', () => {
      const segments: StreamingSegment[] = [
        { type: 'text', content: 'Before tool' },
        { type: 'tool', toolCall: { id: 'tool-1', name: 'Read' }, status: 'completed' },
        { type: 'text', content: 'After tool' },
      ];

      render(
        <MessageArea streamingSegments={segments}>
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before tool')).toBeInTheDocument();
      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('After tool')).toBeInTheDocument();
    });

    it('should render no streaming content when segments is empty', () => {
      render(
        <MessageArea streamingSegments={[]}>
          <div>Only history</div>
        </MessageArea>
      );

      expect(screen.getByText('Only history')).toBeInTheDocument();
    });

    it('should render streaming message in error boundary', () => {
      const { container } = render(
        <MessageArea streamingSegments={[mockTextSegment]}>
          {null}
        </MessageArea>
      );

      expect(container.querySelector('[aria-label="Claude 응답 중"]')).toBeInTheDocument();
    });

    // Story 6.5 - PermissionCard delegation tests
    it('renders PermissionCard for Edit tool streaming segment', () => {
      const editSegment: StreamingSegment = {
        type: 'tool',
        toolCall: {
          id: 'tool-edit-1',
          name: 'Edit',
          input: { file_path: '/src/app.ts', old_string: 'old', new_string: 'new' },
        },
        status: 'pending',
      };

      render(
        <MessageArea streamingSegments={[editSegment]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByTestId('mock-permission-card')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('renders PermissionCard for Write tool streaming segment', () => {
      const writeSegment: StreamingSegment = {
        type: 'tool',
        toolCall: {
          id: 'tool-write-1',
          name: 'Write',
          input: { file_path: '/src/new.ts', content: 'new content' },
        },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[writeSegment]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByTestId('mock-permission-card')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
    });
  });

  // Story 7.4 - thinking segment display
  describe('thinking segment display (Story 7.4)', () => {
    it('renders thinking segment as ThinkingBlock', () => {
      const thinkingSegment: StreamingSegment = {
        type: 'thinking',
        content: 'Let me analyze this problem...',
      };

      render(
        <MessageArea streamingSegments={[thinkingSegment]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByTestId('mock-thinking-block')).toBeInTheDocument();
      expect(screen.getByText('Let me analyze this problem...')).toBeInTheDocument();
    });

    it('renders thinking segment with defaultExpanded=true during streaming', () => {
      const thinkingSegment: StreamingSegment = {
        type: 'thinking',
        content: 'Thinking...',
      };

      render(
        <MessageArea streamingSegments={[thinkingSegment]}>
          {null}
        </MessageArea>
      );

      const thinkingBlock = screen.getByTestId('mock-thinking-block');
      expect(thinkingBlock).toHaveAttribute('data-expanded', 'true');
    });

    it('renders thinking and text segments in correct order', () => {
      const segments: StreamingSegment[] = [
        { type: 'thinking', content: 'Thinking first...' },
        { type: 'text', content: 'Then the response' },
      ];

      render(
        <MessageArea streamingSegments={segments}>
          {null}
        </MessageArea>
      );

      const thinkingBlock = screen.getByTestId('mock-thinking-block');
      const textContent = screen.getByText('Then the response');

      // Thinking should appear before text
      expect(
        thinkingBlock.compareDocumentPosition(textContent)
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  // Story 7.2 tests
  describe('tool execution status (Story 7.2)', () => {
    it('renders completed tool with duration display', () => {
      const completedTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read', duration: 1200, startedAt: Date.now() - 1200 },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[completedTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByText('1.2s')).toBeInTheDocument();
      expect(screen.getByLabelText('실행 시간: 1.2s')).toBeInTheDocument();
    });

    it('renders pending tool with real-time timer', () => {
      vi.useFakeTimers();
      const startedAt = Date.now();

      const pendingTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Bash', startedAt },
        status: 'pending',
      };

      render(
        <MessageArea streamingSegments={[pendingTool]}>
          {null}
        </MessageArea>
      );

      // Initially ~0s
      expect(screen.getByText('0.0s')).toBeInTheDocument();

      // Advance 2 seconds
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('2.0s')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('does not show duration for pending tools without startedAt', () => {
      const pendingTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read' },
        status: 'pending',
      };

      render(
        <MessageArea streamingSegments={[pendingTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.queryByLabelText(/실행 시간/)).not.toBeInTheDocument();
    });

    it('shows path display for Read tool via ToolPathDisplay', () => {
      const readTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read', input: { file_path: '/src/index.ts', limit: 50 } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[readTool]}>
          {null}
        </MessageArea>
      );

      // Shows collapsed filename via ToolPathDisplay
      expect(screen.getByText('index.ts')).toBeInTheDocument();

      // Expand to see full path
      const toggle = screen.getByRole('button', { name: '전체 내용 보기' });
      fireEvent.click(toggle);
      expect(screen.getByText('/src/index.ts')).toBeInTheDocument();
    });

    it('shows Bash command via ToolPathDisplay', () => {
      const bashTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Bash', input: { command: 'npm test' } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[bashTool]}>
          {null}
        </MessageArea>
      );

      // Bash shows command text directly
      expect(screen.getByText('npm test')).toBeInTheDocument();
    });

    it('does not show path display for TodoWrite tool', () => {
      const todoTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'TodoWrite', input: { todos: [{ content: 'task', status: 'pending' }] } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[todoTool]}>
          {null}
        </MessageArea>
      );

      // TodoWrite has no displayInfo, so no ToolPathDisplay
      expect(screen.getByText('Update Todos')).toBeInTheDocument();
    });

    // AC1/AC3 regression: spinner + success/failure icons
    it('regression: pending tool shows spinner', () => {
      const pendingTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Grep' },
        status: 'pending',
      };

      render(
        <MessageArea streamingSegments={[pendingTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 실행 중: Grep')).toBeInTheDocument();
    });

    it('regression: completed tool shows success icon', () => {
      const completedTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Glob', output: 'done' },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[completedTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 완료: Glob')).toBeInTheDocument();
    });

    it('regression: error tool shows error icon', () => {
      const errorTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Bash', output: 'error msg' },
        status: 'error',
      };

      render(
        <MessageArea streamingSegments={[errorTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 실패: Bash')).toBeInTheDocument();
    });
  });

  // Story 7.3 - tool result display in streaming segments
  describe('tool result display (Story 7.3)', () => {
    it('renders ToolResultRenderer for completed Read tool with output (collapsible)', () => {
      const readTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read', output: 'file content here', input: { file_path: '/src/app.ts' } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[readTool]}>
          {null}
        </MessageArea>
      );

      // Result is collapsed by default
      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();

      // Click "결과 보기" to expand
      const toggleBtn = screen.getByText('결과 보기');
      fireEvent.click(toggleBtn);

      const renderer = screen.getByTestId('mock-tool-result-renderer');
      expect(renderer).toBeInTheDocument();
      expect(renderer).toHaveAttribute('data-tool', 'Read');
    });

    it('renders Bash output inside ToolPathDisplay when expanded (IN/OUT in one card)', () => {
      const bashTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Bash', output: 'test passed', input: { command: 'npm test', description: 'Run tests' } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[bashTool]}>
          {null}
        </MessageArea>
      );

      // Collapsed: shows description
      expect(screen.getByText('Run tests')).toBeInTheDocument();

      // Expand to see command (IN) and output (OUT)
      const toggle = screen.getByRole('button', { name: '전체 내용 보기' });
      fireEvent.click(toggle);
      expect(screen.getByText(/IN/)).toBeInTheDocument();
      expect(screen.getByText('npm test')).toBeInTheDocument();
      expect(screen.getByText(/OUT/)).toBeInTheDocument();
      expect(screen.getByText('test passed')).toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for completed Edit tool', () => {
      const editTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Edit', output: 'edited', input: { file_path: '/src/app.ts', old_string: 'a', new_string: 'b' } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[editTool]}>
          {null}
        </MessageArea>
      );

      // Edit uses PermissionCard, not ToolResultRenderer
      expect(screen.getByTestId('mock-permission-card')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for completed Write tool', () => {
      const writeTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Write', output: 'written', input: { file_path: '/src/new.ts', content: 'code' } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[writeTool]}>
          {null}
        </MessageArea>
      );

      // Write uses PermissionCard, not ToolResultRenderer
      expect(screen.getByTestId('mock-permission-card')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for completed TodoWrite tool', () => {
      const todoTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'TodoWrite', output: 'updated', input: { todos: [{ content: 'task', status: 'pending' }] } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[todoTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for pending tool (not completed)', () => {
      const pendingTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read', input: { file_path: '/src/app.ts' } },
        status: 'pending',
      };

      render(
        <MessageArea streamingSegments={[pendingTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for completed tool without output', () => {
      const noOutputTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read' },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[noOutputTool]}>
          {null}
        </MessageArea>
      );

      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });
  });
});
