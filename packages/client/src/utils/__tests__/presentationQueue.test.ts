import { describe, it, expect } from 'vitest';
import { createPresentationQueue } from '../presentationQueue';
import type { SyntheticTyper } from '../syntheticTyper';

/** Flush the microtask queue a few times so the promise-chain steps settle deterministically. */
const tick = async (n = 8) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

/**
 * Controllable fake typer: records calls and lets the test decide when typing "finishes"
 * (resolve the pending drain). This makes the text→card ordering testable without real rAF.
 */
function makeFakeTyper() {
  const events: string[] = [];
  let drainResolve: (() => void) | null = null;
  const typer: SyntheticTyper = {
    enqueue: (c: string) => { if (c) events.push('enqueue'); },
    flush: () => { events.push('flush'); drainResolve?.(); drainResolve = null; },
    drain: () => new Promise<void>((r) => { drainResolve = r; }),
    clear: () => { events.push('clear'); drainResolve?.(); drainResolve = null; },
    get pending() { return 0; },
  };
  return {
    typer,
    events,
    finishTyping: () => { drainResolve?.(); drainResolve = null; },
    isTyping: () => drainResolve !== null,
  };
}

function makeScheduler() {
  const scheduled: Array<{ cb: () => void; ms: number }> = [];
  return {
    schedule: (cb: () => void, ms: number) => { scheduled.push({ cb, ms }); },
    scheduled,
    fireAll: () => { const all = scheduled.splice(0); all.forEach((s) => s.cb()); },
  };
}

describe('presentationQueue', () => {
  it('routes text through the typer (typed out, not appended directly)', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueText('hello');
    await tick();

    expect(fake.events).toEqual(['enqueue']);
    expect(fake.isTyping()).toBe(true); // still typing (awaiting drain)
  });

  it('reveals a card only AFTER the preceding text finishes, then waits delayMs', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueText('hello');
    q.enqueueReveal(() => events.push('card'), 500);
    await tick();

    // Text is typing; the card has NOT scheduled its delay yet (ordered after text).
    expect(sched.scheduled).toHaveLength(0);
    expect(events).toEqual([]);

    fake.finishTyping();
    await tick();

    // Now the card's stagger delay is scheduled (500ms), card still not shown.
    expect(sched.scheduled).toHaveLength(1);
    expect(sched.scheduled[0].ms).toBe(500);
    expect(events).toEqual([]);

    sched.fireAll();
    await tick();
    expect(events).toEqual(['card']);
  });

  it('orders multiple cards one-after-another, each with its own stagger', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueReveal(() => events.push('a'), 500);
    q.enqueueReveal(() => events.push('b'), 500);
    await tick();

    // Only the first card's delay is pending; the second waits for the first to land.
    expect(sched.scheduled).toHaveLength(1);
    sched.fireAll();
    await tick();
    expect(events).toEqual(['a']);

    expect(sched.scheduled).toHaveLength(1); // now the second card's delay
    sched.fireAll();
    await tick();
    expect(events).toEqual(['a', 'b']);
  });

  it('treats delayMs <= 0 as an in-order update with no scheduled gap', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueReveal(() => events.push('update'), 0);
    await tick();

    expect(sched.scheduled).toHaveLength(0); // no timer for a zero-delay update
    expect(events).toEqual(['update']);
  });

  it('flush() finishes typing immediately and fires pending delays', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueText('hello');
    q.enqueueReveal(() => events.push('card'), 500);
    await tick();
    expect(fake.isTyping()).toBe(true);

    q.flush();
    await tick();

    // Typing was force-completed and the card's delay collapsed → card revealed.
    expect(fake.events).toContain('flush');
    expect(events).toEqual(['card']);
  });

  it('clear() cancels queued reveals (they do not run)', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueText('hello');
    q.enqueueReveal(() => events.push('card'), 500);
    q.clear();
    await tick();
    sched.fireAll();
    await tick();

    expect(fake.events).toContain('clear');
    expect(events).toEqual([]); // the cancelled card never reveals
  });

  it('flush() unblocks a pending drain() even when the typer and timers never fire (mobile sleep/wake)', async () => {
    // Mobile screen lock freezes BOTH schedulers: requestAnimationFrame (typing) stops and
    // setTimeout (card stagger) pauses. Here that's modeled by never calling finishTyping() and
    // never calling sched.fireAll(). The completion path awaits drain() — it must not hang.
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueText('hello');
    q.enqueueReveal(() => events.push('card'), 500);

    let drained = false;
    const p = q.drain().then(() => { drained = true; });

    await tick();
    // Frozen: typing never settles and the stagger timer never fires → drain stays pending.
    expect(drained).toBe(false);
    expect(fake.isTyping()).toBe(true);

    // Tab goes hidden → flush() collapses the animation so drain() can resolve immediately,
    // WITHOUT the test ever firing the typer or the scheduler.
    q.flush();
    await tick();
    await p;

    expect(drained).toBe(true);
    expect(events).toEqual(['card']); // the card still revealed, in order
  });

  it('forwards the per-chunk provisional flag from enqueueText to the append sink (Story 37.11 AC4)', async () => {
    // The provisional flag rides the default-typer wrapper (`options.typer` is intentionally NOT
    // injected so the queue builds the wrapper that reads `currentProvisional`). A controllable rAF
    // schedule lets the test drive the typer deterministically.
    const appended: Array<{ chunk: string; provisional?: boolean }> = [];
    const frames: Array<() => void> = [];
    const q = createPresentationQueue({
      append: (chunk, provisional) => { appended.push({ chunk, provisional }); },
      typerOptions: { minStep: 100, schedule: (cb) => { frames.push(cb); return frames.length; } },
    });
    const runFrames = async () => { while (frames.length) { const f = frames.shift()!; f(); } await tick(); };

    q.enqueueText('live screen text', true);
    await tick();
    await runFrames();
    expect(appended).toEqual([{ chunk: 'live screen text', provisional: true }]);

    // An authoritative chunk (file-drain backstop) forwards provisional=false — not dimmed.
    q.enqueueText('authoritative text', false);
    await tick();
    await runFrames();
    expect(appended[appended.length - 1]).toEqual({ chunk: 'authoritative text', provisional: false });
  });

  it('drain() resolves once the queue has fully played out', async () => {
    const fake = makeFakeTyper();
    const sched = makeScheduler();
    const events: string[] = [];
    const q = createPresentationQueue({ append: () => {}, typer: fake.typer, schedule: sched.schedule });

    q.enqueueText('hello');
    q.enqueueReveal(() => events.push('card'), 500);

    let drained = false;
    const p = q.drain().then(() => { drained = true; });

    await tick();
    expect(drained).toBe(false); // still typing

    fake.finishTyping();
    await tick();
    sched.fireAll();
    await tick();
    await p;
    expect(drained).toBe(true);
    expect(events).toEqual(['card']);
  });
});
