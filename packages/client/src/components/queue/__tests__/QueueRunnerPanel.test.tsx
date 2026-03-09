/**
 * QueueRunnerPanel Component Tests
 * [Source: Story 15.3 - Task 7.3]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueueRunnerPanel } from '../QueueRunnerPanel';
import type { QueueItem } from '@hammoc/shared';

const mockItems: QueueItem[] = [
  { prompt: 'Hello world', isNewSession: false },
  { prompt: 'Second prompt', isNewSession: true },
  { prompt: '', isNewSession: false, saveSessionName: 'my-session' },
  { prompt: '', isNewSession: false, isBreakpoint: true },
  { prompt: 'Final prompt', isNewSession: false },
];

const defaultProps = {
  items: mockItems,
  currentIndex: 0,
  completedItems: new Set<number>(),
  isRunning: false,
  isPaused: false,
  pauseReason: undefined,
  errorItem: null,
  onPause: vi.fn(),
  onResume: vi.fn(),
  onAbort: vi.fn(),
};

describe('QueueRunnerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-QE-21: should show correct progress percentage', () => {
    render(
      <QueueRunnerPanel
        {...defaultProps}
        completedItems={new Set([0, 1])}
        currentIndex={2}
        isRunning={true}
      />
    );

    expect(screen.getByText('진행: 2 / 5')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('TC-QE-22: completed items should show green check icon', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...defaultProps}
        completedItems={new Set([0])}
        currentIndex={1}
        isRunning={true}
      />
    );

    // First item should be completed (green check)
    const items = container.querySelectorAll('[class*="text-green-500"]');
    expect(items.length).toBeGreaterThan(0);
  });

  it('TC-QE-23: items before currentIndex should show as completed even without completedItems entry', () => {
    // currentIndex is 3, so items 0, 1, 2 should show as completed
    const { container } = render(
      <QueueRunnerPanel
        {...defaultProps}
        completedItems={new Set<number>()}  // Empty set (items completed while unmounted)
        currentIndex={3}
        isRunning={true}
      />
    );

    // Items at index 0, 1, 2 should have line-through
    const completedElements = container.querySelectorAll('.line-through');
    expect(completedElements.length).toBe(3);
  });

  it('TC-QE-24: current running item should show blue indicator', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...defaultProps}
        currentIndex={1}
        isRunning={true}
      />
    );

    // Should have an animated spinner (Loader2 with animate-spin)
    const spinners = container.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('TC-QE-25p: paused state should show pause reason banner', () => {
    render(
      <QueueRunnerPanel
        {...defaultProps}
        currentIndex={2}
        isRunning={true}
        isPaused={true}
        pauseReason="사용자 요청으로 일시정지"
      />
    );

    expect(screen.getByText('사유: 사용자 요청으로 일시정지')).toBeInTheDocument();
    expect(screen.getByText('일시정지됨')).toBeInTheDocument();
  });

  it('TC-QE-26p: error state should show error message', () => {
    render(
      <QueueRunnerPanel
        {...defaultProps}
        errorItem={{ index: 1, error: 'SDK connection failed' }}
      />
    );

    expect(screen.getByText('오류: SDK connection failed')).toBeInTheDocument();
    expect(screen.getByText('오류 발생')).toBeInTheDocument();
  });

  it('TC-QE-27p: abort button should show confirmation dialog', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <QueueRunnerPanel
        {...defaultProps}
        currentIndex={1}
        isRunning={true}
        isPaused={true}
      />
    );

    const abortButton = screen.getByLabelText('중단');
    fireEvent.click(abortButton);

    expect(confirmSpy).toHaveBeenCalledWith('큐 실행을 중단하시겠습니까?');
    expect(defaultProps.onAbort).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('TC-QE-27p-deny: abort cancelled when user denies confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <QueueRunnerPanel
        {...defaultProps}
        currentIndex={1}
        isRunning={true}
        isPaused={true}
      />
    );

    const abortButton = screen.getByLabelText('중단');
    fireEvent.click(abortButton);

    expect(defaultProps.onAbort).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('TC-QE-28p: pause/resume buttons call correct callbacks', () => {
    // Test pause button when running
    const { rerender } = render(
      <QueueRunnerPanel
        {...defaultProps}
        currentIndex={1}
        isRunning={true}
        isPaused={false}
      />
    );

    fireEvent.click(screen.getByLabelText('일시정지'));
    expect(defaultProps.onPause).toHaveBeenCalled();

    // Test resume button when paused
    rerender(
      <QueueRunnerPanel
        {...defaultProps}
        currentIndex={1}
        isRunning={true}
        isPaused={true}
      />
    );

    fireEvent.click(screen.getByLabelText('재개'));
    expect(defaultProps.onResume).toHaveBeenCalled();
  });

  it('should display item summaries correctly', () => {
    render(
      <QueueRunnerPanel
        {...defaultProps}
        isRunning={true}
        currentIndex={0}
      />
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('[새 세션] Second prompt')).toBeInTheDocument();
    expect(screen.getByText('세션 저장: my-session')).toBeInTheDocument();
    // The breakpoint item summary is "일시정지" which also appears as button text,
    // so query within the item list area specifically
    const itemList = document.querySelector('.max-h-\\[300px\\]');
    expect(itemList).toBeInTheDocument();
    expect(screen.getByText('Final prompt')).toBeInTheDocument();
  });
});
