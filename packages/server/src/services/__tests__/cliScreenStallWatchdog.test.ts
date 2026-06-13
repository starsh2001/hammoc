/**
 * cliScreenStallWatchdog — unit tests.
 *
 * The watchdog turns a stream of screen frames into one stalled↔live signal: a CHANGED frame proves
 * liveness (clears + re-arms); after the window with no change it fires `stalled:true` — but only if
 * the turn is still active (fire-guard), so a modal/turn-end can't false-trigger. The scheduler is
 * injected so timing is deterministic without real timers. server runs with globals: false.
 */
import { describe, it, expect } from 'vitest';
import { createScreenStallWatchdog } from '../cliScreenStallWatchdog.js';

/** Controllable fake scheduler: holds the single pending timer; fire() runs it, cancel() drops it. */
function makeScheduler() {
  let pending: { cb: () => void; id: number } | null = null;
  let nextId = 1;
  return {
    schedule: (cb: () => void) => {
      const id = nextId++;
      pending = { cb, id };
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (id: ReturnType<typeof setTimeout>) => {
      if (pending && pending.id === (id as unknown as number)) pending = null;
    },
    fire: () => {
      const p = pending;
      pending = null;
      p?.cb();
    },
    get armed() {
      return pending !== null;
    },
  };
}

describe('createScreenStallWatchdog', () => {
  it('fires stalled:true after the window with no change, then clears on the next CHANGED frame', () => {
    const sched = makeScheduler();
    const changes: boolean[] = [];
    const wd = createScreenStallWatchdog({
      stallMs: 1000,
      isActive: () => true,
      onStallChange: (s) => changes.push(s),
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    wd.noteFrame('A'); // arms the window
    expect(sched.armed).toBe(true);
    expect(changes).toEqual([]); // not stalled yet

    sched.fire(); // window elapsed with no change
    expect(changes).toEqual([true]);

    wd.noteFrame('B'); // content moved → live again (clears the stall + re-arms)
    expect(changes).toEqual([true, false]);
    expect(sched.armed).toBe(true);
  });

  it('does NOT fire when the turn is no longer active at fire time (modal / turn-end guard)', () => {
    const sched = makeScheduler();
    const changes: boolean[] = [];
    let active = true;
    const wd = createScreenStallWatchdog({
      stallMs: 1000,
      isActive: () => active,
      onStallChange: (s) => changes.push(s),
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    wd.noteFrame('A');
    active = false; // a permission/question modal popped, or the turn ended, before the timer elapsed
    sched.fire();
    expect(changes).toEqual([]); // guarded — no false stall
  });

  it('ignores an identical repaint — it does NOT prove liveness (a stall stays)', () => {
    const sched = makeScheduler();
    const changes: boolean[] = [];
    const wd = createScreenStallWatchdog({
      stallMs: 1000,
      isActive: () => true,
      onStallChange: (s) => changes.push(s),
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    wd.noteFrame('A');
    sched.fire();
    expect(changes).toEqual([true]);

    wd.noteFrame('A'); // same frame → not a real change → must NOT clear the stall
    expect(changes).toEqual([true]);
  });

  it('dispose() cancels a pending timer so a stale fire cannot leak into the next turn', () => {
    const sched = makeScheduler();
    const changes: boolean[] = [];
    const wd = createScreenStallWatchdog({
      stallMs: 1000,
      isActive: () => true,
      onStallChange: (s) => changes.push(s),
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    wd.noteFrame('A');
    expect(sched.armed).toBe(true);
    wd.dispose();
    expect(sched.armed).toBe(false); // timer cancelled
    expect(changes).toEqual([]); // never stalled
  });

  it('dispose() drops an active stall (clears the affordance at turn end)', () => {
    const sched = makeScheduler();
    const changes: boolean[] = [];
    const wd = createScreenStallWatchdog({
      stallMs: 1000,
      isActive: () => true,
      onStallChange: (s) => changes.push(s),
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    wd.noteFrame('A');
    sched.fire();
    expect(changes).toEqual([true]);
    wd.dispose();
    expect(changes).toEqual([true, false]);
  });

  it('stallMs <= 0 disables it entirely — noteFrame never arms and never fires', () => {
    const sched = makeScheduler();
    const changes: boolean[] = [];
    const wd = createScreenStallWatchdog({
      stallMs: 0,
      isActive: () => true,
      onStallChange: (s) => changes.push(s),
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    wd.noteFrame('A');
    expect(sched.armed).toBe(false);
    expect(changes).toEqual([]);
  });
});
