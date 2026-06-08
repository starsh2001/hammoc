/**
 * Synthetic typing queue (CLI-mode typewriter effect).
 *
 * CLI mode delivers assistant text one COMPLETED block at a time — the session JSONL only
 * gains a line when a content block finishes — so the shared streaming path paints each
 * block in a single shot (no typewriter feel). When the user opts in (`cliSyntheticTyping`,
 * CLI mode only), chunks are routed here instead: text is buffered and released a few
 * characters per animation frame via `append`, producing a typing effect. The SDK path is
 * left untouched (it already streams real tokens token-by-token).
 *
 * Speed adapts to the queue length (`ceil(len / targetFrames)`, floored at `minStep`) so a
 * short block types out deliberately while a long block still finishes in ~`targetFrames`
 * frames rather than crawling.
 *
 * The scheduler is injectable (default `requestAnimationFrame`) so the timing-sensitive
 * logic is unit-testable without a real animation frame.
 */
export interface SyntheticTyper {
  /** Queue text to be typed out, a few chars per frame. No-op for empty input. */
  enqueue(chunk: string): void;
  /**
   * Commit ALL queued text immediately and stop the animation. Use at segment-ordering
   * boundaries (a thinking/tool/permission segment must not be interleaved with text that
   * is still typing) so prior text is locked in before the new segment is inserted.
   */
  flush(): void;
  /**
   * Let the queue finish at typing speed, resolving once empty. Use on the completion path
   * so the authoritative message swap waits for the effect to finish instead of cutting it
   * off. Resolves immediately when the queue is already empty.
   */
  drain(): Promise<void>;
  /** Discard all queued text and stop (abort / error / unmount). */
  clear(): void;
  /** Characters still waiting to be typed (introspection / tests). */
  readonly pending: number;
}

export interface SyntheticTyperOptions {
  /** Minimum characters released per frame (deliberate feel for short blocks). Default 2. */
  minStep?: number;
  /** Target frames to drain the whole queue; sets the adaptive step. Default 60 (~1s @60fps). */
  targetFrames?: number;
  /** Frame scheduler (injectable for tests). Default requestAnimationFrame. */
  schedule?: (cb: () => void) => number;
  /** Frame canceller (injectable for tests). Default cancelAnimationFrame. */
  cancel?: (id: number) => void;
}

export function createSyntheticTyper(
  append: (chunk: string) => void,
  options: SyntheticTyperOptions = {},
): SyntheticTyper {
  const minStep = options.minStep ?? 2;
  const targetFrames = options.targetFrames ?? 60;
  const schedule = options.schedule ?? ((cb) => requestAnimationFrame(cb));
  const cancel = options.cancel ?? ((id) => cancelAnimationFrame(id));

  let queue = '';
  let rafId: number | null = null;
  let drainResolve: (() => void) | null = null;
  // Chars released per frame, recomputed on enqueue from the *whole* pending queue so the
  // pace is LINEAR (a fixed step empties the queue in ~targetFrames frames). Recomputing
  // from the shrinking remainder each frame would decay exponentially and never finish on
  // time; fixing it on enqueue keeps the "~targetFrames to drain" contract.
  let step = minStep;

  const refreshStep = () => {
    step = Math.max(minStep, Math.ceil(queue.length / targetFrames));
  };

  const settleDrain = () => {
    if (drainResolve) {
      const resolve = drainResolve;
      drainResolve = null;
      resolve();
    }
  };

  const pump = () => {
    rafId = null;
    if (queue.length === 0) {
      settleDrain();
      return;
    }
    const slice = queue.slice(0, step);
    queue = queue.slice(step);
    append(slice);
    if (queue.length > 0) {
      rafId = schedule(pump);
    } else {
      settleDrain();
    }
  };

  const ensurePumping = () => {
    if (rafId === null) rafId = schedule(pump);
  };

  return {
    enqueue(chunk: string) {
      if (!chunk) return;
      queue += chunk;
      refreshStep();
      ensurePumping();
    },
    flush() {
      if (rafId !== null) {
        cancel(rafId);
        rafId = null;
      }
      if (queue.length > 0) {
        const all = queue;
        queue = '';
        append(all);
      }
      settleDrain();
    },
    drain() {
      return new Promise<void>((resolve) => {
        if (queue.length === 0) {
          resolve();
          return;
        }
        drainResolve = resolve;
        ensurePumping();
      });
    },
    clear() {
      queue = '';
      if (rafId !== null) {
        cancel(rafId);
        rafId = null;
      }
      settleDrain();
    },
    get pending() {
      return queue.length;
    },
  };
}
