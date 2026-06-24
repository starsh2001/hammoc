// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClaudeLogin } from '../useClaudeLogin';

const listeners: Record<string, (...args: unknown[]) => void> = {};
const mockSocket = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { listeners[event] = cb; }),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('../../services/socket', () => ({
  getSocket: () => mockSocket,
}));

function fireEvent(event: string, data?: unknown) {
  listeners[event]?.(data);
}

describe('useClaudeLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('starts in idle phase by default', () => {
    const { result } = renderHook(() => useClaudeLogin());
    expect(result.current.phase).toBe('idle');
  });

  it('starts in initializing phase with autoStart', () => {
    const { result } = renderHook(() => useClaudeLogin({ autoStart: true }));
    expect(result.current.phase).toBe('initializing');
    expect(mockSocket.emit).toHaveBeenCalledWith('auth:start');
  });

  it('start() emits auth:start and resets state', () => {
    const { result } = renderHook(() => useClaudeLogin());
    act(() => { result.current.start(); });
    expect(result.current.phase).toBe('initializing');
    expect(mockSocket.emit).toHaveBeenCalledWith('auth:start');
  });

  it('selectMethod() emits auth:select-method', () => {
    const { result } = renderHook(() => useClaudeLogin());
    act(() => { result.current.selectMethod(1); });
    expect(mockSocket.emit).toHaveBeenCalledWith('auth:select-method', { method: 1 });
  });

  it('submitCode() emits auth:submit-code with trimmed code', () => {
    const { result } = renderHook(() => useClaudeLogin());
    act(() => { result.current.setCode('  abc123  '); });
    act(() => { result.current.submitCode(); });
    expect(mockSocket.emit).toHaveBeenCalledWith('auth:submit-code', { code: 'abc123' });
    expect(result.current.phase).toBe('completing');
  });

  it('submitCode() does nothing when code is empty', () => {
    const { result } = renderHook(() => useClaudeLogin());
    act(() => { result.current.submitCode(); });
    expect(mockSocket.emit).not.toHaveBeenCalledWith('auth:submit-code', expect.anything());
  });

  it('handles happy path: method-prompt → url → code-prompt → complete', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeLogin({ onComplete }));

    act(() => { fireEvent('auth:method-prompt'); });
    // Subscription-only: the method menu auto-selects option 1 and advances straight to
    // awaiting-auth (no chooser surfaced).
    expect(result.current.phase).toBe('awaiting-auth');
    expect(mockSocket.emit).toHaveBeenCalledWith('auth:select-method', { method: 1 });

    act(() => { fireEvent('auth:url', { url: 'https://example.com/oauth' }); });
    expect(result.current.phase).toBe('awaiting-auth');
    expect(result.current.url).toBe('https://example.com/oauth');

    act(() => { fireEvent('auth:code-prompt'); });
    expect(result.current.phase).toBe('code-input');

    const mockAccount = { email: 'test@example.com' };
    act(() => { fireEvent('auth:complete', { account: mockAccount }); });
    expect(result.current.phase).toBe('done');
    expect(onComplete).toHaveBeenCalledWith(mockAccount);
  });

  it('handles error event', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useClaudeLogin({ onError }));

    act(() => { fireEvent('auth:error', { message: 'Auth failed' }); });
    expect(result.current.phase).toBe('error');
    expect(result.current.errorMsg).toBe('Auth failed');
    expect(onError).toHaveBeenCalledWith('Auth failed');
  });

  it('cleans up socket listeners on unmount', () => {
    const { unmount } = renderHook(() => useClaudeLogin());
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('auth:method-prompt', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('auth:url', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('auth:code-prompt', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('auth:complete', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('auth:error', expect.any(Function));
  });
});
