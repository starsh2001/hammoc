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

  // ActionBar renders when disabled — edit button is visible but disabled
  it('renders ActionBar when disabled with edit button disabled', () => {
    render(<MessageActionBar role="user" content="test" disabled onEdit={vi.fn()} />);

    expect(screen.getByTestId('message-action-bar')).toBeInTheDocument();
    // Copy button is still visible
    expect(screen.getByRole('button', { name: /클립보드에 복사/i })).toBeInTheDocument();
    // Edit button is visible but disabled
    const editBtn = screen.getByRole('button', { name: /편집/i });
    expect(editBtn).toBeDisabled();
    // Both edit and copy buttons present
    expect(screen.getAllByRole('button')).toHaveLength(2);
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

  it('right-aligns actions for assistant messages (same as user)', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    const bar = screen.getByTestId('message-action-bar');
    expect(bar.className).toContain('justify-end');
  });

  // Story 25.8: Rewind button tests
  it('shows rewind button for user messages when onRewind provided', () => {
    render(<MessageActionBar role="user" content="test" onRewind={vi.fn()} />);

    expect(screen.getByRole('button', { name: /rewind code|코드 되돌리기/i })).toBeInTheDocument();
  });

  it('hides rewind button for optimistic user messages', () => {
    render(<MessageActionBar role="user" content="test" onRewind={vi.fn()} isOptimistic />);

    const buttons = screen.getAllByRole('button');
    // Only copy button — no rewind
    expect(buttons).toHaveLength(1);
  });

  it('hides rewind button for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" onRewind={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1); // copy only
  });

  it('disables rewind button when streaming (disabled=true)', () => {
    render(<MessageActionBar role="user" content="test" onRewind={vi.fn()} disabled />);

    const rewindBtn = screen.getByRole('button', { name: /rewind code|코드 되돌리기/i });
    expect(rewindBtn).toBeDisabled();
  });

  it('disables rewind button when isRewinding is true', () => {
    render(<MessageActionBar role="user" content="test" onRewind={vi.fn()} isRewinding />);

    const rewindBtn = screen.getByRole('button', { name: /rewind code|코드 되돌리기/i });
    expect(rewindBtn).toBeDisabled();
  });

  it('calls onRewind when rewind button is clicked', () => {
    const onRewind = vi.fn();
    render(<MessageActionBar role="user" content="test" onRewind={onRewind} />);

    fireEvent.click(screen.getByRole('button', { name: /rewind code|코드 되돌리기/i }));
    expect(onRewind).toHaveBeenCalledTimes(1);
  });

  // Story 25.9: Summarize button tests
  it('shows summarize button for user messages when onSummarize provided', () => {
    render(<MessageActionBar role="user" content="test" onSummarize={vi.fn()} />);

    expect(screen.getByRole('button', { name: /summarize|요약/i })).toBeInTheDocument();
  });

  it('hides summarize button for optimistic user messages', () => {
    render(<MessageActionBar role="user" content="test" onSummarize={vi.fn()} isOptimistic />);

    // Only copy button — no summarize
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('hides summarize button for assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" onSummarize={vi.fn()} />);

    // Only copy button — no summarize
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('disables summarize button when streaming (disabled=true)', () => {
    render(<MessageActionBar role="user" content="test" onSummarize={vi.fn()} disabled />);

    const summarizeBtn = screen.getByRole('button', { name: /summarize|요약/i });
    expect(summarizeBtn).toBeDisabled();
  });

  it('calls onSummarize when summarize button is clicked', () => {
    const onSummarize = vi.fn();
    render(<MessageActionBar role="user" content="test" onSummarize={onSummarize} />);

    fireEvent.click(screen.getByRole('button', { name: /summarize|요약/i }));
    expect(onSummarize).toHaveBeenCalledTimes(1);
  });

  it('shows spinner when isSummarizing is true', () => {
    render(<MessageActionBar role="user" content="test" onSummarize={vi.fn()} isSummarizing />);

    const summarizeBtn = screen.getByRole('button', { name: /generating|생성 중/i });
    expect(summarizeBtn).toBeInTheDocument();
  });

  // Story 25.11: Fork button tests
  it('shows fork button for assistant messages when onFork provided', () => {
    render(<MessageActionBar role="assistant" content="test" onFork={vi.fn()} />);

    expect(screen.getByRole('button', { name: /fork|포크/i })).toBeInTheDocument();
  });

  it('hides fork button for user messages', () => {
    render(<MessageActionBar role="user" content="test" onFork={vi.fn()} />);

    // Only copy button — no fork (fork is assistant-only)
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('hides fork button for optimistic assistant messages', () => {
    render(<MessageActionBar role="assistant" content="test" onFork={vi.fn()} isOptimistic />);

    // Only copy button — no fork
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('disables fork button when actionsLocked', () => {
    render(<MessageActionBar role="assistant" content="test" onFork={vi.fn()} actionsLocked />);

    const forkBtn = screen.getByRole('button', { name: /fork|포크/i });
    expect(forkBtn).toBeDisabled();
  });

  it('calls onFork when fork button is clicked', () => {
    const onFork = vi.fn();
    render(<MessageActionBar role="assistant" content="test" onFork={onFork} />);

    fireEvent.click(screen.getByRole('button', { name: /fork|포크/i }));
    expect(onFork).toHaveBeenCalledTimes(1);
  });

  it('does not show fork button when onFork is undefined', () => {
    render(<MessageActionBar role="assistant" content="test" />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1); // copy only
  });
});
