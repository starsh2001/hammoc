/**
 * Soft CLI screen-stall watchdog.
 *
 * The reconstructed claude screen changes ~1×/second while a turn is healthy (the spinner glyph
 * rotates and the elapsed clock ticks), so a long flat-line of NO content change is a reliable
 * "claude froze" signal — far more reliable than the removed inactivity timeout, which watched JSONL
 * activity that legitimately pauses during deep thinking. This pure helper turns a stream of screen
 * frames into a single stalled↔live state:
 *
 *   - a CHANGED frame proves liveness → clears any active stall and (re)arms the timer;
 *   - an identical repaint is ignored (no real change);
 *   - after `stallMs` with no change the timer fires `onStallChange(true)` — but ONLY if `isActive()`
 *     still holds (a running, non-modal turn), so a finished turn or a pending permission/question
 *     modal can never false-trigger;
 *   - `dispose()` (turn end) clears the timer so a stale fire can't leak into the next turn, and
 *     drops any active stall.
 *
 * Advisory ONLY: the caller decides what to do with the signal — Hammoc surfaces a "looks stuck —
 * Stop?" affordance and never auto-aborts. The scheduler is injectable so the timing is unit-testable
 * without real timers.
 */
export interface ScreenStallWatchdog {
  /** Feed a screen frame. A changed frame clears the stall and re-arms; an identical one is ignored. */
  noteFrame(frame: string): void;
  /** Tear down at turn end: clear the timer and drop any active stall. */
  dispose(): void;
}

export interface ScreenStallWatchdogOptions {
  /** No-change window in ms. `<= 0` disables the watchdog entirely (noteFrame/dispose become no-ops). */
  stallMs: number;
  /** Fire-guard, re-checked when the timer elapses: is this still a running, non-modal turn? */
  isActive: () => boolean;
  /** Called only on a stalled↔live transition (never repeated for the same state). */
  onStallChange: (stalled: boolean) => void;
  /** Injectable scheduler (tests). Default setTimeout. */
  schedule?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /** Injectable canceller (tests). Default clearTimeout. */
  cancel?: (id: ReturnType<typeof setTimeout>) => void;
}

export function createScreenStallWatchdog(opts: ScreenStallWatchdogOptions): ScreenStallWatchdog {
  const schedule = opts.schedule ?? ((cb, ms) => setTimeout(cb, ms));
  const cancel = opts.cancel ?? ((id) => clearTimeout(id));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFrame: string | null = null;
  let stalled = false;

  const setStalled = (next: boolean) => {
    if (stalled === next) return;
    stalled = next;
    opts.onStallChange(next);
  };

  const clearTimer = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const arm = () => {
    clearTimer();
    if (opts.stallMs <= 0) return;
    timer = schedule(() => {
      timer = null;
      if (opts.isActive()) setStalled(true);
    }, opts.stallMs);
  };

  return {
    noteFrame(frame: string) {
      if (opts.stallMs <= 0) return;
      if (frame === lastFrame) return; // identical repaint — not a real change
      lastFrame = frame;
      setStalled(false); // content moved → live (clears any active stall)
      arm();
    },
    dispose() {
      clearTimer();
      setStalled(false);
    },
  };
}
