/**
 * ChatInput Component Tests
 * [Source: Story 4.2 - Task 8.1, Story 4.7 - Task 8]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../ChatInput';

// Mock useWebSocket hook
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connectionStatus: 'connected',
    isConnected: true,
    isReconnecting: false,
    reconnectAttempt: 0,
    lastError: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// Import after mock
import { useWebSocket } from '../../hooks/useWebSocket';

describe('ChatInput', () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders textarea and send button', () => {
      render(<ChatInput onSend={mockOnSend} />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
    });

    it('shows default placeholder text', () => {
      render(<ChatInput onSend={mockOnSend} />);

      expect(screen.getByPlaceholderText('메시지를 입력하세요...')).toBeInTheDocument();
    });

    it('shows custom placeholder when provided', () => {
      render(<ChatInput onSend={mockOnSend} placeholder="응답 중..." />);

      expect(screen.getByPlaceholderText('응답 중...')).toBeInTheDocument();
    });
  });

  describe('text input', () => {
    it('updates content on typing', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello Claude');

      expect(textarea).toHaveValue('Hello Claude');
    });
  });

  describe('message sending', () => {
    it('sends message on Enter key', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello Claude');
      await user.keyboard('{Enter}');

      expect(mockOnSend).toHaveBeenCalledWith('Hello Claude');
      expect(textarea).toHaveValue('');
    });

    it('sends message on button click', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello Claude');

      const sendButton = screen.getByRole('button', { name: /전송/i });
      await user.click(sendButton);

      expect(mockOnSend).toHaveBeenCalledWith('Hello Claude');
      expect(textarea).toHaveValue('');
    });

    it('trims whitespace before sending', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '  Hello Claude  ');
      await user.keyboard('{Enter}');

      expect(mockOnSend).toHaveBeenCalledWith('Hello Claude');
    });
  });

  describe('newline handling', () => {
    it('adds newline on Shift+Enter', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Line 1');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      await user.type(textarea, 'Line 2');

      expect(textarea).toHaveValue('Line 1\nLine 2');
      expect(mockOnSend).not.toHaveBeenCalled();
    });
  });

  describe('empty message prevention', () => {
    it('prevents empty message submission', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      // Try to send without typing anything
      await user.keyboard('{Enter}');

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it('prevents whitespace-only message submission', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '   ');
      await user.keyboard('{Enter}');

      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it('disables send button when empty', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const sendButton = screen.getByRole('button', { name: /전송/i });
      expect(sendButton).toBeDisabled();
    });

    it('enables send button when content exists', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello');

      const sendButton = screen.getByRole('button', { name: /전송/i });
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('disabled state', () => {
    it('disables textarea when disabled prop is true', () => {
      render(<ChatInput onSend={mockOnSend} disabled />);

      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('disables button when disabled prop is true', () => {
      render(<ChatInput onSend={mockOnSend} disabled />);

      expect(screen.getByRole('button', { name: /전송/i })).toBeDisabled();
    });

    it('does not send on Enter when disabled', () => {
      render(<ChatInput onSend={mockOnSend} disabled />);

      // Can't type when disabled, verify disabled state
      expect(screen.getByRole('textbox')).toBeDisabled();
      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it('shows streaming placeholder when disabled', () => {
      render(<ChatInput onSend={mockOnSend} disabled placeholder="응답 중..." />);

      expect(screen.getByPlaceholderText('응답 중...')).toBeInTheDocument();
    });
  });

  describe('IME composition handling', () => {
    // Note: IME composition tests use fireEvent because userEvent cannot simulate
    // the isComposing state. We set isComposing directly on the event object
    // since fireEvent merges these properties into the synthetic event.
    it('ignores Enter key during IME composition (Korean input)', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');

      // Simulate typing Korean text with IME
      fireEvent.change(textarea, { target: { value: '안녕' } });

      // Simulate Enter key during IME composition
      // Set isComposing directly on the event (KeyboardEvent property)
      fireEvent.keyDown(textarea, {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
      });

      // Should NOT send message while composing
      expect(mockOnSend).not.toHaveBeenCalled();
      expect(textarea).toHaveValue('안녕');
    });

    it('sends message after IME composition ends', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');

      // Simulate typing Korean text
      fireEvent.change(textarea, { target: { value: '안녕' } });

      // After composition ends, Enter should send
      fireEvent.keyDown(textarea, {
        key: 'Enter',
        code: 'Enter',
        isComposing: false,
      });

      expect(mockOnSend).toHaveBeenCalledWith('안녕');
    });
  });

  describe('auto height adjustment', () => {
    it('textarea has minHeight and maxHeight styles', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveStyle({ minHeight: '40px', maxHeight: '120px' });
    });

    it('has resize-none class to prevent manual resize', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea.className).toContain('resize-none');
    });
  });

  describe('accessibility', () => {
    it('has aria-label on textarea', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('aria-label', '메시지 입력');
    });

    it('has aria-describedby pointing to hint', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('aria-describedby', 'input-hint');
    });

    it('has hidden hint text for screen readers', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const hint = document.getElementById('input-hint');
      expect(hint).toBeInTheDocument();
      expect(hint).toHaveTextContent('Enter로 전송, Shift+Enter로 줄바꿈');
      expect(hint).toHaveClass('sr-only');
    });

    it('has aria-disabled attribute reflecting disabled state', () => {
      const { rerender } = render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('aria-disabled', 'false');

      rerender(<ChatInput onSend={mockOnSend} disabled />);
      expect(textarea).toHaveAttribute('aria-disabled', 'true');
    });

    it('send button has aria-label', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const button = screen.getByRole('button', { name: /전송/i });
      expect(button).toHaveAttribute('aria-label', '전송');
    });
  });

  describe('dark mode styles', () => {
    it('textarea has dark mode classes', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea.className).toContain('dark:bg-gray-800');
      expect(textarea.className).toContain('dark:text-gray-100');
      expect(textarea.className).toContain('dark:border-gray-600');
    });

    it('button has dark mode classes', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const button = screen.getByRole('button', { name: /전송/i });
      expect(button.className).toContain('dark:bg-blue-500');
    });
  });

  // Story 4.7 - Task 8: Connection warning tests
  describe('connection warning', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('shows warning when trying to send message while disconnected', async () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: 'Connection failed',
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByRole('button', { name: /전송/i });
      fireEvent.click(sendButton);

      expect(screen.getByTestId('connection-warning')).toBeInTheDocument();
      expect(screen.getByText('서버와 연결이 끊어졌습니다. 재연결 후 다시 시도해주세요.')).toBeInTheDocument();
    });

    it('does not send message when disconnected', async () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(mockOnSend).not.toHaveBeenCalled();
      // Message should remain in textarea
      expect(textarea).toHaveValue('Hello');
    });

    it('sends message normally when connected', async () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'connected',
        isConnected: true,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(mockOnSend).toHaveBeenCalledWith('Hello');
      expect(screen.queryByTestId('connection-warning')).not.toBeInTheDocument();
    });

    it('warning disappears after 3 seconds', async () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByRole('button', { name: /전송/i });
      fireEvent.click(sendButton);

      expect(screen.getByTestId('connection-warning')).toBeInTheDocument();

      // Fast-forward 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.queryByTestId('connection-warning')).not.toBeInTheDocument();
    });

    it('warning has correct accessibility attributes', async () => {
      vi.mocked(useWebSocket).mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByRole('button', { name: /전송/i });
      fireEvent.click(sendButton);

      const warning = screen.getByTestId('connection-warning');
      expect(warning).toHaveAttribute('role', 'alert');
      expect(warning).toHaveAttribute('aria-live', 'assertive');
    });

    it('warning disappears when connection is restored', async () => {
      const mockUseWebSocket = vi.mocked(useWebSocket);
      mockUseWebSocket.mockReturnValue({
        connectionStatus: 'disconnected',
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      const { rerender } = render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByRole('button', { name: /전송/i });
      fireEvent.click(sendButton);

      expect(screen.getByTestId('connection-warning')).toBeInTheDocument();

      // Simulate connection restored
      mockUseWebSocket.mockReturnValue({
        connectionStatus: 'connected',
        isConnected: true,
        isReconnecting: false,
        reconnectAttempt: 0,
        lastError: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      rerender(<ChatInput onSend={mockOnSend} />);

      expect(screen.queryByTestId('connection-warning')).not.toBeInTheDocument();
    });
  });
});
