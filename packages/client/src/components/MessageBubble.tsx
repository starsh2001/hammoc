/**
 * MessageBubble - Component for displaying user/assistant messages
 * [Source: Story 3.5 - Task 6, Story 4.3 - Task 1, Story 4.4 - Task 4, Story 25.1 - Task 3]
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistoryMessage } from '@hammoc/shared';
import { formatRelativeTime } from '../utils/formatters';
import { Bot } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActionBar } from './MessageActionBar';
import { MessageEditForm } from './MessageEditForm';
import { BranchPagination } from './BranchPagination';
import { getBaseUuid } from '../utils/messageTree';

export interface EditSubmitParams {
  messageUuid: string;
  parentId?: string;
  newText: string;
}

interface MessageBubbleProps {
  /** Message data */
  message: HistoryMessage;
  /** Whether message is currently streaming - prepared for Story 4.5 */
  isStreaming?: boolean;
  /** Callback when message is copied */
  onCopy?: (content: string) => void;
  /** Timestamp display mode - 'always' (default) or 'hover' */
  timestampMode?: 'always' | 'hover';
  /** Branch info for this message (only shown on user messages) */
  branchInfo?: { total: number; current: number };
  /** Callback for branch navigation */
  onNavigateBranch?: (messageId: string, direction: 'prev' | 'next') => void;
  /** Whether branch navigation buttons should be disabled */
  isBranchNavigationDisabled?: boolean;
  /** Callback when user submits an edited message */
  onEditSubmit?: (params: EditSubmitParams) => void;
  /** Callback when user clicks rewind code button */
  onRewind?: (messageUuid: string) => void;
  /** Whether a rewind operation is in progress */
  isRewinding?: boolean;
}

export function MessageBubble({
  message,
  isStreaming = false,
  onCopy,
  timestampMode = 'always',
  branchInfo,
  onNavigateBranch,
  isBranchNavigationDisabled,
  onEditSubmit,
  onRewind,
  isRewinding = false,
}: MessageBubbleProps) {
  const { t } = useTranslation('chat');
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isUser = message.type === 'user';
  const formattedTime = formatRelativeTime(message.timestamp);

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      role="listitem"
      aria-label={t('messageBubble.ariaLabel', { role: t(isUser ? 'messageBubble.userRole' : 'messageBubble.assistantRole'), time: formattedTime })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative group max-w-[90%] md:max-w-[80%] ${
          isUser
            ? 'bg-blue-100 dark:bg-blue-600 text-gray-900 dark:text-white rounded-l-lg rounded-tr-lg'
            : 'bg-gray-50 dark:bg-[#263240] text-gray-900 dark:text-white rounded-r-lg rounded-tl-lg border border-gray-300 dark:border-[#3a4d5e]'
        } p-3 shadow-sm${isEditing ? ' ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}
      >
        {/* Icon for assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-300">
            <Bot className="w-4 h-4" aria-hidden="true" />
            <span>{t('messageBubble.assistantName')}</span>
          </div>
        )}

        {/* Attached images (user messages only) */}
        {isUser && message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, idx) =>
              img.data ? (
                <img
                  key={`${message.id}-img-${idx}`}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name || t('messageBubble.image', { index: idx + 1 })}
                  className="max-w-[200px] max-h-[150px] rounded object-cover cursor-pointer hover:opacity-90"
                  onClick={() => window.open(`data:${img.mimeType};base64,${img.data}`, '_blank')}
                />
              ) : (
                <div
                  key={`${message.id}-img-${idx}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-500 dark:text-gray-300"
                >
                  <span>📎</span>
                  <span>{t('messageBubble.imageAttached')}</span>
                </div>
              )
            )}
          </div>
        )}

        {/* Message content - plain text for user, markdown for assistant */}
        {isUser && isEditing ? (
          <MessageEditForm
            initialText={message.content}
            onSubmit={(newText) => {
              onEditSubmit?.({
                messageUuid: getBaseUuid(message.id),
                parentId: message.parentId,
                newText,
              });
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          message.content && <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
        )}

        {/* Timestamp */}
        <div
          className={`mt-1 text-xs transition-opacity duration-200 ${
            isUser ? 'text-gray-600 dark:text-blue-200' : 'text-gray-500 dark:text-gray-400'
          } ${timestampMode === 'hover' ? (isHovered ? 'opacity-100' : 'opacity-0') : 'opacity-100'}`}
        >
          {formattedTime}
        </div>

        {/* Bottom bar: branch pagination (left) + action bar (right) */}
        <div className="flex items-center justify-between mt-0.5">
          <div>
            {isUser && branchInfo && onNavigateBranch && (
              <BranchPagination
                messageId={message.id}
                total={branchInfo.total}
                current={branchInfo.current}
                onNavigate={onNavigateBranch}
                disabled={isBranchNavigationDisabled}
              />
            )}
          </div>
          <MessageActionBar
            role={isUser ? 'user' : 'assistant'}
            content={message.content}
            disabled={isStreaming}
            onCopy={onCopy}
            onEdit={onEditSubmit ? () => setIsEditing(true) : undefined}
            isOptimistic={(message as any)._optimistic === true}
            onRewind={(message as any)._optimistic !== true && onRewind ? () => onRewind(getBaseUuid(message.id)) : undefined}
            isRewinding={isRewinding}
          />
        </div>
      </div>
    </div>
  );
}
