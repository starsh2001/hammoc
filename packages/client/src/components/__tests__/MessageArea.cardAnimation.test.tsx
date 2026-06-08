/**
 * MessageArea — card entrance animation (Advanced toggle `cardEntranceAnimation`).
 *
 * Verifies the streaming-segment wrapper: when the toggle is ON (default) each streaming
 * card is wrapped in the `animate-fadeInUp` bubble-in class; when OFF the segment renders
 * exactly as before (no wrapper). A `system` segment is used because it renders inline
 * (no heavy child card), keeping the assertion focused on the wrapper itself.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { MessageArea } from '../MessageArea';
import { useChatStore, type StreamingSegment } from '../../stores/chatStore';
import { usePreferencesStore } from '../../stores/preferencesStore';

beforeAll(() => {
  // jsdom lacks ResizeObserver, which MessageArea's auto-scroll observes the container with.
  if (!('ResizeObserver' in globalThis)) {
    // @ts-expect-error minimal test stub
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const systemSeg = { type: 'system', subtype: 'info', message: 'hello world' } as unknown as StreamingSegment;

function setToggle(cardEntranceAnimation: boolean) {
  usePreferencesStore.setState({ preferences: { cardEntranceAnimation }, overrides: [], loaded: true });
}

describe('MessageArea card entrance animation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      streamingMessageId: 'm',
      generationProgress: null,
      streamingStartedAt: null,
      lastResultError: null,
      contextUsage: null,
    });
  });

  it('wraps streaming segments in the bubble-in animation when the toggle is ON (default)', () => {
    setToggle(true);
    const { container, getByText } = render(
      <MessageArea streamingSegments={[systemSeg]} isStreaming={false} />,
    );
    // The segment itself rendered…
    expect(getByText('hello world')).toBeInTheDocument();
    // …inside an animate-fadeInUp wrapper.
    expect(container.querySelectorAll('.animate-fadeInUp').length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT wrap segments when the toggle is OFF', () => {
    setToggle(false);
    const { container, getByText } = render(
      <MessageArea streamingSegments={[systemSeg]} isStreaming={false} />,
    );
    expect(getByText('hello world')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-fadeInUp').length).toBe(0);
  });

  it('defaults to ON when the preference is unset (?? true)', () => {
    usePreferencesStore.setState({ preferences: {}, overrides: [], loaded: true });
    const { container } = render(
      <MessageArea streamingSegments={[systemSeg]} isStreaming={false} />,
    );
    expect(container.querySelectorAll('.animate-fadeInUp').length).toBeGreaterThanOrEqual(1);
  });
});
