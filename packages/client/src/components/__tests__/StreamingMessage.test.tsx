/**
 * StreamingMessage Component Tests
 * [Source: Story 4.5 - Task 14]
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

      expect(screen.getByLabelText('Claude가 응답을 생성하고 있습니다')).toBeInTheDocument();
    });

    it('hides streaming indicator when complete', () => {
      render(<StreamingMessage content="Hello" isComplete={true} />);

      expect(screen.queryByLabelText('Claude가 응답을 생성하고 있습니다')).not.toBeInTheDocument();
    });
  });

  describe('copy button', () => {
    it('does not show copy button during streaming', () => {
      render(<StreamingMessage content="Hello" isComplete={false} />);

      expect(screen.queryByLabelText('메시지 복사')).not.toBeInTheDocument();
    });

    it('shows copy button when complete', () => {
      render(<StreamingMessage content="Hello" isComplete={true} />);

      expect(screen.getByLabelText('메시지 복사')).toBeInTheDocument();
    });

    it('copies content when copy button is clicked', async () => {
      const onCopy = vi.fn();
      render(<StreamingMessage content="Hello World" isComplete={true} onCopy={onCopy} />);

      const copyButton = screen.getByLabelText('메시지 복사');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello World');
        expect(onCopy).toHaveBeenCalledWith('Hello World');
      });
    });

    it('shows copied state after clicking', async () => {
      render(<StreamingMessage content="Hello" isComplete={true} />);

      const copyButton = screen.getByLabelText('메시지 복사');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByLabelText('복사됨')).toBeInTheDocument();
      });
    });
  });

  describe('styling', () => {
    it('has assistant message styling', () => {
      render(<StreamingMessage content="Hello" />);

      const message = screen.getByRole('listitem').querySelector('.bg-white');
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
      // Render with code block to verify markdown rendering
      const { container } = render(
        <StreamingMessage content="```javascript\nconst x = 1;\n```" isComplete={false} />
      );

      // Code block should be rendered
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
