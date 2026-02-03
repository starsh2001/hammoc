/**
 * ChatInput Component - Multiline text input for chat messages
 * [Source: Story 4.2 - Tasks 2-6, Story 4.7 - Task 4]
 *
 * Features:
 * - Auto-resizing textarea (1-5 lines)
 * - Enter to send, Shift+Enter for newline
 * - IME composition handling (Korean input)
 * - Streaming state disable support
 * - Connection status warning (Story 4.7)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

interface ChatInputProps {
  /** Message send callback */
  onSend: (content: string) => void;
  /** Disabled state (during streaming) */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = '메시지를 입력하세요...',
}: ChatInputProps) {
  // Local state
  const [content, setContent] = useState('');
  const [showConnectionWarning, setShowConnectionWarning] = useState(false);
  const [needsScroll, setNeedsScroll] = useState(false);

  // WebSocket connection status
  const { isConnected } = useWebSocket();

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Height adjustment
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to calculate scrollHeight
    textarea.style.height = 'auto';

    // Calculate new height (min: 40px, max: 120px for 5 lines)
    const minHeight = 40;
    const maxHeight = 120; // ~5 lines

    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;

    // Only show scrollbar when content exceeds max height
    setNeedsScroll(scrollHeight > maxHeight);
  }, []);

  // Adjust height on content change
  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Auto-focus on mount (desktop only - skip on touch devices to prevent keyboard popup)
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      // Check if device has coarse pointer (touch) - skip auto-focus on mobile
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
      if (!isTouchDevice) {
        textareaRef.current.focus();
      }
    }
  }, [disabled]);

  // Clear warning timeout on unmount
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  // Hide warning when connection is restored
  useEffect(() => {
    if (isConnected && showConnectionWarning) {
      setShowConnectionWarning(false);
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
    }
  }, [isConnected, showConnectionWarning]);

  // Submit handler
  const handleSubmit = useCallback(() => {
    const trimmedContent = content.trim();
    if (!trimmedContent || disabled) return;

    // Show warning if not connected
    if (!isConnected) {
      setShowConnectionWarning(true);
      // Auto-hide warning after 3 seconds
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      warningTimeoutRef.current = setTimeout(() => {
        setShowConnectionWarning(false);
        warningTimeoutRef.current = null;
      }, 3000);
      return;
    }

    onSend(trimmedContent);
    setContent('');

    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [content, disabled, isConnected, onSend]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ignore Enter during IME composition (Korean input)
      // Check both nativeEvent.isComposing and the event's isComposing property
      const isComposing = e.nativeEvent?.isComposing ?? (e as unknown as KeyboardEvent).isComposing;
      if (isComposing) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      // Shift+Enter: default behavior (newline)
    },
    [handleSubmit]
  );

  // Button click handler
  const handleButtonClick = useCallback(() => {
    handleSubmit();
    // Refocus textarea after sending
    textareaRef.current?.focus();
  }, [handleSubmit]);

  const isButtonDisabled = disabled || !content.trim();

  return (
    <div className="flex flex-col gap-2">
      {/* Connection warning */}
      {showConnectionWarning && (
        <div
          role="alert"
          aria-live="assertive"
          className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-md"
          data-testid="connection-warning"
        >
          서버와 연결이 끊어졌습니다. 재연결 후 다시 시도해주세요.
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            aria-label="메시지 입력"
            aria-describedby="input-hint"
            aria-disabled={disabled}
            rows={1}
            className={`w-full resize-none px-4 py-2
                       bg-white dark:bg-gray-800
                       border border-gray-300 dark:border-gray-600
                       rounded-lg
                       text-gray-900 dark:text-gray-100
                       placeholder-gray-500 dark:placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                       disabled:opacity-50 disabled:cursor-not-allowed
                       ${needsScroll ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <span id="input-hint" className="sr-only">
            Enter로 전송, Shift+Enter로 줄바꿈
          </span>
        </div>

        <button
          type="button"
          onClick={handleButtonClick}
          disabled={isButtonDisabled}
          aria-label="전송"
          className="p-2 rounded-lg flex-shrink-0
                     bg-blue-600 hover:bg-blue-700
                     dark:bg-blue-500 dark:hover:bg-blue-600
                     text-white
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     transition-colors"
          style={{ height: '40px', width: '40px' }}
        >
          <Send size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
