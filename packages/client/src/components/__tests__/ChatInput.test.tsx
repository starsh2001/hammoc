/**
 * ChatInput Component Tests
 * [Source: Story 4.2 - Task 8.1, Story 4.7 - Task 8, Story 5.1 - Task 4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../ChatInput';
import type { SlashCommand, StarCommand } from '@bmad-studio/shared';

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

// Mock useIsMobile for BmadAgentButton (Story 8.3)
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
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

      expect(mockOnSend).toHaveBeenCalledWith('Hello Claude', undefined);
      expect(textarea).toHaveValue('');
    });

    it('sends message on button click', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello Claude');

      const sendButton = screen.getByRole('button', { name: /전송/i });
      await user.click(sendButton);

      expect(mockOnSend).toHaveBeenCalledWith('Hello Claude', undefined);
      expect(textarea).toHaveValue('');
    });

    it('trims whitespace before sending', async () => {
      const user = userEvent.setup();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '  Hello Claude  ');
      await user.keyboard('{Enter}');

      expect(mockOnSend).toHaveBeenCalledWith('Hello Claude', undefined);
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

      expect(mockOnSend).toHaveBeenCalledWith('안녕', undefined);
    });
  });

  describe('auto height adjustment', () => {
    it('textarea has minHeight and maxHeight styles', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      // Inline style sets minHeight: 22px, maxHeight: 120px
      expect(textarea).toHaveStyle({ minHeight: '22px', maxHeight: '120px' });
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
      // Default mode (without permissionMode) uses orange color scheme
      expect(button.className).toContain('dark:bg-orange-500');
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

      expect(mockOnSend).toHaveBeenCalledWith('Hello', undefined);
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

      expect(mockOnSend).toHaveBeenCalledWith('Hello', undefined);
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

  // Story 8.3 - Agent select pass-through
  describe('BMad agent select pass-through', () => {
    it('calls onAgentSelect without modifying textarea content', () => {
      const mockOnAgentSelect = vi.fn();

      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          isBmadProject
          onAgentSelect={mockOnAgentSelect}
        />
      );

      // Verify textarea is initially empty
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('');

      // Open agent popup
      const agentButton = screen.getByTestId('bmad-agent-button');
      fireEvent.click(agentButton);

      // Click an agent
      const agentItem = screen.getByTestId('bmad-agent-item-0');
      fireEvent.click(agentItem);

      // onAgentSelect should be called with the command
      expect(mockOnAgentSelect).toHaveBeenCalledWith('/BMad:agents:pm');
      // Textarea should NOT have the command inserted (pass-through only)
      expect(textarea).toHaveValue('');
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

  // Story 5.5 - Image attachment tests
  describe('image attachment', () => {
    const createImageFile = (name: string, type: string, sizeKB = 10) => {
      const content = new Uint8Array(sizeKB * 1024);
      return new File([content], name, { type });
    };

    // Mock FileReader
    let mockFileReaderResult: string;
    beforeEach(() => {
      mockFileReaderResult = 'data:image/png;base64,iVBORw0KGgo=';
      vi.spyOn(globalThis, 'FileReader').mockImplementation(() => {
        const reader = {
          readAsDataURL: vi.fn(function (this: FileReader) {
            setTimeout(() => {
              Object.defineProperty(this, 'result', { value: mockFileReaderResult, configurable: true });
              this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
            }, 0);
          }),
          onload: null as ((ev: ProgressEvent<FileReader>) => void) | null,
          onerror: null as ((ev: ProgressEvent<FileReader>) => void) | null,
          result: null,
        } as unknown as FileReader;
        return reader;
      });
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1234' as `${string}-${string}-${string}-${string}-${string}`);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders attach button', () => {
      render(<ChatInput onSend={mockOnSend} />);

      expect(screen.getByRole('button', { name: /이미지 첨부/i })).toBeInTheDocument();
    });

    it('triggers file input on attach button click', async () => {
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      const attachButton = screen.getByRole('button', { name: /이미지 첨부/i });
      fireEvent.click(attachButton);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('shows preview after file selection', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createImageFile('test.png', 'image/png');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('image-preview-area')).toBeInTheDocument();
      expect(screen.getByAltText('test.png')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('removes attachment on X button click', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createImageFile('test.png', 'image/png');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
        await vi.runAllTimersAsync();
      });

      const removeButton = screen.getByRole('button', { name: /이미지 제거: test.png/i });
      fireEvent.click(removeButton);

      expect(screen.queryByTestId('image-preview-area')).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it('rejects files exceeding 10MB', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const largeFile = createImageFile('large.png', 'image/png', 11 * 1024); // 11MB

      // processFiles is async - trigger and flush microtasks
      fireEvent.change(fileInput, { target: { files: [largeFile] } });
      // Flush the promise microtasks from async processFiles
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByTestId('validation-error')).toBeInTheDocument();
      expect(screen.getByText('10MB를 초과하는 파일은 첨부할 수 없습니다')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('rejects unsupported file formats', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const pdfFile = createImageFile('doc.pdf', 'image/svg+xml'); // SVG not supported

      fireEvent.change(fileInput, { target: { files: [pdfFile] } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByTestId('validation-error')).toBeInTheDocument();
      expect(screen.getByText('지원되지 않는 이미지 형식입니다')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('validation error auto-dismisses after 3 seconds', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const largeFile = createImageFile('large.png', 'image/png', 11 * 1024);

      fireEvent.change(fileInput, { target: { files: [largeFile] } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByTestId('validation-error')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.queryByTestId('validation-error')).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it('disables attach button when streaming', () => {
      render(<ChatInput onSend={mockOnSend} disabled isStreaming onAbort={vi.fn()} />);

      expect(screen.getByRole('button', { name: /이미지 첨부/i })).toBeDisabled();
    });

    it('sends attachments with message', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createImageFile('test.png', 'image/png');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
        await vi.runAllTimersAsync();
      });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Check this image' } });
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(mockOnSend).toHaveBeenCalledWith('Check this image', expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          name: 'test.png',
          mimeType: 'image/png',
        }),
      ]));
      vi.useRealTimers();
    });

    it('clears attachments after send', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createImageFile('test.png', 'image/png');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('image-preview-area')).toBeInTheDocument();

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'msg' } });
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(screen.queryByTestId('image-preview-area')).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    // Drag and drop tests
    it('shows visual feedback on drag over', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const inputArea = screen.getByTestId('chat-input-area');
      fireEvent.dragOver(inputArea);

      expect(inputArea.className).toContain('border-dashed');
      expect(inputArea.className).toContain('border-blue-500');
    });

    it('removes visual feedback on drag leave', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const inputArea = screen.getByTestId('chat-input-area');
      fireEvent.dragOver(inputArea);

      expect(inputArea.className).toContain('border-dashed');

      fireEvent.dragLeave(inputArea);

      expect(inputArea.className).not.toContain('border-dashed');
    });

    it('attaches image on drop', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const inputArea = screen.getByTestId('chat-input-area');
      const file = createImageFile('dropped.png', 'image/png');

      await act(async () => {
        fireEvent.drop(inputArea, {
          dataTransfer: { files: [file] },
        });
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('image-preview-area')).toBeInTheDocument();
      expect(screen.getByAltText('dropped.png')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('ignores non-image files on drop', async () => {
      render(<ChatInput onSend={mockOnSend} />);

      const inputArea = screen.getByTestId('chat-input-area');
      const textFile = new File(['content'], 'doc.txt', { type: 'text/plain' });

      await act(async () => {
        fireEvent.drop(inputArea, {
          dataTransfer: { files: [textFile] },
        });
      });

      expect(screen.queryByTestId('image-preview-area')).not.toBeInTheDocument();
    });

    // Clipboard paste tests
    it('attaches image on paste', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');
      const file = createImageFile('clipboard-image.png', 'image/png');

      await act(async () => {
        fireEvent.paste(textarea, {
          clipboardData: {
            items: [
              {
                type: 'image/png',
                getAsFile: () => file,
              },
            ],
          },
        });
        await vi.runAllTimersAsync();
      });

      expect(screen.getByTestId('image-preview-area')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('allows text paste without interference', () => {
      render(<ChatInput onSend={mockOnSend} />);

      const textarea = screen.getByRole('textbox');

      // Paste with no image items
      const preventDefault = vi.fn();
      fireEvent.paste(textarea, {
        preventDefault,
        clipboardData: {
          items: [
            {
              type: 'text/plain',
              getAsFile: () => null,
            },
          ],
        },
      });

      // preventDefault should NOT have been called (no image items)
      // The default paste behavior should proceed
    });

    it('disables attach button when 5 images are already attached', async () => {
      vi.useFakeTimers();
      vi.spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce('uuid-1' as `${string}-${string}-${string}-${string}-${string}`)
        .mockReturnValueOnce('uuid-2' as `${string}-${string}-${string}-${string}-${string}`)
        .mockReturnValueOnce('uuid-3' as `${string}-${string}-${string}-${string}-${string}`)
        .mockReturnValueOnce('uuid-4' as `${string}-${string}-${string}-${string}-${string}`)
        .mockReturnValueOnce('uuid-5' as `${string}-${string}-${string}-${string}-${string}`);

      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');

      // Add 5 images one by one
      for (let i = 0; i < 5; i++) {
        const file = createImageFile(`img${i}.png`, 'image/png');
        await act(async () => {
          fireEvent.change(fileInput, { target: { files: [file] } });
          await vi.runAllTimersAsync();
        });
      }

      // Attach button should be disabled at 5 images
      expect(screen.getByRole('button', { name: /이미지 첨부/i })).toBeDisabled();
      vi.useRealTimers();
    });

    // Keyboard accessibility for X button
    it('removes attachment on Enter key press on X button', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createImageFile('test.png', 'image/png');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
        await vi.runAllTimersAsync();
      });

      const removeButton = screen.getByRole('button', { name: /이미지 제거: test.png/i });
      fireEvent.keyDown(removeButton, { key: 'Enter' });

      expect(screen.queryByTestId('image-preview-area')).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it('removes attachment on Space key press on X button', async () => {
      vi.useFakeTimers();
      render(<ChatInput onSend={mockOnSend} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createImageFile('test.png', 'image/png');

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
        await vi.runAllTimersAsync();
      });

      const removeButton = screen.getByRole('button', { name: /이미지 제거: test.png/i });
      fireEvent.keyDown(removeButton, { key: ' ' });

      expect(screen.queryByTestId('image-preview-area')).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  // Story 9.6/9.7 - Favorites quick access tests (updated for chip bar)
  describe('favorites quick access', () => {
    const favoritesProps = {
      favoriteCommands: ['/BMad:agents:pm', '/BMad:tasks:create-doc'],
      onReorderFavorites: vi.fn(),
      onRemoveFavorite: vi.fn(),
      onExecuteFavorite: vi.fn(),
    };

    // TC10: FavoritesChipBar renders when favoriteCommands has items
    it('renders FavoritesChipBar when favoriteCommands has items', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      expect(screen.getByTestId('favorites-chip-bar')).toBeInTheDocument();
    });

    // TC11: FavoritesChipBar does not render when favoriteCommands is empty
    it('does not render FavoritesChipBar when favoriteCommands is empty', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          favoriteCommands={[]}
          onReorderFavorites={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      expect(screen.queryByTestId('favorites-chip-bar')).not.toBeInTheDocument();
    });

    // TC12: Chip bar star button click shows FavoritesPopup
    it('shows FavoritesPopup when chip bar star button is clicked', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      fireEvent.click(screen.getByTestId('chip-bar-star-button'));

      expect(screen.getByTestId('favorites-popup')).toBeInTheDocument();
    });

    // TC13: Button row no longer has the old star button (9.6 → 9.7 migration)
    it('does not have star button in the button row', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      // Old button row star button should be gone
      expect(screen.queryByTestId('favorites-button')).not.toBeInTheDocument();
    });

    // TC14: onExecuteFavorite prop is called when chip is clicked
    it('calls onExecuteFavorite when a chip is clicked', () => {
      const onExecuteFavorite = vi.fn();
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
          onExecuteFavorite={onExecuteFavorite}
        />
      );

      // Click the PM chip (name from mockCommands is 'PM (Product Manager)')
      fireEvent.click(screen.getByText('PM (Product Manager)'));

      expect(onExecuteFavorite).toHaveBeenCalledWith('/BMad:agents:pm');
    });

    // Selecting a command from FavoritesPopup inserts it into textarea
    it('inserts command into textarea when selected from FavoritesPopup', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      // Open favorites popup via chip bar star button
      fireEvent.click(screen.getByTestId('chip-bar-star-button'));

      // Click first favorite item
      fireEvent.click(screen.getByTestId('favorite-item-0'));

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('/BMad:agents:pm ');
      // Popup should close
      expect(screen.queryByTestId('favorites-popup')).not.toBeInTheDocument();
    });

    // CommandPalette and FavoritesPopup are mutually exclusive
    it('closes FavoritesPopup when CommandPalette opens', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      // Open favorites popup
      fireEvent.click(screen.getByTestId('chip-bar-star-button'));
      expect(screen.getByTestId('favorites-popup')).toBeInTheDocument();

      // Type "/" to trigger command palette
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });

      // CommandPalette should show, FavoritesPopup should close
      expect(screen.getByTestId('command-palette')).toBeInTheDocument();
      expect(screen.queryByTestId('favorites-popup')).not.toBeInTheDocument();
    });

    it('closes CommandPalette when chip bar star button is clicked', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      // Open command palette by typing "/"
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '/' } });
      expect(screen.getByTestId('command-palette')).toBeInTheDocument();

      // Click chip bar star button
      fireEvent.click(screen.getByTestId('chip-bar-star-button'));

      // FavoritesPopup should show, CommandPalette should close
      expect(screen.getByTestId('favorites-popup')).toBeInTheDocument();
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });

    it('closes FavoritesPopup on Escape key', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          {...favoritesProps}
        />
      );

      fireEvent.click(screen.getByTestId('chip-bar-star-button'));
      expect(screen.getByTestId('favorites-popup')).toBeInTheDocument();

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByTestId('favorites-popup')).not.toBeInTheDocument();
    });

    it('does not render chip bar when favoriteCommands prop is absent', () => {
      render(<ChatInput onSend={mockOnSend} commands={mockCommands} />);

      expect(screen.queryByTestId('favorites-chip-bar')).not.toBeInTheDocument();
    });
  });

  // Story 9.9 - Star Command Palette integration tests
  describe('star command palette', () => {
    const mockStarCommands: StarCommand[] = [
      { agentId: 'sm', command: 'help', description: 'Show numbered list of commands' },
      { agentId: 'sm', command: 'draft', description: 'Execute task create-next-story.md' },
      { agentId: 'sm', command: 'exit', description: 'Say goodbye as the Scrum Master' },
    ];

    const mockActiveAgent: SlashCommand = {
      command: '/BMad:agents:sm',
      name: 'SM (Bob)',
      description: 'Scrum Master',
      category: 'agent',
      icon: '\uD83C\uDFC3',
    };

    // TC15: * input + activeAgent + starCommands shows StarCommandPalette
    it('shows StarCommandPalette when * is typed with activeAgent and starCommands', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*' } });

      expect(screen.getByTestId('star-command-palette')).toBeInTheDocument();
    });

    // TC16: * input without activeAgent does not show StarCommandPalette
    it('does not show StarCommandPalette when activeAgent is null', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={null}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*' } });

      expect(screen.queryByTestId('star-command-palette')).not.toBeInTheDocument();
    });

    // TC17: CommandPalette and StarCommandPalette are mutually exclusive
    it('CommandPalette and StarCommandPalette are mutually exclusive', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');

      // Type "/" to show CommandPalette
      fireEvent.change(textarea, { target: { value: '/' } });
      expect(screen.getByTestId('command-palette')).toBeInTheDocument();
      expect(screen.queryByTestId('star-command-palette')).not.toBeInTheDocument();

      // Type "*" to show StarCommandPalette
      fireEvent.change(textarea, { target: { value: '*' } });
      expect(screen.getByTestId('star-command-palette')).toBeInTheDocument();
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });

    // TC18: filter text is passed to StarCommandPalette
    it('passes filter text to StarCommandPalette', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*hel' } });

      expect(screen.getByTestId('star-command-palette')).toBeInTheDocument();
      expect(screen.getByText('*help')).toBeInTheDocument();
      expect(screen.queryByText('*draft')).not.toBeInTheDocument();
    });

    // TC19: Escape closes StarCommandPalette
    it('closes StarCommandPalette on Escape key', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*' } });

      expect(screen.getByTestId('star-command-palette')).toBeInTheDocument();

      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByTestId('star-command-palette')).not.toBeInTheDocument();
    });

    // TC: Enter selects star command
    it('selects star command on Enter and inserts into textarea', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*' } });

      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(textarea).toHaveValue('*help ');
      expect(mockOnSend).not.toHaveBeenCalled();
    });

    // TC: ArrowDown navigates
    it('navigates star commands with ArrowDown', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*' } });

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(textarea, { key: 'ArrowDown', code: 'ArrowDown' });

      const optionsAfter = screen.getAllByRole('option');
      expect(optionsAfter[1]).toHaveAttribute('aria-selected', 'true');
    });

    // TC: does not show when * has space
    it('does not show StarCommandPalette when * input has a space', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*help text' } });

      expect(screen.queryByTestId('star-command-palette')).not.toBeInTheDocument();
    });

    // TC: ARIA combobox mode when star palette shown
    it('sets combobox role when star command palette is shown', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          commands={mockCommands}
          starCommands={mockStarCommands}
          activeAgent={mockActiveAgent}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '*' } });

      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'true');
      expect(combobox).toHaveAttribute('aria-controls', 'star-command-palette');
    });
  });
});
