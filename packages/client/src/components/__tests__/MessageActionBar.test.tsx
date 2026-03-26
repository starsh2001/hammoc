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

  it('renders only the copy button for user messages without onEdit', () => {
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

  // ActionBar renders when disabled but edit button is hidden
  it('renders ActionBar when disabled but hides edit button', () => {
    render(<MessageActionBar role="user" content="test" disabled onEdit={vi.fn()} />);

    expect(screen.getByTestId('message-action-bar')).toBeInTheDocument();
    // Copy button is still visible
    expect(screen.getByRole('button', { name: /클립보드에 복사/i })).toBeInTheDocument();
    // Only copy button — no edit button
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // Edit button shown for user + non-optimistic + non-disabled
  it('shows edit button for user messages when not optimistic and not disabled', () => {
    const onEdit = vi.fn();
    render(<MessageActionBar role="user" content="test" onEdit={onEdit} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2); // edit + copy
    expect(screen.getByRole('button', { name: /편집/i })).toBeInTheDocument();
  });

  // Edit button hidden for optimistic user messages
  it('hides edit button for optimistic user messages', () => {
    render(<MessageActionBar role="user" content="test" onEdit={vi.fn()} isOptimistic />);

    expect(screen.getAllByRole('button')).toHaveLength(1); // copy only
  });

  // Edit button hidden for assistant messages
  it('hides edit button for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" onEdit={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(1); // copy only
  });

  // Edit button click calls onEdit
  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<MessageActionBar role="user" content="test" onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /편집/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
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
