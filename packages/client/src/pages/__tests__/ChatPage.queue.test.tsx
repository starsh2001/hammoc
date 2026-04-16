/**
 * ChatPage Queue Integration Tests
 * [Source: Story 15.4 - Task 5.3]
 *
 * Note: ChatPage is heavily integrated, so we test queue integration
 * by verifying the useQueueSession + QueueLockedBanner + ChatInput
 * interaction at the component level rather than rendering the full ChatPage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQueueStore } from '../../stores/queueStore';
import { QueueLockedBanner } from '../../components/queue/QueueLockedBanner';
import { ChatInput } from '../../components/ChatInput';

// Mock useChatStore
vi.mock('../../stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ isSessionLocked: false }),
    {
      getState: () => ({ isSessionLocked: false }),
    }
  ),
}));

// Mock useWebSocket
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));

// Mock useClickOutside
vi.mock('../../hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

// Mock usePromptHistory
vi.mock('../../hooks/usePromptHistory', () => ({
  usePromptHistory: () => ({
    addToHistory: vi.fn(),
    navigateUp: vi.fn().mockReturnValue(null),
    navigateDown: vi.fn().mockReturnValue(null),
    resetNavigation: vi.fn(),
    isNavigating: false,
  }),
}));

const defaultStoreState = {
  script: '',
  parsedItems: [],
  warnings: [],
  isRunning: false,
  isPaused: false,
  isStarting: false,
  currentIndex: 0,
  totalItems: 0,
  pauseReason: undefined,
  lockedSessionId: null,
  currentModel: undefined,
  completedItems: new Set<number>(),
  errorItem: null,
};

/**
 * Simulates the ChatPage queue integration by rendering
 * the banner and input with queue state.
 */
function renderQueueIntegration(opts: {
  isQueueLocked: boolean;
  isRunning?: boolean;
  isPaused?: boolean;
  isCompleted?: boolean;
  isErrored?: boolean;
  progress?: { current: number; total: number };
}) {
  const {
    isQueueLocked,
    isRunning = true,
    isPaused = false,
    isCompleted = false,
    isErrored = false,
    progress = { current: 0, total: 3 },
  } = opts;

  const showBanner = isQueueLocked || isCompleted || isErrored;

  return render(
    <MemoryRouter>
      <div data-testid="chat-page">
        {showBanner && (
          <QueueLockedBanner
            isRunning={isRunning && !isPaused}
            isPaused={isPaused}
            isCompleted={isCompleted}
            isErrored={isErrored}
            progress={progress}
            currentPromptPreview="test prompt"
            pauseReason={undefined}
            errorItem={null}
            projectSlug="my-project"
            onPause={vi.fn()}
            onResume={vi.fn()}
            onAbort={vi.fn()}
          />
        )}
        <ChatInput
          onSend={vi.fn()}
          queueLocked={isQueueLocked}
        />
      </div>
    </MemoryRouter>
  );
}

describe('ChatPage Queue Integration', () => {
  beforeEach(() => {
    useQueueStore.setState(defaultStoreState);
    vi.clearAllMocks();
  });

  it('TC-QL-23: QueueLockedBanner renders when session is queue-locked', () => {
    renderQueueIntegration({ isQueueLocked: true });

    expect(screen.getByTestId('queue-locked-banner')).toBeInTheDocument();
  });

  it('TC-QL-24: QueueLockedBanner does not render when session is not queue-locked', () => {
    renderQueueIntegration({ isQueueLocked: false });

    expect(screen.queryByTestId('queue-locked-banner')).not.toBeInTheDocument();
  });

  it('TC-QL-25: ChatInput disabled with queue locked message', () => {
    renderQueueIntegration({ isQueueLocked: true });

    const textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute('placeholder', '큐 러너가 제어 중');
  });

  it('TC-QL-26: ChatInput re-enables when queue completes', () => {
    const { rerender } = render(
      <MemoryRouter>
        <div>
          <QueueLockedBanner
            isRunning={true}
            isPaused={false}
            isCompleted={false}
            isErrored={false}
            progress={{ current: 0, total: 3 }}
            currentPromptPreview="test"
            pauseReason={undefined}
            errorItem={null}
            projectSlug="my-project"
            onPause={vi.fn()}
            onResume={vi.fn()}
            onAbort={vi.fn()}
          />
          <ChatInput onSend={vi.fn()} queueLocked={true} />
        </div>
      </MemoryRouter>
    );

    let textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).toBeDisabled();

    // Queue completes → queueLocked=false
    rerender(
      <MemoryRouter>
        <div>
          <ChatInput onSend={vi.fn()} queueLocked={false} />
        </div>
      </MemoryRouter>
    );

    textarea = screen.getByRole('textbox', { name: '메시지 입력' });
    expect(textarea).not.toBeDisabled();
    expect(textarea).not.toHaveAttribute('placeholder', '큐 러너가 제어 중');
  });
});
