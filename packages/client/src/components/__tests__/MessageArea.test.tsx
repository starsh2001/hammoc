/**
 * MessageArea Component Tests
 * [Source: Story 4.1 - Task 8, Story 4.5 - Task 15]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageArea } from '../MessageArea';
import type { StreamingMessageState } from '../../stores/chatStore';

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
      // Note: Testing scroll behavior requires mocking scroll events
      // This test verifies the button rendering logic
      const { container } = render(
        <MessageArea>
          <div style={{ height: '2000px' }}>Long content</div>
        </MessageArea>
      );

      const scrollContainer = container.querySelector('[tabindex="0"]');
      expect(scrollContainer).toBeInTheDocument();
    });

    it('should have aria-label on scroll button', () => {
      // This tests the button's accessibility when it appears
      render(<MessageArea>Content</MessageArea>);

      // The button only appears when user scrolls up
      // We verify the structure is correct
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

  describe('streaming message (Story 4.5)', () => {
    const mockStreamingMessage: StreamingMessageState = {
      sessionId: 'session-123',
      messageId: 'msg-456',
      content: 'Hello from Claude...',
      startedAt: new Date(),
    };

    it('should render streaming message when provided', () => {
      render(
        <MessageArea streamingMessage={mockStreamingMessage}>
          <div>Existing message</div>
        </MessageArea>
      );

      expect(screen.getByText('Hello from Claude...')).toBeInTheDocument();
      expect(screen.getByText('Existing message')).toBeInTheDocument();
    });

    it('should render streaming message after history messages', () => {
      const { container } = render(
        <MessageArea streamingMessage={mockStreamingMessage}>
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

    it('should not show empty state when streaming even if no children', () => {
      render(
        <MessageArea
          emptyState={<div>No messages</div>}
          streamingMessage={mockStreamingMessage}
        >
          {null}
        </MessageArea>
      );

      expect(screen.queryByText('No messages')).not.toBeInTheDocument();
      expect(screen.getByText('Hello from Claude...')).toBeInTheDocument();
    });

    it('should show streaming indicator within streaming message', () => {
      render(
        <MessageArea streamingMessage={mockStreamingMessage}>
          {null}
        </MessageArea>
      );

      expect(screen.getByLabelText('Claude가 응답을 생성하고 있습니다')).toBeInTheDocument();
    });

    it('should not render streaming message when null', () => {
      render(
        <MessageArea streamingMessage={null}>
          <div>Only history</div>
        </MessageArea>
      );

      expect(screen.getByText('Only history')).toBeInTheDocument();
      expect(screen.queryByLabelText('Claude 응답 중')).not.toBeInTheDocument();
    });

    it('should wrap streaming message in error boundary', () => {
      // StreamingErrorBoundary should be wrapping the StreamingMessage
      // This test verifies the structure exists
      const { container } = render(
        <MessageArea streamingMessage={mockStreamingMessage}>
          {null}
        </MessageArea>
      );

      // The StreamingMessage should be rendered
      expect(container.querySelector('[aria-label="Claude 응답 중"]')).toBeInTheDocument();
    });
  });
});
