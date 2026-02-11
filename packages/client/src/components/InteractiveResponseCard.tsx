/**
 * InteractiveResponseCard - Unified interactive response UI
 * Handles both permission requests (approve/deny) and AskUserQuestion (choices)
 * Supports up to 4 questions with 2-4 options each (SDK spec)
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
import type { InteractiveChoice, InteractiveQuestion, InteractiveStatus } from '../stores/chatStore';

interface InteractiveResponseCardProps {
  /** Interaction type: permission approval or question response */
  type: 'permission' | 'question';
  /** Tool name for permission requests */
  toolName?: string;
  /** Tool input data */
  toolInput?: Record<string, unknown>;
  /** Available choices (for permission or single-question backward compat) */
  choices: InteractiveChoice[];
  /** All questions (for multi-question support) */
  questions?: InteractiveQuestion[];
  /** Whether multiple selections are allowed (single-question backward compat) */
  multiSelect?: boolean;
  /** Current status */
  status: InteractiveStatus;
  /** Response value (for responded/history state) */
  response?: string | string[] | Record<string, string | string[]>;
  /** Error message (for error state) */
  errorMessage?: string;
  /** Callback when user responds */
  onRespond?: (approved: boolean, value?: string | string[] | Record<string, string | string[]>) => void;
}

/** Per-question answer state */
type AnswerMap = Record<number, string | string[]>;

