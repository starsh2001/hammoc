/**
 * MessageActionBar Tests
 * [Source: Story 25.1 - Task 6]
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

  // Only copy button is rendered (no disabled placeholder buttons)
  it('renders only the copy button for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('renders only the copy button for user messages', () => {
    render(<MessageActionBar role="user" content="test" />);

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

  // Alignment: user messages right-aligned, assistant messages left-aligned
  it('right-aligns actions for user messages', () => {
    render(<MessageActionBar role="user" content="test" />);

    const bar = screen.getByTestId('message-action-bar');
    expect(bar.className).toContain('justify-end');
  });

  it('left-aligns actions for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    const bar = screen.getByTestId('message-action-bar');
    expect(bar.className).toContain('justify-start');
  });
});
