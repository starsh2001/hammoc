/**
 * MessageBubble Tests
 * [Source: Story 3.5 - Task 6, Story 4.3 - Task 5, 6, Story 4.4 - Task 7]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../MessageBubble';
import type { HistoryMessage } from '@bmad-studio/shared';

// Mock formatRelativeTime
vi.mock('../../utils/formatters', () => ({
  formatRelativeTime: vi.fn(() => '5분 전'),
}));

// Mock MarkdownRenderer for controlled testing
vi.mock('../MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => (
    <div data-testid="markdown-renderer" data-streaming={isStreaming}>
      {content}
    </div>
  ),
}));

describe('MessageBubble', () => {
  const userMessage: HistoryMessage = {
    id: 'msg-1',
    type: 'user',
    content: 'Hello, can you help me?',
    timestamp: '2026-01-15T10:00:00Z',
  };

  const assistantMessage: HistoryMessage = {
    id: 'msg-2',
    type: 'assistant',
    content: 'Of course! How can I help you today?',
    timestamp: '2026-01-15T10:00:05Z',
  };

  it('should render user message content', () => {
    render(<MessageBubble message={userMessage} />);

    expect(screen.getByText('Hello, can you help me?')).toBeInTheDocument();
  });

  it('should render assistant message content', () => {
    render(<MessageBubble message={assistantMessage} />);

    expect(screen.getByText('Of course! How can I help you today?')).toBeInTheDocument();
  });

  it('should display Claude label for assistant messages', () => {
    render(<MessageBubble message={assistantMessage} />);

    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('should not display Claude label for user messages', () => {
    render(<MessageBubble message={userMessage} />);

    expect(screen.queryByText('Claude')).not.toBeInTheDocument();
  });

  it('should render formatted timestamp', () => {
    render(<MessageBubble message={userMessage} />);

    expect(screen.getByText('5분 전')).toBeInTheDocument();
  });

  it('should have user message aria label with timestamp', () => {
    render(<MessageBubble message={userMessage} />);

    expect(screen.getByRole('listitem')).toHaveAttribute('aria-label', '내 메시지, 5분 전');
  });

  it('should have assistant message aria label with timestamp', () => {
    render(<MessageBubble message={assistantMessage} />);

    expect(screen.getByRole('listitem')).toHaveAttribute('aria-label', 'Claude 메시지, 5분 전');
  });

  it('should align user messages to the right', () => {
    const { container } = render(<MessageBubble message={userMessage} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('justify-end');
  });

  it('should align assistant messages to the left', () => {
    const { container } = render(<MessageBubble message={assistantMessage} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('justify-start');
  });

  it('should preserve whitespace in message content', () => {
    const messageWithNewlines: HistoryMessage = {
      ...userMessage,
      content: 'Line 1\nLine 2\nLine 3',
    };

    render(<MessageBubble message={messageWithNewlines} />);

    const paragraph = screen.getByText(/Line 1/);
    expect(paragraph).toHaveClass('whitespace-pre-wrap');
  });

  // Story 4.3 - Task 5: Functionality tests
  describe('timestampMode', () => {
    it('should always show timestamp by default (always mode)', () => {
      const { container } = render(<MessageBubble message={userMessage} />);

      const timestamp = screen.getByText('5분 전');
      expect(timestamp).toBeInTheDocument();
      expect(container.querySelector('.opacity-100')).toBeInTheDocument();
    });

    it('should have opacity-0 for timestamp in hover mode initially', () => {
      const { container } = render(
        <MessageBubble message={userMessage} timestampMode="hover" />
      );

      const timestampDiv = container.querySelector('.text-xs');
      expect(timestampDiv).toHaveClass('opacity-0');
    });

    it('should show timestamp on hover in hover mode', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <MessageBubble message={userMessage} timestampMode="hover" />
      );

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);

      const timestampDiv = container.querySelector('.text-xs');
      expect(timestampDiv).toHaveClass('opacity-100');
    });
  });

  describe('long messages', () => {
    it('should display full content without truncation (1000+ chars)', () => {
      const longContent = 'A'.repeat(1000);
      const longMessage: HistoryMessage = {
        ...userMessage,
        content: longContent,
      };
      render(<MessageBubble message={longMessage} />);

      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it('should wrap long URLs correctly with break-words', () => {
      const messageWithUrl: HistoryMessage = {
        ...userMessage,
        content: 'https://example.com/very/long/url/that/should/wrap/properly/when/displayed',
      };
      const { container } = render(<MessageBubble message={messageWithUrl} />);

      const paragraph = container.querySelector('p');
      expect(paragraph).toHaveClass('break-words');
    });
  });

  // Story 4.3 - Task 6: Interaction and accessibility tests
  describe('copy button', () => {
    it('should show copy button on hover', async () => {
      const user = userEvent.setup();
      render(<MessageBubble message={userMessage} />);

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);

      const copyButton = screen.getByRole('button', { name: /메시지 복사/i });
      expect(copyButton).toHaveClass('opacity-100');
    });

    it('should hide copy button when not hovered', () => {
      render(<MessageBubble message={userMessage} />);

      const copyButton = screen.getByRole('button', { name: /메시지 복사/i });
      expect(copyButton).toHaveClass('opacity-0');
    });

    it('should copy content to clipboard when clicked (verified via onCopy callback)', async () => {
      const user = userEvent.setup();
      const onCopy = vi.fn();
      render(<MessageBubble message={userMessage} onCopy={onCopy} />);

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);
      await user.click(screen.getByRole('button', { name: /메시지 복사/i }));

      await waitFor(() => {
        // onCopy callback is called with the same content that's written to clipboard
        expect(onCopy).toHaveBeenCalledWith('Hello, can you help me?');
      });
    });

    it('should call onCopy callback when copy is successful', async () => {
      const user = userEvent.setup();
      const onCopy = vi.fn();
      render(<MessageBubble message={userMessage} onCopy={onCopy} />);

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);
      await user.click(screen.getByRole('button', { name: /메시지 복사/i }));

      await waitFor(() => {
        expect(onCopy).toHaveBeenCalledWith('Hello, can you help me?');
      });
    });

    it('should show check icon after copy (aria-label changes to 복사됨)', async () => {
      const user = userEvent.setup();
      render(<MessageBubble message={userMessage} />);

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);
      await user.click(screen.getByRole('button', { name: /메시지 복사/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /복사됨/i })).toBeInTheDocument();
      });
    });

    it('should revert to copy icon after 2 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<MessageBubble message={userMessage} />);

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);
      await user.click(screen.getByRole('button', { name: /메시지 복사/i }));

      // Verify it shows "복사됨" immediately after click
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /복사됨/i })).toBeInTheDocument();
      });

      // Advance timer by 2 seconds
      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /메시지 복사/i })).toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  describe('responsive width', () => {
    it('should have responsive max-width classes (90% mobile, 80% desktop)', () => {
      const { container } = render(<MessageBubble message={userMessage} />);

      const messageBox = container.querySelector('.max-w-\\[90\\%\\]');
      expect(messageBox).toBeInTheDocument();

      const desktopWidth = container.querySelector('.md\\:max-w-\\[80\\%\\]');
      expect(desktopWidth).toBeInTheDocument();
    });
  });

  describe('touch target size', () => {
    it('should have padding for adequate touch target on copy button', () => {
      render(<MessageBubble message={userMessage} />);

      const copyButton = screen.getByRole('button', { name: /메시지 복사/i });
      // Button has p-1.5 padding for touch target
      expect(copyButton).toHaveClass('p-1.5');
    });
  });

  describe('accessibility', () => {
    it('should include timestamp in aria-label for user message', () => {
      render(<MessageBubble message={userMessage} />);

      const bubble = screen.getByRole('listitem');
      expect(bubble.getAttribute('aria-label')).toContain('5분 전');
    });

    it('should include timestamp in aria-label for assistant message', () => {
      render(<MessageBubble message={assistantMessage} />);

      const bubble = screen.getByRole('listitem');
      expect(bubble.getAttribute('aria-label')).toContain('5분 전');
    });
  });

  // Story 4.4 - Task 7: Markdown rendering integration tests
  describe('markdown rendering (Story 4.4)', () => {
    it('should render assistant message with MarkdownRenderer', () => {
      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });

    it('should render user message as plain text (no MarkdownRenderer)', () => {
      render(<MessageBubble message={userMessage} />);

      expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
      // User message should be in a paragraph element
      const paragraph = screen.getByText('Hello, can you help me?');
      expect(paragraph.tagName).toBe('P');
    });

    it('should pass isStreaming prop to MarkdownRenderer', () => {
      render(<MessageBubble message={assistantMessage} isStreaming={true} />);

      const markdownRenderer = screen.getByTestId('markdown-renderer');
      expect(markdownRenderer).toHaveAttribute('data-streaming', 'true');
    });

    it('should render assistant message with code block via MarkdownRenderer', () => {
      const messageWithCode: HistoryMessage = {
        id: 'msg-code',
        type: 'assistant',
        content: 'Here is some code:\n```javascript\nconst x = 1;\n```',
        timestamp: '2026-01-15T10:00:10Z',
      };

      render(<MessageBubble message={messageWithCode} />);

      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
      expect(screen.getByText(/Here is some code/)).toBeInTheDocument();
    });

    it('should copy raw markdown content when copy button clicked for assistant message', async () => {
      const user = userEvent.setup();
      const onCopy = vi.fn();
      const markdownContent = '# Heading\n\n**Bold text** and `inline code`';
      const assistantWithMarkdown: HistoryMessage = {
        id: 'msg-md',
        type: 'assistant',
        content: markdownContent,
        timestamp: '2026-01-15T10:00:15Z',
      };

      render(<MessageBubble message={assistantWithMarkdown} onCopy={onCopy} />);

      const bubble = screen.getByRole('listitem');
      await user.hover(bubble);
      await user.click(screen.getByRole('button', { name: /메시지 복사/i }));

      await waitFor(() => {
        // Should copy the raw markdown, not rendered HTML
        expect(onCopy).toHaveBeenCalledWith(markdownContent);
      });
    });

    it('should render user message with markdown-like content as plain text', () => {
      const userWithMarkdown: HistoryMessage = {
        id: 'msg-user-md',
        type: 'user',
        content: '# This is not rendered as heading\n**not bold**',
        timestamp: '2026-01-15T10:00:20Z',
      };

      render(<MessageBubble message={userWithMarkdown} />);

      // Should NOT use MarkdownRenderer
      expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
      // Content should be plain text
      expect(screen.getByText(/# This is not rendered as heading/)).toBeInTheDocument();
    });
  });
});
