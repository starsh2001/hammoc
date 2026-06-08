import { describe, it, expect, vi } from 'vitest';
import { createSyntheticTyper } from '../syntheticTyper';

/**
 * Manual frame scheduler — replaces requestAnimationFrame so each "frame" is advanced
 * explicitly (`tick`) and the timing-sensitive pump is fully deterministic.
 */
function manualScheduler() {
  let nextId = 1;
  const cbs = new Map<number, () => void>();
  return {
    schedule(cb: () => void): number {
      const id = nextId++;
      cbs.set(id, cb);
      return id;
    },
    cancel(id: number): void {
      cbs.delete(id);
    },
    /** Run the single earliest-scheduled frame callback, if any. */
    tick(): void {
      const first = [...cbs.entries()][0];
      if (!first) return;
      const [id, cb] = first;
      cbs.delete(id);
      cb();
    },
    /** Run frames until none remain (bounded so a bug can't hang the test). */
    runAll(maxTicks = 10_000): void {
      let n = 0;
      while (cbs.size > 0 && n++ < maxTicks) this.tick();
    },
    get size(): number {
      return cbs.size;
    },
  };
}

function setup(text: string[], opts?: { minStep?: number; targetFrames?: number }) {
  const sched = manualScheduler();
  const appended: string[] = [];
  const typer = createSyntheticTyper((s) => appended.push(s), {
    minStep: opts?.minStep ?? 2,
    targetFrames: opts?.targetFrames ?? 60,
    schedule: sched.schedule.bind(sched),
    cancel: sched.cancel.bind(sched),
  });
  for (const t of text) typer.enqueue(t);
  return { sched, appended, typer, joined: () => appended.join('') };
}

describe('createSyntheticTyper', () => {
  it('releases text a few characters per frame and reconstructs the full input in order', () => {
    const { sched, appended, joined } = setup(['Hello, world!'], { minStep: 2, targetFrames: 60 });
    // Nothing painted until the first frame runs.
    expect(appended).toHaveLength(0);
    sched.runAll();
    expect(joined()).toBe('Hello, world!');
    // Multiple small slices, not one shot (typewriter feel).
    expect(appended.length).toBeGreaterThan(1);
  });

  it('uses minStep for short blocks (deliberate pace)', () => {
    const { sched, appended } = setup(['abcdef'], { minStep: 2, targetFrames: 60 });
    sched.tick(); // first frame
    // 6 chars / 60 target → ceil = 1, floored to minStep 2.
    expect(appended[0]).toBe('ab');
    expect(appended[0].length).toBe(2);
  });

  it('adapts the step up for long blocks so they finish quickly', () => {
    const long = 'x'.repeat(600);
    const { sched, appended } = setup([long], { minStep: 2, targetFrames: 60 });
    sched.tick();
    // 600 / 60 = 10 chars per frame (well above minStep).
    expect(appended[0].length).toBe(10);
  });

  it('drains the entire queue within ~targetFrames frames for a long block', () => {
    const long = 'y'.repeat(600);
    const sched = manualScheduler();
    const appended: string[] = [];
    const typer = createSyntheticTyper((s) => appended.push(s), {
      minStep: 2, targetFrames: 60, schedule: sched.schedule.bind(sched), cancel: sched.cancel.bind(sched),
    });
    typer.enqueue(long);
    let frames = 0;
    while (sched.size > 0 && frames < 1000) { sched.tick(); frames++; }
    expect(appended.join('')).toBe(long);
    expect(frames).toBeLessThanOrEqual(61); // ~targetFrames (not hundreds)
  });

  it('flush() commits all remaining text immediately and stops the animation', () => {
    const { sched, appended, typer, joined } = setup(['abcdefghij'], { minStep: 2, targetFrames: 60 });
    sched.tick(); // 'ab'
    expect(joined()).toBe('ab');
    typer.flush(); // remaining 'cdefghij' in one shot
    expect(joined()).toBe('abcdefghij');
    expect(typer.pending).toBe(0);
    expect(sched.size).toBe(0); // no pending frame left
  });

  it('clear() discards queued text and paints nothing further', () => {
    const { sched, appended, typer } = setup(['abcdefghij'], { minStep: 2, targetFrames: 60 });
    sched.tick(); // 'ab'
    typer.clear();
    expect(typer.pending).toBe(0);
    sched.runAll();
    expect(appended.join('')).toBe('ab'); // only what was painted before clear
  });

  it('drain() resolves only after the queue empties at typing speed', async () => {
    const { sched, typer, joined } = setup(['abcdefgh'], { minStep: 2, targetFrames: 60 });
    let resolved = false;
    const p = typer.drain().then(() => { resolved = true; });
    // Drive frames asynchronously so the awaited promise can settle.
    while (sched.size > 0) {
      sched.tick();
      await Promise.resolve();
    }
    await p;
    expect(resolved).toBe(true);
    expect(joined()).toBe('abcdefgh');
    expect(typer.pending).toBe(0);
  });

  it('drain() resolves immediately when the queue is already empty', async () => {
    const sched = manualScheduler();
    const typer = createSyntheticTyper(() => {}, {
      schedule: sched.schedule.bind(sched), cancel: sched.cancel.bind(sched),
    });
    await expect(typer.drain()).resolves.toBeUndefined();
  });

  it('clear() unblocks a pending drain() (no hang on abort during completion)', async () => {
    const { sched, typer } = setup(['abcdefgh'], { minStep: 2, targetFrames: 60 });
    let resolved = false;
    const p = typer.drain().then(() => { resolved = true; });
    sched.tick(); // partial
    typer.clear(); // abort mid-drain
    await p;
    expect(resolved).toBe(true);
    expect(typer.pending).toBe(0);
  });

  it('flush() unblocks a pending drain()', async () => {
    const { typer, joined } = setup(['abcdefgh'], { minStep: 2, targetFrames: 60 });
    let resolved = false;
    const p = typer.drain().then(() => { resolved = true; });
    typer.flush();
    await p;
    expect(resolved).toBe(true);
    expect(joined()).toBe('abcdefgh');
  });

  it('accumulates text enqueued across multiple chunks (blocks arriving over time)', () => {
    const { sched, joined } = setup(['Part one. ', 'Part two.'], { minStep: 3, targetFrames: 60 });
    sched.runAll();
    expect(joined()).toBe('Part one. Part two.');
  });

  it('enqueue() ignores empty strings (no phantom frame)', () => {
    const sched = manualScheduler();
    const typer = createSyntheticTyper(() => {}, {
      schedule: sched.schedule.bind(sched), cancel: sched.cancel.bind(sched),
    });
    typer.enqueue('');
    expect(sched.size).toBe(0);
    expect(typer.pending).toBe(0);
  });

  it('defaults to requestAnimationFrame when no scheduler is injected', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1 as unknown as number);
    const typer = createSyntheticTyper(() => {});
    typer.enqueue('hi');
    expect(rafSpy).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });
});
