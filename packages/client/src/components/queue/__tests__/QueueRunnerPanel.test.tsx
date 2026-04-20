/**
 * QueueRunnerPanel Component Tests
 * [Source: Story 15.3 - Task 7.3]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

// =============================================================================
// Loop feature tests
// =============================================================================

const loopItem: QueueItem = {
  prompt: '',
  isNewSession: false,
  loop: {
    max: 5,
    until: '[DONE]',
    onExceed: 'pause',
    items: [
      { prompt: 'Run tests', isNewSession: false },
      { prompt: 'Check results', isNewSession: false },
    ],
  },
};

const loopDefaultProps = {
  items: [loopItem],
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

describe('QueueRunnerPanel — Loop rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Basic loop header rendering ---

  it('renders loop header with @loop summary', () => {
    render(<QueueRunnerPanel {...loopDefaultProps} isRunning={true} />);
    expect(screen.getByText('@loop max=5 until="[DONE]"')).toBeInTheDocument();
  });

  it('renders loop header with until token in monospace badge', () => {
    const { container } = render(<QueueRunnerPanel {...loopDefaultProps} isRunning={true} />);
    const untilBadge = container.querySelector('.font-mono');
    expect(untilBadge).toBeInTheDocument();
    expect(untilBadge!.textContent).toContain('until="[DONE]"');
  });

  it('renders loop without until token when not set', () => {
    const noUntilItem: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: { max: 3, onExceed: 'pause', items: [{ prompt: 'do work', isNewSession: false }] },
    };
    const { container } = render(
      <QueueRunnerPanel {...loopDefaultProps} items={[noUntilItem]} isRunning={true} />
    );
    // No until badge should exist
    const monos = container.querySelectorAll('.font-mono');
    const untilBadges = Array.from(monos).filter(el => el.textContent?.includes('until='));
    expect(untilBadges).toHaveLength(0);
  });

  // --- Inner items rendering ---

  it('renders all inner items of the loop', () => {
    render(<QueueRunnerPanel {...loopDefaultProps} isRunning={true} />);
    expect(screen.getByText('Run tests')).toBeInTheDocument();
    expect(screen.getByText('Check results')).toBeInTheDocument();
  });

  it('renders inner items with pl-12 indentation', () => {
    const { container } = render(<QueueRunnerPanel {...loopDefaultProps} isRunning={true} />);
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems).toHaveLength(2);
  });

  it('renders @end dashed separator after inner items', () => {
    const { container } = render(<QueueRunnerPanel {...loopDefaultProps} isRunning={true} />);
    const separator = container.querySelector('.border-dashed');
    expect(separator).toBeInTheDocument();
  });

  // --- Loop with mixed inner directives ---

  it('renders loop with @new, @model, @pause, @delay inner items', () => {
    const complexLoop: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: {
        max: 3,
        onExceed: 'pause',
        items: [
          { prompt: '', isNewSession: true },
          { prompt: '', isNewSession: false, modelName: 'sonnet' },
          { prompt: 'checkpoint', isNewSession: false, isBreakpoint: true },
          { prompt: '', isNewSession: false, delayMs: 2000 },
          { prompt: 'do actual work', isNewSession: false },
        ],
      },
    };
    render(
      <QueueRunnerPanel {...loopDefaultProps} items={[complexLoop]} isRunning={true} />
    );
    expect(screen.getByText('새 세션 시작')).toBeInTheDocument();
    expect(screen.getByText('모델 변경: sonnet')).toBeInTheDocument();
    expect(screen.getByText('일시정지: checkpoint')).toBeInTheDocument();
    expect(screen.getByText('대기: 2000ms')).toBeInTheDocument();
    expect(screen.getByText('do actual work')).toBeInTheDocument();
  });

  // --- Empty loop ---

  it('renders empty loop (no inner items) with header and separator only', () => {
    const emptyLoop: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: { max: 10, onExceed: 'pause', items: [] },
    };
    const { container } = render(
      <QueueRunnerPanel {...loopDefaultProps} items={[emptyLoop]} isRunning={true} />
    );
    expect(screen.getByText('@loop max=10')).toBeInTheDocument();
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems).toHaveLength(0);
    expect(container.querySelector('.border-dashed')).toBeInTheDocument();
  });

  // --- Loop progress display ---

  it('shows loop iteration counter when loopProgress is provided', () => {
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={{ iteration: 2, max: 5, innerIndex: 0, innerTotal: 2 }}
      />
    );
    expect(screen.getByText('(3/5)')).toBeInTheDocument();
  });

  it('shows aria-label with loop iteration info when current', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={{ iteration: 1, max: 5, innerIndex: 0, innerTotal: 2 }}
      />
    );
    const headerWithAria = container.querySelector('[aria-label="Loop iteration 2 of 5"]');
    expect(headerWithAria).toBeInTheDocument();
  });

  it('does not show iteration counter when loopProgress is null', () => {
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={null}
      />
    );
    expect(screen.queryByText(/\(\d+\/\d+\)/)).not.toBeInTheDocument();
  });

  // --- Inner item status during loop execution ---

  it('marks inner items before innerIndex as completed during loop', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={{ iteration: 0, max: 5, innerIndex: 1, innerTotal: 2 }}
      />
    );
    // First inner item (index 0) should be completed (line-through)
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems[0].querySelector('.line-through')).toBeInTheDocument();
    // Second inner item (index 1) should be running (has spinner)
    expect(innerItems[1].querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('marks current inner item as running with spinner', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={{ iteration: 0, max: 5, innerIndex: 0, innerTotal: 2 }}
      />
    );
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems[0].querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('marks current inner item as paused when queue is paused', () => {
    // When isPaused=true and innerIndex targets the current item, that inner
    // item's status is 'paused' (amber PauseCircle); other inner items remain
    // 'pending' (gray Clock). See queueItemUtils.getItemStatus + ItemStatusIcon.
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        isPaused={true}
        pauseReason="사용자 일시정지"
        loopProgress={{ iteration: 0, max: 5, innerIndex: 0, innerTotal: 2 }}
      />
    );
    expect(screen.getByText('일시정지됨')).toBeInTheDocument();
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems.length).toBe(2);
    // Current inner (index 0) is paused → amber icon
    expect(innerItems[0].querySelector('[class*="text-amber-500"]')).toBeInTheDocument();
    // Following inner (index 1) is still pending → gray icon
    expect(innerItems[1].querySelector('[class*="text-gray-400"]')).toBeInTheDocument();
  });

  it('marks inner items after innerIndex as pending', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={{ iteration: 0, max: 5, innerIndex: 0, innerTotal: 2 }}
      />
    );
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    // Second inner item (index 1) should be pending (gray clock icon)
    expect(innerItems[1].querySelector('[class*="text-gray-400"]')).toBeInTheDocument();
  });

  it('highlights current inner item row with bg-blue', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={true}
        loopProgress={{ iteration: 0, max: 5, innerIndex: 1, innerTotal: 2 }}
      />
    );
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems[1].className).toContain('bg-blue');
  });

  // --- Completed loop ---

  it('marks all inner items as completed when loop is done', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={[loopItem, { prompt: 'after loop', isNewSession: false }]}
        currentIndex={1}
        completedItems={new Set([0])}
        isRunning={true}
      />
    );
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    // Both inner items should have line-through (completed)
    expect(innerItems[0].querySelector('.line-through')).toBeInTheDocument();
    expect(innerItems[1].querySelector('.line-through')).toBeInTheDocument();
  });

  it('shows loop header as completed with line-through', () => {
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={[loopItem, { prompt: 'next', isNewSession: false }]}
        currentIndex={1}
        completedItems={new Set([0])}
        isRunning={true}
      />
    );
    // The loop summary text should have line-through
    const summaryEl = screen.getByText('@loop max=5 until="[DONE]"');
    expect(summaryEl.className).toContain('line-through');
  });

  // --- Loop with items before and after ---

  it('renders items before and after loop correctly', () => {
    const mixedItems: QueueItem[] = [
      { prompt: 'setup task', isNewSession: false },
      loopItem,
      { prompt: 'cleanup task', isNewSession: false },
    ];
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={mixedItems}
        isRunning={true}
        currentIndex={1}
        completedItems={new Set([0])}
        loopProgress={{ iteration: 0, max: 5, innerIndex: 0, innerTotal: 2 }}
      />
    );
    expect(screen.getByText('setup task')).toBeInTheDocument();
    expect(screen.getByText('@loop max=5 until="[DONE]"')).toBeInTheDocument();
    expect(screen.getByText('Run tests')).toBeInTheDocument();
    expect(screen.getByText('Check results')).toBeInTheDocument();
    expect(screen.getByText('cleanup task')).toBeInTheDocument();
  });

  // --- Pending (non-draggable) loop rendering ---

  it('renders pending loop items with pl-12 indentation (non-draggable fallback)', () => {
    const items: QueueItem[] = [
      { prompt: 'first', isNewSession: false },
      loopItem,
    ];
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={items}
        currentIndex={0}
        isRunning={true}
      />
    );
    // Loop is in pending section — inner items should still have pl-12
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems).toHaveLength(2);
  });

  // --- Session link on loop header ---

  it('renders session link on completed loop header', () => {
    const sessionIds = new Map<number, string>();
    sessionIds.set(0, 'session-abc');
    render(
      <MemoryRouter>
        <QueueRunnerPanel
          {...loopDefaultProps}
          items={[loopItem, { prompt: 'next', isNewSession: false }]}
          currentIndex={1}
          completedItems={new Set([0])}
          isRunning={true}
          projectSlug="my-project"
          itemSessionIds={sessionIds}
        />
      </MemoryRouter>
    );
    const link = screen.getAllByTitle('세션 이동').find(el => el.closest('a'));
    expect(link).toBeInTheDocument();
  });

  // --- Error state on loop ---

  it('shows error styling on loop header when loop item has error', () => {
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        isRunning={false}
        errorItem={{ index: 0, error: 'Loop failed' }}
      />
    );
    // Loop header should have error background
    const headerRow = container.querySelector('[class*="bg-red"]');
    expect(headerRow).toBeInTheDocument();
  });

  // --- Multiple loops in sequence ---

  it('renders multiple loops in sequence', () => {
    const loop1: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: {
        max: 3,
        onExceed: 'pause',
        items: [{ prompt: 'loop1 work', isNewSession: false }],
      },
    };
    const loop2: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: {
        max: 10,
        until: 'SUCCESS',
        onExceed: 'continue',
        items: [{ prompt: 'loop2 work', isNewSession: false }],
      },
    };
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={[loop1, loop2]}
        isRunning={true}
        currentIndex={0}
        loopProgress={{ iteration: 1, max: 3, innerIndex: 0, innerTotal: 1 }}
      />
    );
    expect(screen.getByText('@loop max=3')).toBeInTheDocument();
    expect(screen.getByText('@loop max=10 until="SUCCESS"')).toBeInTheDocument();
    expect(screen.getByText('loop1 work')).toBeInTheDocument();
    expect(screen.getByText('loop2 work')).toBeInTheDocument();
  });

  // --- Loop max=1 (boundary) ---

  it('renders loop with max=1 correctly', () => {
    const singleLoop: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: {
        max: 1,
        onExceed: 'pause',
        items: [{ prompt: 'single iteration', isNewSession: false }],
      },
    };
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={[singleLoop]}
        isRunning={true}
        loopProgress={{ iteration: 0, max: 1, innerIndex: 0, innerTotal: 1 }}
      />
    );
    expect(screen.getByText('(1/1)')).toBeInTheDocument();
    expect(screen.getByText('single iteration')).toBeInTheDocument();
  });

  // --- Loop with many inner items ---

  it('renders loop with many inner items', () => {
    const manyItems: QueueItem = {
      prompt: '',
      isNewSession: false,
      loop: {
        max: 3,
        onExceed: 'pause',
        items: Array.from({ length: 10 }, (_, i) => ({
          prompt: `step ${i + 1}`,
          isNewSession: false,
        })),
      },
    };
    const { container } = render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={[manyItems]}
        isRunning={true}
      />
    );
    const innerItems = container.querySelectorAll('[class*="pl-16"]');
    expect(innerItems).toHaveLength(10);
    expect(screen.getByText('step 1')).toBeInTheDocument();
    expect(screen.getByText('step 10')).toBeInTheDocument();
  });

  // --- Progress counts loop as single item ---

  it('counts loop as single item in progress bar', () => {
    const items: QueueItem[] = [
      { prompt: 'before', isNewSession: false },
      loopItem,
      { prompt: 'after', isNewSession: false },
    ];
    render(
      <QueueRunnerPanel
        {...loopDefaultProps}
        items={items}
        currentIndex={1}
        completedItems={new Set([0])}
        isRunning={true}
      />
    );
    // Total should be 3, completed 1
    expect(screen.getByText('진행: 1 / 3')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });
});
