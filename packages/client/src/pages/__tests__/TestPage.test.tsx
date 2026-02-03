/**
 * TestPage Component Tests
 * Story 1.5: End-to-End Test Page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestPage } from '../TestPage';
import { createMockSocket } from '../../test-utils/mockSocket';

// Mock the hooks
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connectionStatus: 'connected',
    reconnectAttempt: 0,
    lastError: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: true,
    isReconnecting: false,
  })),
}));

vi.mock('../../hooks/useChatMessages', () => ({
  useChatMessages: vi.fn(() => ({
    messages: [],
    streamingContent: '',
    isStreaming: false,
    lastError: null,
    sendMessage: vi.fn(),
    clearError: vi.fn(),
    clearMessages: vi.fn(),
  })),
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  })),
}));

vi.mock('../../services/socket', () => ({
  getSocket: vi.fn(() => createMockSocket()),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('TestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('');
  });

  describe('Layout', () => {
    it('should render header with title', () => {
      render(<TestPage />);

      expect(screen.getByText('BMad Studio - E2E Test')).toBeInTheDocument();
    });

    it('should render connection status indicator', () => {
      render(<TestPage />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should render theme toggle button', () => {
      render(<TestPage />);

      const themeButton = screen.getByRole('button', { name: /테마 전환/i });
      expect(themeButton).toBeInTheDocument();
    });

    it('should render project path input', () => {
      render(<TestPage />);

      expect(screen.getByLabelText(/프로젝트 경로 입력/i)).toBeInTheDocument();
    });

    it('should render Set button for project path', () => {
      render(<TestPage />);

      expect(screen.getByRole('button', { name: 'Set' })).toBeInTheDocument();
    });

    it('should render message input', () => {
      render(<TestPage />);

      expect(screen.getByLabelText(/메시지 입력/i)).toBeInTheDocument();
    });

    it('should render Send button', () => {
      render(<TestPage />);

      expect(screen.getByRole('button', { name: /메시지 전송/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on project path input', () => {
      render(<TestPage />);

      const input = screen.getByLabelText(/프로젝트 경로 입력/i);
      expect(input).toHaveAttribute('aria-label', '프로젝트 경로 입력');
    });

    it('should have aria-label on message input', () => {
      render(<TestPage />);

      const textarea = screen.getByLabelText(/메시지 입력/i);
      expect(textarea).toHaveAttribute('aria-label', '메시지 입력');
    });

    it('should have aria-label on send button', () => {
      render(<TestPage />);

      const button = screen.getByRole('button', { name: /메시지 전송/i });
      expect(button).toHaveAttribute('aria-label', '메시지 전송');
    });

    it('should have aria-label on theme toggle button', () => {
      render(<TestPage />);

      const button = screen.getByRole('button', { name: /테마 전환/i });
      expect(button).toHaveAttribute('aria-label', '테마 전환');
    });

    it('should have role="log" on messages area', () => {
      render(<TestPage />);

      expect(screen.getByRole('log')).toBeInTheDocument();
    });

    it('should have aria-live="polite" on messages area', () => {
      render(<TestPage />);

      const messagesArea = screen.getByRole('log');
      expect(messagesArea).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Project Path', () => {
    it('should update input value when typing', () => {
      render(<TestPage />);

      const input = screen.getByLabelText(/프로젝트 경로 입력/i);
      fireEvent.change(input, { target: { value: '/test/path' } });

      expect(input).toHaveValue('/test/path');
    });

    it('should save to localStorage when Set button is clicked', () => {
      render(<TestPage />);

      const input = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });

      fireEvent.change(input, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'bmad-studio-test-project-path',
        '/test/path'
      );
    });

    it('should display current path after setting', () => {
      render(<TestPage />);

      const input = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });

      fireEvent.change(input, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      expect(screen.getByText('Current:')).toBeInTheDocument();
      expect(screen.getByText('/test/path')).toBeInTheDocument();
    });
  });

  describe('Message Input', () => {
    it('should be disabled when project path is not set', () => {
      render(<TestPage />);

      const textarea = screen.getByLabelText(/메시지 입력/i);
      expect(textarea).toBeDisabled();
    });

    it('should be enabled when project path is set', () => {
      render(<TestPage />);

      const input = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });

      fireEvent.change(input, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      const textarea = screen.getByLabelText(/메시지 입력/i);
      expect(textarea).not.toBeDisabled();
    });

    it('should update value when typing', () => {
      render(<TestPage />);

      // Set project path first
      const pathInput = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });
      fireEvent.change(pathInput, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      const textarea = screen.getByLabelText(/메시지 입력/i);
      fireEvent.change(textarea, { target: { value: 'Hello Claude' } });

      expect(textarea).toHaveValue('Hello Claude');
    });
  });

  describe('Send Button', () => {
    it('should be disabled when project path is not set', () => {
      render(<TestPage />);

      const button = screen.getByRole('button', { name: /메시지 전송/i });
      expect(button).toBeDisabled();
    });

    it('should be disabled when message is empty', () => {
      render(<TestPage />);

      // Set project path
      const pathInput = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });
      fireEvent.change(pathInput, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      const sendButton = screen.getByRole('button', { name: /메시지 전송/i });
      expect(sendButton).toBeDisabled();
    });

    it('should be enabled when project path and message are set', () => {
      render(<TestPage />);

      // Set project path
      const pathInput = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });
      fireEvent.change(pathInput, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      // Type message
      const textarea = screen.getByLabelText(/메시지 입력/i);
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByRole('button', { name: /메시지 전송/i });
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('Theme Toggle', () => {
    it('should show moon icon in light mode', async () => {
      const { useTheme } = await import('../../hooks/useTheme');
      vi.mocked(useTheme).mockReturnValue({
        theme: 'light',
        toggleTheme: vi.fn(),
        setTheme: vi.fn(),
      });

      render(<TestPage />);

      const button = screen.getByRole('button', { name: /테마 전환/i });
      expect(button).toHaveTextContent('🌙');
    });

    it('should show sun icon in dark mode', async () => {
      const { useTheme } = await import('../../hooks/useTheme');
      vi.mocked(useTheme).mockReturnValue({
        theme: 'dark',
        toggleTheme: vi.fn(),
        setTheme: vi.fn(),
      });

      render(<TestPage />);

      const button = screen.getByRole('button', { name: /테마 전환/i });
      expect(button).toHaveTextContent('☀️');
    });

    it('should call toggleTheme when clicked', async () => {
      const mockToggleTheme = vi.fn();
      const { useTheme } = await import('../../hooks/useTheme');
      vi.mocked(useTheme).mockReturnValue({
        theme: 'light',
        toggleTheme: mockToggleTheme,
        setTheme: vi.fn(),
      });

      render(<TestPage />);

      const button = screen.getByRole('button', { name: /테마 전환/i });
      fireEvent.click(button);

      expect(mockToggleTheme).toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('should show empty state message when no messages', () => {
      render(<TestPage />);

      expect(
        screen.getByText('프로젝트 경로를 설정하고 메시지를 보내보세요.')
      ).toBeInTheDocument();
    });
  });

  describe('Streaming State', () => {
    it('should disable input and show streaming indicator when streaming', async () => {
      const { useChatMessages } = await import('../../hooks/useChatMessages');
      vi.mocked(useChatMessages).mockReturnValue({
        messages: [],
        streamingContent: 'Streaming content...',
        isStreaming: true,
        lastError: null,
        sendMessage: vi.fn(),
        clearError: vi.fn(),
        clearMessages: vi.fn(),
      });

      render(<TestPage />);

      // Set project path to enable input first
      const pathInput = screen.getByLabelText(/프로젝트 경로 입력/i);
      const setButton = screen.getByRole('button', { name: 'Set' });
      fireEvent.change(pathInput, { target: { value: '/test/path' } });
      fireEvent.click(setButton);

      const textarea = screen.getByLabelText(/메시지 입력/i);
      expect(textarea).toBeDisabled();
      expect(textarea).toHaveAttribute('placeholder', 'Streaming...');
    });
  });

  describe('Error Display', () => {
    it('should show error banner when there is an error', async () => {
      const mockClearError = vi.fn();
      const { useChatMessages } = await import('../../hooks/useChatMessages');
      vi.mocked(useChatMessages).mockReturnValue({
        messages: [],
        streamingContent: '',
        isStreaming: false,
        lastError: { code: 'TEST_ERROR', message: 'Test error message' },
        sendMessage: vi.fn(),
        clearError: mockClearError,
        clearMessages: vi.fn(),
      });

      render(<TestPage />);

      expect(screen.getByText('[TEST_ERROR]')).toBeInTheDocument();
      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('should have close button that calls clearError', async () => {
      const mockClearError = vi.fn();
      const { useChatMessages } = await import('../../hooks/useChatMessages');
      vi.mocked(useChatMessages).mockReturnValue({
        messages: [],
        streamingContent: '',
        isStreaming: false,
        lastError: { code: 'TEST_ERROR', message: 'Test error message' },
        sendMessage: vi.fn(),
        clearError: mockClearError,
        clearMessages: vi.fn(),
      });

      render(<TestPage />);

      const closeButton = screen.getByRole('button', { name: /에러 닫기/i });
      fireEvent.click(closeButton);

      expect(mockClearError).toHaveBeenCalled();
    });

    it('should have role="alert" on error banner', async () => {
      const { useChatMessages } = await import('../../hooks/useChatMessages');
      vi.mocked(useChatMessages).mockReturnValue({
        messages: [],
        streamingContent: '',
        isStreaming: false,
        lastError: { code: 'TEST_ERROR', message: 'Test error message' },
        sendMessage: vi.fn(),
        clearError: vi.fn(),
        clearMessages: vi.fn(),
      });

      render(<TestPage />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