export function InteractiveResponseCard({
  type,
  toolName,
  toolInput,
  choices,
  questions,
  multiSelect = false,
  status,
  response,
  errorMessage,
  onRespond,
}: InteractiveResponseCardProps) {
  // Per-question answers (keyed by question index)
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Per-question multi-select selections (keyed by question index)
  const [multiSelections, setMultiSelections] = useState<Record<number, Set<string>>>({});
  // Other input state: which question index has "Other" open
  const [otherOpenIndex, setOtherOpenIndex] = useState<number | null>(null);
  const [otherText, setOtherText] = useState('');
  const otherInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = status === 'responded' || status === 'sending';
  const isSending = status === 'sending';
  const isError = status === 'error';
  const isResponded = status === 'responded';

  // Resolve question list: use questions prop, or build from legacy single-question props
  const resolvedQuestions: InteractiveQuestion[] = questions && questions.length > 0
    ? questions
    : type === 'question'
      ? [{
          question: (toolInput?.questions as Array<{ question: string }>)?.[0]?.question ?? '',
          header: (toolInput?.questions as Array<{ header: string }>)?.[0]?.header ?? '질문',
          choices,
          multiSelect,
        }]
      : [];

  const isMultiQuestion = resolvedQuestions.length > 1;
  const isSingleQuestion = resolvedQuestions.length === 1;

  // --- Permission handlers ---
  const handlePermissionResponse = (approved: boolean) => {
    if (isDisabled) return;
    onRespond?.(approved);
  };

  // --- Single question handlers (direct submit on click) ---
  const handleSingleChoiceClick = (choice: InteractiveChoice) => {
    if (isDisabled) return;
    if (choice.value === '__other__') {
      setOtherOpenIndex(0);
      setTimeout(() => otherInputRef.current?.focus(), 0);
      return;
    }
    if (resolvedQuestions[0]?.multiSelect) {
      setMultiSelections((prev) => {
        const current = new Set(prev[0] || []);
        if (current.has(choice.value)) current.delete(choice.value);
        else current.add(choice.value);
        return { ...prev, 0: current };
      });
    } else {
      onRespond?.(true, choice.value);
    }
  };

  const handleSingleMultiSubmit = () => {
    const selected = multiSelections[0];
    if (!selected || selected.size === 0 || isDisabled) return;
    onRespond?.(true, Array.from(selected));
  };

  // --- Multi-question handlers ---
  const handleMultiQuestionChoice = (qIndex: number, choice: InteractiveChoice) => {
    if (isDisabled) return;
    if (choice.value === '__other__') {
      setOtherOpenIndex(qIndex);
      setOtherText('');
      setTimeout(() => otherInputRef.current?.focus(), 0);
      return;
    }
    const q = resolvedQuestions[qIndex];
    if (q?.multiSelect) {
      setMultiSelections((prev) => {
        const current = new Set(prev[qIndex] || []);
        if (current.has(choice.value)) current.delete(choice.value);
        else current.add(choice.value);
        return { ...prev, [qIndex]: current };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [qIndex]: choice.value }));
    }
  };

  const handleOtherSubmitForQuestion = (qIndex: number) => {
    const trimmed = otherText.trim();
    if (!trimmed || isDisabled) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: trimmed }));
    setOtherOpenIndex(null);
    setOtherText('');
  };

  const handleOtherKeyDown = (e: React.KeyboardEvent, qIndex: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isSingleQuestion) {
        // Single question: submit directly
        const trimmed = otherText.trim();
        if (trimmed && !isDisabled) onRespond?.(true, trimmed);
      } else {
        handleOtherSubmitForQuestion(qIndex);
      }
    }
    if (e.key === 'Escape') {
      setOtherOpenIndex(null);
      setOtherText('');
    }
  };

  // Check if all multi-questions are answered
  const allMultiQuestionsAnswered = resolvedQuestions.every((q, i) => {
    if (q.multiSelect) {
      return (multiSelections[i]?.size ?? 0) > 0;
    }
    return answers[i] !== undefined;
  });

  const handleMultiQuestionSubmit = () => {
    if (!allMultiQuestionsAnswered || isDisabled) return;
    // Build answer map: question text → answer value
    const answerMap: Record<string, string | string[]> = {};
    resolvedQuestions.forEach((q, i) => {
      if (q.multiSelect) {
        answerMap[q.question] = Array.from(multiSelections[i] || []);
      } else {
        answerMap[q.question] = answers[i] as string;
      }
    });
    onRespond?.(true, answerMap);
  };

  // --- Response summary ---
  const renderResponseSummary = () => {
    if (!isResponded) return null;

    if (type === 'permission') {
      const isApproved = typeof response === 'string' ? response === '승인됨' : true;
      return (
        <div className="flex items-center gap-2 mt-2 text-sm animate-fadeIn" aria-live="polite">
          {isApproved ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
              <span className="text-green-700 dark:text-green-400">승인됨</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
              <span className="text-red-700 dark:text-red-400">거절됨</span>
            </>
          )}
        </div>
      );
    }

    // Question response summary
    return (
      <div className="flex items-center gap-2 mt-2 text-sm animate-fadeIn" aria-live="polite">
        <CheckCircle className="w-4 h-4 text-blue-500" aria-hidden="true" />
        <span className="text-gray-700 dark:text-gray-300">
          {typeof response === 'object' && !Array.isArray(response)
            ? Object.values(response).map((v) => Array.isArray(v) ? v.join(', ') : v).join(' | ')
            : Array.isArray(response)
              ? response.join(', ')
              : response}
        </span>
      </div>
    );
  };

  // --- Render a single question section ---
  const renderQuestionSection = (q: InteractiveQuestion, qIndex: number, standalone: boolean) => {
    const selectedForMulti = multiSelections[qIndex] || new Set<string>();
    const selectedSingle = answers[qIndex] as string | undefined;

    return (
      <div key={qIndex} className={!standalone && qIndex > 0 ? 'mt-4 pt-3 border-t border-gray-100 dark:border-gray-700' : ''}>
        {/* Question header (for multi-question, show per-question header) */}
        {!standalone && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-medium text-blue-500 dark:text-blue-400">{q.header}</span>
          </div>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {q.question}
        </p>

        {q.multiSelect ? (
          /* Multi-select: checkboxes */
          <div className="space-y-1.5">
            {q.choices.map((choice) => (
              <label
                key={choice.value}
                className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors
                  ${selectedForMulti.has(choice.value)
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50'}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedForMulti.has(choice.value)}
                  onChange={() => standalone ? handleSingleChoiceClick(choice) : handleMultiQuestionChoice(qIndex, choice)}
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
            {/* Single question multi-select: submit button */}
            {standalone && (
              <button
                onClick={handleSingleMultiSubmit}
                disabled={(selectedForMulti.size ?? 0) === 0 || isDisabled}
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
            )}
          </div>
        ) : (
          /* Single select: buttons */
          <div className="flex flex-wrap gap-2">
            {q.choices.map((choice) => (
              <button
                key={choice.value}
                onClick={() => standalone ? handleSingleChoiceClick(choice) : handleMultiQuestionChoice(qIndex, choice)}
                disabled={isDisabled}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors
                  ${!standalone && selectedSingle === choice.value
                    ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'border-gray-200 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={choice.label}
                title={choice.description}
              >
                {choice.label}
              </button>
            ))}
            {/* "Other" option */}
            <button
              onClick={() => standalone
                ? handleSingleChoiceClick({ label: '기타', value: '__other__' })
                : handleMultiQuestionChoice(qIndex, { label: '기타', value: '__other__', description: undefined })}
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

        {/* "Other" text input for this question */}
        {otherOpenIndex === qIndex && (
          <div className="flex gap-2 mt-2">
            <input
              ref={otherInputRef}
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => handleOtherKeyDown(e, qIndex)}
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
              onClick={() => {
                if (standalone) {
                  const trimmed = otherText.trim();
                  if (trimmed && !isDisabled) onRespond?.(true, trimmed);
                } else {
                  handleOtherSubmitForQuestion(qIndex);
                }
              }}
              disabled={!otherText.trim() || isDisabled}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-500 hover:bg-blue-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="기타 응답 제출"
            >
              전송
            </button>
          </div>
        )}

        {/* Show selected "Other" answer for multi-question */}
        {!standalone && typeof answers[qIndex] === 'string' && !q.choices.some((c) => c.value === answers[qIndex]) && (
          <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            기타: {answers[qIndex]}
          </div>
        )}
      </div>
    );
  };

  // Header text
  const headerText = type === 'permission'
    ? `권한 요청: ${toolName}`
    : isMultiQuestion
      ? '질문'
      : resolvedQuestions[0]?.header || '질문';

  return (
    <div
      className="max-w-[80%] rounded-lg border shadow-sm bg-gray-50 dark:bg-gray-800 animate-fadeInUp motion-reduce:animate-none"
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
          {headerText}
        </span>
        {isSending && (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin ml-auto" aria-label="전송 중" />
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {/* Permission mode: description + Approve/Reject buttons */}
        {type === 'permission' && toolInput && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
            {typeof toolInput.command === 'string'
              ? toolInput.command
              : typeof toolInput.file_path === 'string'
                ? toolInput.file_path
                : JSON.stringify(toolInput).slice(0, 200)}
          </p>
        )}
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

        {/* Question mode: single or multi-question */}
        {type === 'question' && !isResponded && (
          <div>
            {resolvedQuestions.map((q, i) =>
              renderQuestionSection(q, i, isSingleQuestion)
            )}

            {/* Multi-question submit button */}
            {isMultiQuestion && (
              <button
                onClick={handleMultiQuestionSubmit}
                disabled={!allMultiQuestionsAnswered || isDisabled}
                className="flex items-center gap-1.5 px-4 py-2 mt-4 text-sm rounded-md
                  bg-blue-500 hover:bg-blue-600 text-white
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="전체 응답 제출"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="w-4 h-4" aria-hidden="true" />
                )}
                제출 ({Object.keys(answers).length + Object.values(multiSelections).filter((s) => s.size > 0).length}/{resolvedQuestions.length})
              </button>
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
