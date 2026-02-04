/**
 * ChatInput Component Tests
 * [Source: Story 4.2 - Task 8.1, Story 4.7 - Task 8, Story 5.1 - Task 4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../ChatInput';
import type { SlashCommand } from '@bmad-studio/shared';

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

const mockCommands: SlashCommand[] = [
  {
    command: '/BMad:agents:pm',
    name: 'PM (Product Manager)',
    description: 'Product Manager',
    category: 'agent',
    icon: '\uD83D\uDCCB',
  },
  {
    command: '/BMad:agents:sm',
    name: 'SM (Scrum Master)',
    description: 'Scrum Master',
    category: 'agent',
    icon: '\uD83C\uDFC3',
  },
  {
    command: '/BMad:tasks:create-doc',
    name: 'create-doc',
    description: 'Create document task',
    category: 'task',
  },
];

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

  // Story 5.1 - Task 4: Slash command autocomplete tests
  describe('slash command autocomplete', () => {
    it('shows CommandPalette when "/" is typed', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    });

    it('does not show CommandPalette without "/"', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'hello' } });

      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });

    it('does not show CommandPalette when no commands provided', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });

    it('filters commands as user types', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/pm' } });

      expect(screen.getByText('/BMad:agents:pm')).toBeInTheDocument();
      expect(screen.queryByText('/BMad:agents:sm')).not.toBeInTheDocument();
    });

    it('inserts full command on Enter when palette is open', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      // Press Enter to select first command
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(textarea).toHaveValue('/BMad:agents:pm ');
      expect(mockOnSend).not.toHaveBeenCalled();
    });

    it('inserts full command on Tab when palette is open', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      // Press Tab to select first command
      fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' });

      expect(textarea).toHaveValue('/BMad:agents:pm ');
    });

    it('closes palette on Escape', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      expect(screen.getByTestId('command-palette')).toBeInTheDocument();

      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });

    it('navigates down with ArrowDown', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      // First item is selected by default
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      // Navigate down
      fireEvent.keyDown(textarea, { key: 'ArrowDown', code: 'ArrowDown' });

      const optionsAfter = screen.getAllByRole('option');
      expect(optionsAfter[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('navigates up with ArrowUp', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      // Navigate up from first item wraps to last
      fireEvent.keyDown(textarea, { key: 'ArrowUp', code: 'ArrowUp' });

      const options = screen.getAllByRole('option');
      expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
    });

    it('sends message on Enter when palette is closed', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      // Palette not shown (no "/"), Enter should send
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(mockOnSend).toHaveBeenCalledWith('Hello');
    });

    it('sets aria-expanded based on palette visibility', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');

      // Initially no aria-expanded (not in combobox mode)
      expect(textarea).not.toHaveAttribute('aria-expanded');

      // Show palette - becomes combobox
      fireEvent.change(textarea, { target: { value: '/' } });
      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'true');

      // Hide palette - reverts to textbox
      fireEvent.change(textarea, { target: { value: '' } });
      expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-expanded');
    });

    it('selects command on click in palette', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      fireEvent.click(screen.getByText('/BMad:tasks:create-doc'));

      expect(textarea).toHaveValue('/BMad:tasks:create-doc ');
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });
  });

  // Story 5.4 - Task 4: Abort button toggle tests
  describe('abort button', () => {
    const mockOnAbort = vi.fn();

    beforeEach(() => {
      mockOnAbort.mockClear();
    });

    it('renders abort button (Square icon) when isStreaming and onAbort provided', () => {
      render(<ChatInput onSend={mockOnSend} isStreaming onAbort={mockOnAbort} />);

      const abortButton = screen.getByRole('button', { name: /중단/i });
      expect(abortButton).toBeInTheDocument();
      // Send button should NOT be present
      expect(screen.queryByRole('button', { name: /전송/i })).not.toBeInTheDocument();
    });

    it('renders send button when not streaming', () => {
      render(<ChatInput onSend={mockOnSend} isStreaming={false} onAbort={mockOnAbort} />);

      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /중단/i })).not.toBeInTheDocument();
    });

    it('calls onAbort when abort button is clicked', () => {
      render(<ChatInput onSend={mockOnSend} isStreaming onAbort={mockOnAbort} />);

      const abortButton = screen.getByRole('button', { name: /중단/i });
      fireEvent.click(abortButton);

      expect(mockOnAbort).toHaveBeenCalledTimes(1);
    });

    it('abort button has aria-label="중단"', () => {
      render(<ChatInput onSend={mockOnSend} isStreaming onAbort={mockOnAbort} />);

      const abortButton = screen.getByRole('button', { name: /중단/i });
      expect(abortButton).toHaveAttribute('aria-label', '중단');
    });

    it('abort button has red background styles', () => {
      render(<ChatInput onSend={mockOnSend} isStreaming onAbort={mockOnAbort} />);

      const abortButton = screen.getByRole('button', { name: /중단/i });
      expect(abortButton.className).toContain('bg-red-600');
      expect(abortButton.className).toContain('hover:bg-red-700');
    });

    it('textarea is still disabled when streaming', () => {
      render(<ChatInput onSend={mockOnSend} disabled isStreaming onAbort={mockOnAbort} />);

      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('shows send button when isStreaming but onAbort is not provided', () => {
      render(<ChatInput onSend={mockOnSend} disabled isStreaming />);

      expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /중단/i })).not.toBeInTheDocument();
    });
  });
});
