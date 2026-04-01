/**
 * streamCallbacks Tests
 * [Source: Story 25.11 - Task 6.10]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStreamCallbacks, type CallbackBuilderDeps } from '../streamCallbacks';

describe('buildStreamCallbacks', () => {
  let mockEmit: ReturnType<typeof vi.fn>;
  let baseDeps: CallbackBuilderDeps;

  beforeEach(() => {
    mockEmit = vi.fn();
    baseDeps = {
      emit: mockEmit,
      stream: { sessionId: 'original-session', sockets: { size: 1 } },
      isResuming: true,
      rekeyStream: vi.fn(),
      broadcastStreamChange: vi.fn(),
      notificationService: {
        shouldNotify: () => false,
        notifyComplete: vi.fn(),
        notifyError: vi.fn(),
      },
      initialSessionId: 'original-session',
    };
  });

  it('emits session:forked when isFork is true', () => {
    const deps = { ...baseDeps, isFork: true };
    const { callbacks } = buildStreamCallbacks(deps);

    callbacks.onSessionInit!('forked-session-id', { model: 'claude-4' });

    expect(mockEmit).toHaveBeenCalledWith('session:forked', {
      sessionId: 'forked-session-id',
      originalSessionId: 'original-session',
      model: 'claude-4',
    });
    // Should NOT emit session:resumed or session:created
    expect(mockEmit).not.toHaveBeenCalledWith('session:resumed', expect.anything());
    expect(mockEmit).not.toHaveBeenCalledWith('session:created', expect.anything());
  });

  it('emits session:resumed when isFork is false and isResuming is true', () => {
    const deps = { ...baseDeps, isFork: false };
    const { callbacks } = buildStreamCallbacks(deps);

    callbacks.onSessionInit!('session-id', { model: 'claude-4' });

    expect(mockEmit).toHaveBeenCalledWith('session:resumed', expect.objectContaining({
      sessionId: 'session-id',
      model: 'claude-4',
    }));
    expect(mockEmit).not.toHaveBeenCalledWith('session:forked', expect.anything());
  });

  it('emits session:created when isFork is false and isResuming is false', () => {
    const deps = { ...baseDeps, isResuming: false, isFork: false };
    const { callbacks } = buildStreamCallbacks(deps);

    callbacks.onSessionInit!('new-session-id', { model: 'claude-4' });

    expect(mockEmit).toHaveBeenCalledWith('session:created', {
      sessionId: 'new-session-id',
      model: 'claude-4',
    });
    expect(mockEmit).not.toHaveBeenCalledWith('session:forked', expect.anything());
  });

  it('includes originalSessionId from initialSessionId in session:forked payload', () => {
    const deps = { ...baseDeps, isFork: true, initialSessionId: 'my-original-session' };
    const { callbacks } = buildStreamCallbacks(deps);

    callbacks.onSessionInit!('forked-id', {});

    expect(mockEmit).toHaveBeenCalledWith('session:forked', expect.objectContaining({
      originalSessionId: 'my-original-session',
    }));
  });
});
