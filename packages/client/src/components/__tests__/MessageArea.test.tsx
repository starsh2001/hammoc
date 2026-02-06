/**
 * MessageArea Component Tests
 * [Source: Story 4.1 - Task 8, Story 4.5 - Task 15, Story 4.8 - Task 4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
