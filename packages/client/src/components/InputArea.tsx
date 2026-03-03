/**
 * InputArea Component
 * Bottom-fixed input area for chat messages
 * [Source: Story 4.1 - Task 4]
 */

import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface InputAreaProps {
  /** Child elements to render (input field, buttons, etc.) */
  children?: ReactNode;
  /** Whether the input is disabled */
  disabled?: boolean;
}

export function InputArea({ children, disabled = false }: InputAreaProps) {
  const { t } = useTranslation('chat');
  return (
    <footer
      aria-label={t('inputArea.ariaLabel')}
      data-testid="input-area"
      className={`flex-shrink-0 border-t border-gray-200 dark:border-gray-700
                  bg-[#fbfbfc] dark:bg-[#151d2c]
                  pb-[max(0.25rem,env(safe-area-inset-bottom))]
                  overscroll-contain
                  ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="content-container px-4 pt-[10px] pb-1">
      {children || (
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
          {t('inputArea.placeholder')}
        </div>
      )}
      </div>
    </footer>
  );
}
