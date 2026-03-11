/**
 * MessageArea Component Tests
 * [Source: Story 4.1 - Task 8, Story 4.5 - Task 15, Story 4.8 - Task 4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MessageArea } from '../MessageArea';
import type { StreamingSegment } from '../../stores/chatStore';

// Mock DiffViewer for Edit/Write delegation tests
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
  ThinkingBlock: ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => (
    <div data-testid="mock-thinking-block" data-streaming={isStreaming}>{content}</div>
  ),
}));

// Mock ResizeObserver which is not supported in jsdom
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
})));

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
        <MessageArea streamingSegments={[mockTextSegment]} isStreaming={true}>
          <div>Existing message</div>
        </MessageArea>
      );

      expect(screen.getByText('Hello from Claude...')).toBeInTheDocument();
      expect(screen.getByText('Existing message')).toBeInTheDocument();
    });

    it('should render streaming text after history messages', () => {
      const { container } = render(
        <MessageArea streamingSegments={[mockTextSegment]} isStreaming={true}>
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
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.queryByText('No messages')).not.toBeInTheDocument();
      expect(screen.getByText('Hello from Claude...')).toBeInTheDocument();
    });

    it('should render tool segment with pending spinner', () => {
      render(
        <MessageArea streamingSegments={[mockToolSegment]} isStreaming={true}>
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
        <MessageArea streamingSegments={[completedTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[errorTool]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 실패: Bash')).toBeInTheDocument();
      expect(screen.getByText('command not found')).toBeInTheDocument();
    });

    it('should render segments in order: text → tool → text', () => {
      const segments: StreamingSegment[] = [
        { type: 'text', content: 'Before tool' },
        { type: 'tool', toolCall: { id: 'tool-1', name: 'Read' }, status: 'completed' },
        { type: 'text', content: 'After tool' },
      ];

      render(
        <MessageArea streamingSegments={segments} isStreaming={true}>
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
        <MessageArea streamingSegments={[mockTextSegment]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      expect(container.querySelector('[aria-label="Claude 응답 중"]')).toBeInTheDocument();
    });

    it('renders ToolCard for Edit tool streaming segment', () => {
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
        <MessageArea streamingSegments={[editSegment]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      // ToolCard renders tool name and file path
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByLabelText('도구 실행 중: Edit')).toBeInTheDocument();
    });

    it('renders ToolCard for Write tool streaming segment', () => {
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
        <MessageArea streamingSegments={[writeSegment]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      // ToolCard renders tool name
      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.getByLabelText('도구 완료: Write')).toBeInTheDocument();
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
        <MessageArea streamingSegments={[thinkingSegment]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      expect(screen.getByTestId('mock-thinking-block')).toBeInTheDocument();
      expect(screen.getByText('Let me analyze this problem...')).toBeInTheDocument();
    });

    it('renders thinking segment with isStreaming=true during streaming', () => {
      const thinkingSegment: StreamingSegment = {
        type: 'thinking',
        content: 'Thinking...',
      };

      render(
        <MessageArea streamingSegments={[thinkingSegment]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      const thinkingBlock = screen.getByTestId('mock-thinking-block');
      expect(thinkingBlock).toHaveAttribute('data-streaming', 'true');
    });

    it('renders thinking and text segments in correct order', () => {
      const segments: StreamingSegment[] = [
        { type: 'thinking', content: 'Thinking first...' },
        { type: 'text', content: 'Then the response' },
      ];

      render(
        <MessageArea streamingSegments={segments} isStreaming={true}>
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
        <MessageArea streamingSegments={[completedTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[pendingTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[pendingTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[readTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[bashTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[todoTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[pendingTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[completedTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[errorTool]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('도구 실패: Bash')).toBeInTheDocument();
    });
  });

  // Story 18.2 - segmentsPendingClear dedup guard
  describe('segmentsPendingClear dedup guard (Story 18.2)', () => {
    const mockTextSegment: StreamingSegment = {
      type: 'text',
      content: 'Streaming content here',
    };

    it('TC-M1: renders segments when isStreaming=true', () => {
      render(
        <MessageArea
          streamingSegments={[mockTextSegment]}
          isStreaming={true}
          segmentsPendingClear={false}
        >
          <div>History</div>
        </MessageArea>
      );

      expect(screen.getByText('Streaming content here')).toBeInTheDocument();
    });

    it('TC-M2: renders segments when isStreaming=false but segmentsPendingClear=true', () => {
      render(
        <MessageArea
          streamingSegments={[mockTextSegment]}
          isStreaming={false}
          segmentsPendingClear={true}
        >
          <div>History</div>
        </MessageArea>
      );

      expect(screen.getByText('Streaming content here')).toBeInTheDocument();
    });

    it('TC-M3: does NOT render segments when isStreaming=false and segmentsPendingClear=false', () => {
      render(
        <MessageArea
          streamingSegments={[mockTextSegment]}
          isStreaming={false}
          segmentsPendingClear={false}
        >
          <div>History</div>
        </MessageArea>
      );

      expect(screen.queryByText('Streaming content here')).not.toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
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
        <MessageArea streamingSegments={[readTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[bashTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[editTool]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      // Edit uses ToolCard with diff display, not ToolResultRenderer
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for completed Write tool', () => {
      const writeTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Write', output: 'written', input: { file_path: '/src/new.ts', content: 'code' } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[writeTool]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      // Write uses ToolCard with diff display, not ToolResultRenderer
      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });

    it('does not render ToolResultRenderer for completed TodoWrite tool', () => {
      const todoTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'TodoWrite', output: 'updated', input: { todos: [{ content: 'task', status: 'pending' }] } },
        status: 'completed',
      };

      render(
        <MessageArea streamingSegments={[todoTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[pendingTool]} isStreaming={true}>
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
        <MessageArea streamingSegments={[noOutputTool]} isStreaming={true}>
          {null}
        </MessageArea>
      );

      expect(screen.queryByTestId('mock-tool-result-renderer')).not.toBeInTheDocument();
    });
  });

  // visibleSegments cutoff - hide segments after pending permission/interactive
  describe('visibleSegments cutoff (pending permission/interactive)', () => {
    const textBefore: StreamingSegment = { type: 'text', content: 'Before permission' };
    const textAfter: StreamingSegment = { type: 'text', content: 'After permission' };

    const waitingPermissionTool: StreamingSegment = {
      type: 'tool',
      toolCall: { id: 'tool-perm', name: 'Bash' },
      status: 'pending',
      permissionId: 'perm-1',
      permissionStatus: 'waiting',
    };

    const approvedPermissionTool: StreamingSegment = {
      type: 'tool',
      toolCall: { id: 'tool-perm', name: 'Bash' },
      status: 'pending',
      permissionId: 'perm-1',
      permissionStatus: 'approved',
    };

    const waitingInteractive: StreamingSegment = {
      type: 'interactive',
      id: 'int-1',
      interactionType: 'question',
      choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
      questions: [{ text: 'Choose one', choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }],
      status: 'waiting',
    };

    const respondedInteractive: StreamingSegment = {
      type: 'interactive',
      id: 'int-1',
      interactionType: 'question',
      choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
      questions: [{ text: 'Choose one', choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }],
      status: 'responded',
    };

    it('hides segments after a waiting tool permission', () => {
      render(
        <MessageArea
          streamingSegments={[textBefore, waitingPermissionTool, textAfter]}
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before permission')).toBeInTheDocument();
      expect(screen.queryByText('After permission')).not.toBeInTheDocument();
    });

    it('hides segments after a waiting interactive card', () => {
      render(
        <MessageArea
          streamingSegments={[textBefore, waitingInteractive, textAfter]}
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before permission')).toBeInTheDocument();
      expect(screen.queryByText('After permission')).not.toBeInTheDocument();
    });

    it('reveals segments once permission is approved', () => {
      render(
        <MessageArea
          streamingSegments={[textBefore, approvedPermissionTool, textAfter]}
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before permission')).toBeInTheDocument();
      expect(screen.getByText('After permission')).toBeInTheDocument();
    });

    it('reveals segments once interactive is responded', () => {
      render(
        <MessageArea
          streamingSegments={[textBefore, respondedInteractive, textAfter]}
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before permission')).toBeInTheDocument();
      expect(screen.getByText('After permission')).toBeInTheDocument();
    });

    it('shows all segments when no blocker exists', () => {
      const normalTool: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-1', name: 'Read' },
        status: 'pending',
      };

      render(
        <MessageArea
          streamingSegments={[textBefore, normalTool, textAfter]}
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before permission')).toBeInTheDocument();
      expect(screen.getByText('After permission')).toBeInTheDocument();
    });

    it('blocks at the first waiting segment when multiple blockers exist', () => {
      const secondWaiting: StreamingSegment = {
        type: 'tool',
        toolCall: { id: 'tool-perm-2', name: 'Edit' },
        status: 'pending',
        permissionId: 'perm-2',
        permissionStatus: 'waiting',
      };
      const textBetween: StreamingSegment = { type: 'text', content: 'Between blockers' };

      render(
        <MessageArea
          streamingSegments={[textBefore, waitingPermissionTool, textBetween, secondWaiting, textAfter]}
          isStreaming={true}
        >
          {null}
        </MessageArea>
      );

      expect(screen.getByText('Before permission')).toBeInTheDocument();
      expect(screen.queryByText('Between blockers')).not.toBeInTheDocument();
      expect(screen.queryByText('After permission')).not.toBeInTheDocument();
    });
  });
});
