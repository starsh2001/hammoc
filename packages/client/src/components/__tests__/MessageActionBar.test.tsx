/**
 * MessageActionBar Tests
 * [Source: Story 25.1 - Task 6, Story 25.4 - Task 8]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageActionBar } from '../MessageActionBar';

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

describe('MessageActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: mockClipboard });
  });

  // Renders Copy button for assistant messages
  it('renders Copy button for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    expect(screen.getByRole('button', { name: /클립보드에 복사/i })).toBeInTheDocument();
  });

  // Renders Copy button for user messages
  it('renders Copy button for user messages', () => {
    render(<MessageActionBar role="user" content="test" />);

    expect(screen.getByRole('button', { name: /클립보드에 복사/i })).toBeInTheDocument();
  });

  // Only copy button rendered when no rewind/regenerate callbacks
  it('renders only the copy button when no rewind/regenerate callbacks', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  // Clicking Copy calls clipboard API with correct content
  it('calls clipboard API with correct content when Copy is clicked', async () => {
    const onCopy = vi.fn();
    render(<MessageActionBar role="assistant" content="Hello World" onCopy={onCopy} />);

    const copyButton = screen.getByRole('button', { name: /클립보드에 복사/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello World');
      expect(onCopy).toHaveBeenCalledWith('Hello World');
    });
  });

  // Copy success shows Check icon for 2 seconds then reverts
  it('shows copied state for 2 seconds then reverts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MessageActionBar role="assistant" content="test" />);

    const copyButton = screen.getByRole('button', { name: /클립보드에 복사/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /메시지 복사됨/i })).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /클립보드에 복사/i })).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  // Clipboard fallback works when navigator.clipboard unavailable
  it('uses textarea fallback when clipboard API unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined });

    document.execCommand = vi.fn().mockReturnValue(true);
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    render(<MessageActionBar role="assistant" content="fallback test" />);

    const copyButton = screen.getByRole('button', { name: /클립보드에 복사/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    Object.assign(navigator, { clipboard: mockClipboard });
  });

  // Does not render when disabled is true
  it('does not render when disabled is true', () => {
    const { container } = render(<MessageActionBar role="assistant" content="test" disabled />);

    expect(container.querySelector('[data-testid="message-action-bar"]')).not.toBeInTheDocument();
  });

  // Alignment: all messages use justify-end
  it('right-aligns actions for user messages', () => {
    render(<MessageActionBar role="user" content="test" />);

    const bar = screen.getByTestId('message-action-bar');
    expect(bar.className).toContain('justify-end');
  });

  it('right-aligns actions for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    const bar = screen.getByTestId('message-action-bar');
    expect(bar.className).toContain('justify-end');
  });

  // --- Story 25.4: Rewind/Regenerate button tests ---

  it('renders Rewind button for assistant messages when onRewind provided', () => {
    const onRewind = vi.fn();
    render(
      <MessageActionBar role="assistant" content="test" messageId="msg-1" onRewind={onRewind} />
    );

    expect(screen.getByRole('button', { name: /이 메시지로 되감기/i })).toBeInTheDocument();
  });

  it('renders Rewind button for user messages when onRewind provided', () => {
    const onRewind = vi.fn();
    render(
      <MessageActionBar role="user" content="test" messageId="msg-1" onRewind={onRewind} />
    );

    expect(screen.getByRole('button', { name: /이 메시지로 되감기/i })).toBeInTheDocument();
  });

  it('renders Regenerate button only when isLastAssistant is true', () => {
    const onRegenerate = vi.fn();
    render(
      <MessageActionBar role="assistant" content="test" isLastAssistant onRegenerate={onRegenerate} />
    );

    expect(screen.getByRole('button', { name: /응답 재생성/i })).toBeInTheDocument();
  });

  it('does not render Regenerate button when isLastAssistant is false', () => {
    const onRegenerate = vi.fn();
    render(
      <MessageActionBar role="assistant" content="test" isLastAssistant={false} onRegenerate={onRegenerate} />
    );

    expect(screen.queryByRole('button', { name: /응답 재생성/i })).not.toBeInTheDocument();
  });

  it('does not render edit/share placeholder buttons', () => {
    const onRewind = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <MessageActionBar
        role="assistant"
        content="test"
        messageId="msg-1"
        isLastAssistant
        onRewind={onRewind}
        onRegenerate={onRegenerate}
      />
    );

    // Should have exactly 3 buttons: Rewind, Regenerate, Copy
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('calls onRewind with correct messageId and messageText', () => {
    const onRewind = vi.fn();
    render(
      <MessageActionBar
        role="assistant"
        content="full content"
        messageId="msg-123"
        messageText="rewind text"
        onRewind={onRewind}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /이 메시지로 되감기/i }));
    expect(onRewind).toHaveBeenCalledWith('msg-123', 'rewind text');
  });

  it('calls onRegenerate when Regenerate button clicked', () => {
    const onRegenerate = vi.fn();
    render(
      <MessageActionBar
        role="assistant"
        content="test"
        isLastAssistant
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /응답 재생성/i }));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it('disables Rewind and Regenerate buttons when isRewinding is true', () => {
    const onRewind = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <MessageActionBar
        role="assistant"
        content="test"
        messageId="msg-1"
        isLastAssistant
        isRewinding
        onRewind={onRewind}
        onRegenerate={onRegenerate}
      />
    );

    const rewindBtn = screen.getByRole('button', { name: /이 메시지로 되감기/i });
    const regenBtn = screen.getByRole('button', { name: /응답 재생성/i });
    expect(rewindBtn).toBeDisabled();
    expect(regenBtn).toBeDisabled();
  });
});
