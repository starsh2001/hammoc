/**
 * InputArea Component
 * Bottom-fixed input area for chat messages
 * [Source: Story 4.1 - Task 4]
 */

import { type ReactNode } from 'react';

interface InputAreaProps {
  /** Child elements to render (input field, buttons, etc.) */
  children?: ReactNode;
  /** Whether the input is disabled */
  disabled?: boolean;
}

export function InputArea({ children, disabled = false }: InputAreaProps) {
  return (
    <footer
      aria-label="메시지 입력"
      data-testid="input-area"
      className={`flex-shrink-0 border-t border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-800 p-4
                  pb-[max(1rem,env(safe-area-inset-bottom))]
                  ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {children || (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
          메시지 입력은 Story 4.2에서 구현됩니다.
        </div>
      )}
    </footer>
  );
}
