/**
 * QueueLockedBanner Component Tests
 * [Source: Story 15.4 - Task 5.2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueueLockedBanner, type QueueLockedBannerProps } from '../QueueLockedBanner';

const defaultProps: QueueLockedBannerProps = {
  isRunning: true,
  isPaused: false,
  isCompleted: false,
  isErrored: false,
  progress: { current: 2, total: 10 },
  currentPromptPreview: 'Hello world prompt preview',
  pauseReason: undefined,
  errorItem: null,
  projectSlug: 'my-project',
  onPause: vi.fn(),
  onResume: vi.fn(),
  onAbort: vi.fn(),
};

function renderBanner(props: Partial<QueueLockedBannerProps> = {}) {
  return render(
    <MemoryRouter>
      <QueueLockedBanner {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('QueueLockedBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-QL-13: renders progress display with current/total', () => {
    renderBanner();
    expect(screen.getByText(/3\/10/)).toBeInTheDocument();
  });

  it('TC-QL-14: shows prompt preview text', () => {
    renderBanner();
    expect(screen.getByText(/Hello world prompt preview/)).toBeInTheDocument();
  });

  it('TC-QL-15: pause button visible when running, calls onPause', () => {
    const onPause = vi.fn();
    renderBanner({ onPause });

    const pauseBtn = screen.getByRole('button', { name: '큐 일시정지' });
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('TC-QL-16: resume button visible when paused, calls onResume', () => {
    const onResume = vi.fn();
    renderBanner({ isRunning: true, isPaused: true, onResume });

    const resumeBtn = screen.getByRole('button', { name: '큐 재개' });
    expect(resumeBtn).toBeInTheDocument();
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('TC-QL-17: abort button shows confirmation before calling onAbort', () => {
    const onAbort = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');

    // User cancels
    confirmSpy.mockReturnValueOnce(false);
    renderBanner({ onAbort });

    const abortBtn = screen.getByRole('button', { name: '큐 중단' });
    fireEvent.click(abortBtn);
    expect(confirmSpy).toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();

    // User confirms
    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(abortBtn);
    expect(onAbort).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it('TC-QL-18: displays pause reason text when paused with reason', () => {
    renderBanner({
      isRunning: true,
      isPaused: true,
      pauseReason: '@pause: 여기서 잠시 멈춤',
    });

    expect(screen.getByText('@pause: 여기서 잠시 멈춤')).toBeInTheDocument();
  });

  it('TC-QL-19: displays error message when errorItem exists', () => {
    renderBanner({
      isRunning: true,
      isPaused: true,
      errorItem: { index: 3, error: 'QUEUE_STOP detected' },
    });

    expect(screen.getByText(/오류: 4: QUEUE_STOP detected/)).toBeInTheDocument();
  });

  it('TC-QL-20: shows completed state with checkmark', () => {
    renderBanner({
      isRunning: false,
      isPaused: false,
      isCompleted: true,
      progress: { current: 10, total: 10 },
    });

    expect(screen.getByText(/완료/)).toBeInTheDocument();
    expect(screen.getByText(/10개 아이템 실행됨/)).toBeInTheDocument();
    // No control buttons in completed state
    expect(screen.queryByRole('button', { name: '큐 일시정지' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '큐 중단' })).not.toBeInTheDocument();
  });

  it('TC-QL-20b: shows error completed state with alert icon and error message', () => {
    renderBanner({
      isRunning: false,
      isPaused: false,
      isErrored: true,
    });

    expect(screen.getByText('큐 실행 중 오류로 중단됨')).toBeInTheDocument();
    expect(screen.getByText(/큐 에디터로 이동/)).toBeInTheDocument();
  });

  it('TC-QL-21: queue editor link navigates to correct URL', () => {
    renderBanner();

    const link = screen.getByText(/큐 에디터/);
    expect(link.closest('a')).toHaveAttribute('href', '/project/my-project/queue');
  });

  it('TC-QL-22: correct ARIA attributes applied', () => {
    renderBanner();

    const banner = screen.getByTestId('queue-locked-banner');
    expect(banner).toHaveAttribute('role', 'banner');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('aria-label', expect.stringContaining('3 / 10'));
  });
});
