/**
 * ChatInput Queue Lock Tests
 * [Source: Story 15.4 - Task 5.4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '../ChatInput';

// Mock useChatStore
vi.mock('../../stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ isSessionLocked: false }),
    {
      getState: () => ({ isSessionLocked: false }),
    }
  ),
}));

// Mock useWebSocket
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));

// Mock useClickOutside
vi.mock('../../hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

// Mock usePromptHistory
vi.mock('../../hooks/usePromptHistory', () => ({
  usePromptHistory: () => ({
    addToHistory: vi.fn(),
    navigateUp: vi.fn().mockReturnValue(null),
    navigateDown: vi.fn().mockReturnValue(null),
    resetNavigation: vi.fn(),
    isNavigating: false,
  }),
}));

describe('ChatInput queue lock', () => {
  const defaultProps = {
    onSend: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-QL-27: queueLocked prop disables textarea', () => {
    render(<ChatInput {...defaultProps} queueLocked />);

    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).toBeDisabled();
  });

  it('TC-QL-28: queueLocked shows "큐 러너가 제어 중" placeholder', () => {
    render(<ChatInput {...defaultProps} queueLocked />);

    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).toHaveAttribute('placeholder', '큐 러너가 제어 중');
  });

  it('TC-QL-29: handleSubmit blocked when queueLocked', () => {
    const onSend = vi.fn();
    // Render with queueLocked=false first so we can type text
    const { rerender } = render(<ChatInput onSend={onSend} queueLocked={false} />);

    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    fireEvent.change(textarea, { target: { value: 'test message' } });

    // Now set queueLocked=true and try to submit
    rerender(<ChatInput onSend={onSend} queueLocked />);

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('TC-QL-30: queueLocked=false re-enables textarea', () => {
    const { rerender } = render(<ChatInput {...defaultProps} queueLocked />);

    let textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).toBeDisabled();

    rerender(<ChatInput {...defaultProps} queueLocked={false} />);

    textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).not.toBeDisabled();
  });
});
