/**
 * Presentation queue (CLI-mode reveal animation).
 *
 * CLI mode delivers a whole assistant turn AT ONCE — when the session JSONL gains a line,
 * every block in it (text + tool_use…) is emitted back-to-back in the same tick. The default
 * render path therefore paints the entire turn in one shot, and worse: inserting a tool/
 * thinking card flushes any in-flight typewriter text to completion (segment-ordering guard),
 * so the typing effect is cut to ~0ms whenever the answer also uses a tool.
 *
 * This queue serializes the turn onto a timeline instead:
 *   - text  → typed out char-by-char (via the injected SyntheticTyper)
 *   - cards → each non-text segment (thinking / tool / system) waits `delayMs` after the
 *             previous step finishes, then "bubbles in"
 *   - updates (tool result/progress/…) → ordered after their card, with delayMs = 0
 *
 * Everything runs on ONE promise chain so arrival order == reveal order, regardless of how
 * fast the events actually land. `drain()` lets the completion path wait for the whole effect
 * before swapping in the authoritative messages; `flush()` collapses the rest instantly (used
 * when a permission prompt appears — the user must not wait on an animation to answer); and
 * `clear()` resets for the next stream (abort / new turn).
 *
 * The delay scheduler is injectable (default setTimeout) so the timing is unit-testable.
 */

import {
  createSyntheticTyper,
  type SyntheticTyper,
  type SyntheticTyperOptions,
} from './syntheticTyper';

export interface PresentationQueue {
  /** Queue assistant text to be typed out (ordered after prior steps). No-op for empty input. */
  enqueueText(content: string): void;
  /** Queue a non-text card reveal: wait `delayMs` after the prior step, then run `reveal`. */
  enqueueReveal(reveal: () => void, delayMs: number): void;
  /** Resolve once the whole queued effect has finished (completion path). */
  drain(): Promise<void>;
  /**
   * Collapse the rest of the effect immediately: finish in-flight typing, fire pending delays
   * now, and run subsequent steps without delay. Use when a permission/interactive prompt
   * appears so the user isn't blocked by the animation. Reset by clear().
   */
  flush(): void;
  /** Discard everything and reset (abort / error / new stream). */
  clear(): void;
  /** Pending steps still queued (introspection / tests). */
  readonly pending: number;
}

export interface PresentationQueueOptions {
  /** Sink for typed text — same callback the SyntheticTyper appends through. */
  append: (chunk: string) => void;
  /** Injectable typer (tests). Default: a SyntheticTyper over `append`. */
  typer?: SyntheticTyper;
  /** Options forwarded to the default SyntheticTyper (e.g. a test frame scheduler). */
  typerOptions?: SyntheticTyperOptions;
  /** Delay scheduler (injectable for tests). Default setTimeout. */
  schedule?: (cb: () => void, ms: number) => void;
}

export function createPresentationQueue(options: PresentationQueueOptions): PresentationQueue {
  const typer = options.typer ?? createSyntheticTyper(options.append, options.typerOptions);
  const schedule = options.schedule ?? ((cb, ms) => { setTimeout(cb, ms); });

  let chain: Promise<void> = Promise.resolve();
  // Generation token: clear() flips the current token's `cancelled` so already-queued steps
  // become no-ops, then installs a fresh token + chain for subsequent use.
  let token = { cancelled: false };
  let pending = 0;
  // Once flushed, remaining/new delays resolve instantly and text completes at once, until
  // the next clear() (i.e. next stream) re-enables the animation.
  let flushing = false;
  // In-flight delay resolvers, so flush() can fire them immediately.
  const timers = new Set<{ resolve: () => void }>();

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      if (flushing || ms <= 0) { resolve(); return; }
      const ref = { resolve };
      timers.add(ref);
      schedule(() => { timers.delete(ref); resolve(); }, ms);
    });

  const append = (work: () => Promise<void>) => {
    pending++;
    chain = chain
      .then(work)
      .catch(() => { /* a step failing must not break the chain */ })
      .finally(() => { if (pending > 0) pending--; });
  };

  return {
    enqueueText(content: string) {
      if (!content) return;
      const my = token;
      append(async () => {
        if (my.cancelled) return;
        typer.enqueue(content);
        if (flushing) { typer.flush(); return; }
        await typer.drain();
      });
    },

    enqueueReveal(reveal: () => void, delayMs: number) {
      const my = token;
      append(async () => {
        if (my.cancelled) return;
        await wait(delayMs);
        if (my.cancelled) return;
        reveal();
      });
    },

    async drain() {
      // The chain can grow while we await it (more events arriving), so loop until stable.
      let prev: Promise<void>;
      do {
        prev = chain;
        await prev;
      } while (prev !== chain);
    },

    flush() {
      flushing = true;
      typer.flush();
      for (const ref of timers) ref.resolve();
      timers.clear();
    },

    clear() {
      token.cancelled = true;
      typer.clear();
      for (const ref of timers) ref.resolve();
      timers.clear();
      token = { cancelled: false };
      chain = Promise.resolve();
      pending = 0;
      flushing = false;
    },

    get pending() {
      return pending;
    },
  };
}
