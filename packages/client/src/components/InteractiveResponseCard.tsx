/**
 * InteractiveResponseCard - Unified interactive response UI
 * Handles both permission requests (approve/deny) and AskUserQuestion (choices)
 * [Source: Story 7.1 - Task 4]
 */

import { useState, useRef } from 'react';
import {
  CheckCircle,
  XCircle,
  Check,
  X,
  Loader2,
  AlertCircle,
  MessageSquare,
  Shield,
} from 'lucide-react';
import type { InteractiveChoice, InteractiveStatus } from '../stores/chatStore';

interface InteractiveResponseCardProps {
  /** Interaction type: permission approval or question response */
  type: 'permission' | 'question';
  /** Tool name for permission requests */
  toolName?: string;
  /** Tool input data */
  toolInput?: Record<string, unknown>;
  /** Available choices */
  choices: InteractiveChoice[];
  /** Whether multiple selections are allowed */
  multiSelect?: boolean;
  /** Current status */
  status: InteractiveStatus;
  /** Response value (for responded/history state) */
  response?: string | string[];
  /** Error message (for error state) */
  errorMessage?: string;
  /** Callback when user responds */
  onRespond?: (approved: boolean, value?: string | string[]) => void;
}

export function InteractiveResponseCard({
  type,
  toolName,
  toolInput,
  choices,
  multiSelect = false,
  status,
  response,
  errorMessage,
  onRespond,
}: InteractiveResponseCardProps) {
  const [selectedChoices, setSelectedChoices] = useState<Set<string>>(new Set());
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState('');
  const otherInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = status === 'responded' || status === 'sending';
  const isWaiting = status === 'waiting';
  const isSending = status === 'sending';
  const isError = status === 'error';
  const isResponded = status === 'responded';

  // Extract question info for AskUserQuestion
  const questions = toolInput?.questions as Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }> | undefined;
  const firstQuestion = questions?.[0];

  const handlePermissionResponse = (approved: boolean) => {
    if (isDisabled) return;
    onRespond?.(approved);
  };

  const handleChoiceClick = (choice: InteractiveChoice) => {
    if (isDisabled) return;

    if (choice.value === '__other__') {
      setShowOtherInput(true);
      setTimeout(() => otherInputRef.current?.focus(), 0);
      return;
    }

    if (multiSelect) {
      setSelectedChoices((prev) => {
        const next = new Set(prev);
        if (next.has(choice.value)) {
          next.delete(choice.value);
        } else {
          next.add(choice.value);
        }
        return next;
      });
    } else {
      onRespond?.(true, choice.value);
    }
  };

  const handleMultiSelectSubmit = () => {
    if (selectedChoices.size === 0 || isDisabled) return;
    onRespond?.(true, Array.from(selectedChoices));
  };

  const handleOtherSubmit = () => {
    const trimmed = otherText.trim();
    if (!trimmed || isDisabled) return;
    onRespond?.(true, trimmed);
  };

  const handleOtherKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleOtherSubmit();
    }
    if (e.key === 'Escape') {
      setShowOtherInput(false);
      setOtherText('');
    }
  };

  // Render response summary for responded state
  const renderResponseSummary = () => {
    if (!isResponded) return null;
    const displayResponse = response;
    const isApproved = type === 'permission'
      ? (typeof displayResponse === 'string' ? displayResponse === '승인됨' : true)
      : true;

    return (
      <div className="flex items-center gap-2 mt-2 text-sm animate-fadeIn" aria-live="polite">
        {type === 'permission' ? (
          isApproved ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
              <span className="text-green-700 dark:text-green-400">승인됨</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
              <span className="text-red-700 dark:text-red-400">거절됨</span>
            </>
          )
        ) : (
          <>
            <CheckCircle className="w-4 h-4 text-blue-500" aria-hidden="true" />
            <span className="text-gray-700 dark:text-gray-300">
              {Array.isArray(displayResponse) ? displayResponse.join(', ') : displayResponse}
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="max-w-[80%] rounded-lg border shadow-sm bg-white dark:bg-gray-800 animate-fadeInUp motion-reduce:animate-none"
      role="group"
      aria-labelledby={`interactive-header-${toolName || 'question'}`}
      data-testid="interactive-response-card"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        {type === 'permission' ? (
          <Shield className="w-4 h-4 text-amber-500" aria-hidden="true" />
        ) : (
          <MessageSquare className="w-4 h-4 text-blue-500" aria-hidden="true" />
        )}
        <span
          id={`interactive-header-${toolName || 'question'}`}
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {type === 'permission'
            ? `권한 요청: ${toolName}`
            : firstQuestion?.header || '질문'}
        </span>
        {isSending && (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin ml-auto" aria-label="전송 중" />
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {/* Description */}
        {type === 'permission' && toolInput && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
            {typeof toolInput.command === 'string'
              ? toolInput.command
              : typeof toolInput.file_path === 'string'
                ? toolInput.file_path
                : JSON.stringify(toolInput).slice(0, 200)}
          </p>
        )}
        {type === 'question' && firstQuestion && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {firstQuestion.question}
          </p>
        )}

        {/* Permission mode: Approve/Reject buttons */}
        {type === 'permission' && !isResponded && (
          <div className="flex gap-2">
            <button
              onClick={() => handlePermissionResponse(true)}
              disabled={isDisabled}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border
                bg-green-50 hover:bg-green-100 text-green-700 border-green-200
                dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-400 dark:border-green-800
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="승인"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-4 h-4" aria-hidden="true" />
              )}
              승인
            </button>
            <button
              onClick={() => handlePermissionResponse(false)}
              disabled={isDisabled}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border
                bg-red-50 hover:bg-red-100 text-red-700 border-red-200
                dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 dark:border-red-800
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="거절"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <X className="w-4 h-4" aria-hidden="true" />
              )}
              거절
            </button>
          </div>
        )}

        {/* Question mode: Choice buttons or checkboxes */}
        {type === 'question' && !isResponded && (
          <div className="space-y-2">
            {multiSelect ? (
              /* Multi-select: checkboxes + submit */
              <>
                <div className="space-y-1.5">
                  {choices.map((choice) => (
                    <label
                      key={choice.value}
                      className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors
                        ${selectedChoices.has(choice.value)
                          ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50'}
                        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChoices.has(choice.value)}
                        onChange={() => handleChoiceClick(choice)}
                        disabled={isDisabled}
                        className="mt-0.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                        aria-label={choice.label}
                      />
                      <div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{choice.label}</span>
                        {choice.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{choice.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleMultiSelectSubmit}
                  disabled={selectedChoices.size === 0 || isDisabled}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md
                    bg-blue-500 hover:bg-blue-600 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="선택 제출"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  )}
                  제출
                </button>
              </>
            ) : (
              /* Single select: buttons */
              <div className="flex flex-wrap gap-2">
                {choices.map((choice) => (
                  <button
                    key={choice.value}
                    onClick={() => handleChoiceClick(choice)}
                    disabled={isDisabled}
                    className="px-3 py-1.5 text-sm rounded-md border
                      border-gray-200 hover:bg-gray-100 text-gray-700
                      dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label={choice.label}
                    title={choice.description}
                  >
                    {choice.label}
                  </button>
                ))}
                {/* "Other" option */}
                <button
                  onClick={() => handleChoiceClick({ label: '기타', value: '__other__' })}
                  disabled={isDisabled}
                  className="px-3 py-1.5 text-sm rounded-md border border-dashed
                    border-gray-300 hover:bg-gray-100 text-gray-500
                    dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-400
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="기타 (직접 입력)"
                >
                  기타...
                </button>
              </div>
            )}

            {/* "Other" text input */}
            {showOtherInput && (
              <div className="flex gap-2 mt-2">
                <input
                  ref={otherInputRef}
                  type="text"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value.slice(0, 1000))}
                  onKeyDown={handleOtherKeyDown}
                  maxLength={1000}
                  placeholder="응답을 입력하세요..."
                  disabled={isDisabled}
                  className="flex-1 px-3 py-1.5 text-sm rounded-md border border-gray-300
                    dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    disabled:opacity-50"
                  aria-label="기타 응답 입력"
                />
                <button
                  onClick={handleOtherSubmit}
                  disabled={!otherText.trim() || isDisabled}
                  className="px-3 py-1.5 text-sm rounded-md bg-blue-500 hover:bg-blue-600 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="기타 응답 제출"
                >
                  전송
                </button>
              </div>
            )}
          </div>
        )}

        {/* Response summary (responded state) */}
        {renderResponseSummary()}

        {/* Error message */}
        {isError && errorMessage && (
          <div className="flex items-center gap-2 mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
