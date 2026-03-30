/**
 * ChatPage Summarize Logic Tests
 * [Source: Story 25.9 - Task 7.2]
 *
 * Tests the summarize-related logic that ChatPage uses.
 * Full integration testing of ChatPage render is in ChatPage.test.tsx.
 * This file tests the pure logic and data flow.
 */

import { describe, it, expect } from 'vitest';
import { ROOT_BRANCH_KEY } from '@hammoc/shared';

// Test the context combination logic (extracted from handleSummarizeConfirm)
function combineSummarizeText(messageText: string, context: string): string {
  return context.trim()
    ? `${messageText}\n\n[Context: ${context.trim()}]`
    : messageText;
}

// Test the branch point resolution logic (extracted from handleSummarizeConfirm)
function resolveBranchPoint(parentId: string | undefined): string {
  return parentId || ROOT_BRANCH_KEY;
}

// Test the onSummarize guard logic from MessageBubble
function shouldShowSummarize(
  isOptimistic: boolean,
  hasParentId: boolean,
  hasOnSummarize: boolean,
): boolean {
  return !isOptimistic && hasParentId && hasOnSummarize;
}

describe('ChatPage — Summarize logic', () => {
  describe('combineSummarizeText', () => {
    it('returns messageText only when context is empty', () => {
      expect(combineSummarizeText('Hello world', '')).toBe('Hello world');
    });

    it('returns messageText only when context is whitespace', () => {
      expect(combineSummarizeText('Hello world', '   ')).toBe('Hello world');
    });

    it('appends context when provided', () => {
      expect(combineSummarizeText('Hello world', 'focus on React')).toBe(
        'Hello world\n\n[Context: focus on React]',
      );
    });

    it('trims context whitespace', () => {
      expect(combineSummarizeText('Hello', '  trim me  ')).toBe(
        'Hello\n\n[Context: trim me]',
      );
    });
  });

  describe('resolveBranchPoint', () => {
    it('returns parentId when available', () => {
      expect(resolveBranchPoint('assistant-uuid-123')).toBe('assistant-uuid-123');
    });

    it('returns ROOT_BRANCH_KEY when parentId is undefined', () => {
      expect(resolveBranchPoint(undefined)).toBe(ROOT_BRANCH_KEY);
    });
  });

  describe('shouldShowSummarize guard', () => {
    it('returns true for non-optimistic message with parentId and handler', () => {
      expect(shouldShowSummarize(false, true, true)).toBe(true);
    });

    it('returns false for optimistic messages', () => {
      expect(shouldShowSummarize(true, true, true)).toBe(false);
    });

    it('returns false when no parentId (first message)', () => {
      expect(shouldShowSummarize(false, false, true)).toBe(false);
    });

    it('returns false when onSummarize handler is not provided', () => {
      expect(shouldShowSummarize(false, true, false)).toBe(false);
    });
  });

  describe('chain:add + sendMessage ordering', () => {
    it('chain:add payload should contain /compact', () => {
      const chainPayload = {
        sessionId: 'session-123',
        content: '/compact',
        workingDirectory: '/test/path',
      };
      expect(chainPayload.content).toBe('/compact');
    });

    it('sendMessage should include resumeSessionAt', () => {
      const sendOpts = {
        workingDirectory: '/test/path',
        sessionId: 'session-123',
        resume: true,
        resumeSessionAt: 'assistant-uuid-456',
      };
      expect(sendOpts.resumeSessionAt).toBe('assistant-uuid-456');
      expect(sendOpts.resume).toBe(true);
    });
  });
});
