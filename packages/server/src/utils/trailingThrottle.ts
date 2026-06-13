/**
 * Trailing-edge throttle (Story 37.8) — paces CLI mirror screen frames so a burst of PTY
 * redraws (the spinner repaints many times a second) collapses to at most one send per
 * interval, while still guaranteeing the LATEST frame in the burst is delivered.
 *
 * Semantics:
 *   - `schedule(value)` — leading edge: if nothing fired within the interval, run `fn`
 *     immediately; otherwise stash `value` as pending and run it once when the interval
 *     elapses (trailing edge, always the most recent value).
 *   - `cancel()` — drop any pending value and clear the timer. Called at turn teardown,
 *     which then sends the final screen directly (outside the throttle) so the last frame
 *     is never lost to an unelapsed interval.
 *
 * Pure / timer-only: no xterm or socket coupling, so it unit-tests with fake timers.
 */
export interface TrailingThrottle<T> {
  schedule(value: T): void;
  cancel(): void;
}

export function createTrailingThrottle<T>(
  intervalMs: number,
  fn: (value: T) => void,
): TrailingThrottle<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const fire = (value: T): void => {
    // Open the cool-down window first; a schedule() during it stashes `pending`, which the
    // trailing timer below flushes. Then run fn.
    timer = setTimeout(onInterval, intervalMs);
    fn(value);
  };

  function onInterval(): void {
    timer = null;
    if (pending) {
      const { value } = pending;
      pending = null;
      fire(value); // trailing edge — re-opens the window so a steady stream keeps pacing
    }
  }

  return {
    schedule(value: T): void {
      if (timer === null) {
        fire(value); // leading edge — nothing in flight, send immediately
      } else {
        pending = { value }; // within the window — keep only the latest
      }
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },
  };
}
