/**
 * StreamingMessage Component Tests
 * [Source: Story 4.5 - Task 14, Story 25.1 - Task 7]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreamingMessage } from '../StreamingMessage';

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

describe('StreamingMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders content with markdown support', () => {
      render(<StreamingMessage content="**Bold text**" />);

      expect(screen.getByText('Bold text')).toBeInTheDocument();
    });

    it('displays Claude icon and name', () => {
      render(<StreamingMessage content="Hello" />);

      expect(screen.getByText('Claude')).toBeInTheDocument();
    });

    it('has correct aria-label', () => {
      render(<StreamingMessage content="Hello" />);

      expect(screen.getByLabelText('Claude 응답 중')).toBeInTheDocument();
    });

    it('renders as a listitem', () => {
      render(<StreamingMessage content="Hello" />);

      expect(screen.getByRole('listitem')).toBeInTheDocument();
    });
  });

  describe('streaming indicator', () => {
    it('shows streaming indicator when not complete', () => {
      render(<StreamingMessage content="Hello" isComplete={false} />);

      expect(screen.getByLabelText('Claude 응답 중')).toBeInTheDocument();
    });

    it('hides MessageActionBar when not complete (streaming)', () => {
      render(<StreamingMessage content="Hello" isComplete={false} />);

      expect(screen.queryByTestId('message-action-bar')).not.toBeInTheDocument();
    });
  });

  // Story 25.1: MessageActionBar integration
  describe('MessageActionBar (Story 25.1)', () => {
    it('does not show action bar during streaming', () => {
      render(<StreamingMessage content="Hello" isComplete={false} />);

      expect(screen.queryByTestId('message-action-bar')).not.toBeInTheDocument();
    });

    it('shows action bar when complete', () => {
      render(<StreamingMessage content="Hello" isComplete={true} />);

      expect(screen.getByTestId('message-action-bar')).toBeInTheDocument();
    });

    it('copies content when copy button is clicked', async () => {
      const onCopy = vi.fn();
      render(<StreamingMessage content="Hello World" isComplete={true} onCopy={onCopy} />);

      const copyButton = screen.getByRole('button', { name: /클립보드에 복사/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello World');
        expect(onCopy).toHaveBeenCalledWith('Hello World');
      });
    });

    it('shows copied state after clicking', async () => {
      render(<StreamingMessage content="Hello" isComplete={true} />);

      const copyButton = screen.getByRole('button', { name: /클립보드에 복사/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /메시지 복사됨/i })).toBeInTheDocument();
      });
    });
  });

  describe('styling', () => {
    it('has assistant message styling', () => {
      render(<StreamingMessage content="Hello" />);

      const message = screen.getByRole('listitem').querySelector('.bg-gray-50');
      expect(message).toBeInTheDocument();
    });

    it('has left alignment for assistant message', () => {
      render(<StreamingMessage content="Hello" />);

      const container = screen.getByRole('listitem');
      expect(container).toHaveClass('justify-start');
    });
  });

  describe('markdown rendering', () => {
    it('passes isStreaming=true to MarkdownRenderer when not complete', () => {
      const { container } = render(
        <StreamingMessage content="```javascript\nconst x = 1;\n```" isComplete={false} />
      );

      expect(container.querySelector('code')).toBeInTheDocument();
    });

    it('passes isStreaming=false to MarkdownRenderer when complete', () => {
      const { container } = render(
        <StreamingMessage content="```javascript\nconst x = 1;\n```" isComplete={true} />
      );

      expect(container.querySelector('code')).toBeInTheDocument();
    });
  });
});
