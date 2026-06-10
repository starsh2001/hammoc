/**
 * computeScrollSignature — the value-based auto-scroll key (mobile "snaps back to bottom" fix).
 *
 * Root cause it guards: the auto-scroll effect used to depend on a fresh ARRAY built every render,
 * so it ran on EVERY re-render. In CLI mode the spinner frame / 1s elapsed clock / "↓ N tokens"
 * counter re-render the message area several times a second, and each run snapped a reader who had
 * scrolled up a little back to the bottom. These tests pin the contract that makes the fix work:
 * a cosmetic re-render (same content, even with fresh array/object references) yields the SAME
 * signature → the effect does not refire; only genuinely new content changes it.
 */
import { describe, it, expect } from 'vitest';
import { computeScrollSignature } from '../MessageArea';
import type { StreamingSegment } from '../../stores/chatStore';

const text = (content: string): StreamingSegment => ({ type: 'text', content });
const thinking = (content: string): StreamingSegment => ({ type: 'thinking', content });
const tool = (status: 'pending' | 'completed' | 'error'): StreamingSegment =>
  ({ type: 'tool', toolCall: { id: 't1', name: 'Read', input: {} }, status } as unknown as StreamingSegment);

describe('computeScrollSignature', () => {
  it('is STABLE across a cosmetic re-render — same content, fresh references → same signature', () => {
    const messages = [{ id: 'a' }, { id: 'b' }];
    // First render and a later spinner-tick render: React rebuilds `[messages]` and the segment
    // array fresh each time, but the underlying content is unchanged.
    const first = computeScrollSignature([messages], [text('hello')]);
    const spinnerTick = computeScrollSignature([messages], [text('hello')]);
    expect(spinnerTick).toBe(first); // identical → auto-scroll effect will NOT refire → no snap
  });

  it('CHANGES when streaming text grows (real content → should scroll)', () => {
    const messages = [{ id: 'a' }];
    const before = computeScrollSignature([messages], [text('hello')]);
    const after = computeScrollSignature([messages], [text('hello world')]);
    expect(after).not.toBe(before);
  });

  it('CHANGES when a new message is committed (messages length grows)', () => {
    const before = computeScrollSignature([[{ id: 'a' }]], [text('done')]);
    const after = computeScrollSignature([[{ id: 'a' }, { id: 'b' }]], [text('done')]);
    expect(after).not.toBe(before);
  });

  it('CHANGES when a tool transitions pending → completed (result content appended)', () => {
    const messages = [{ id: 'a' }];
    const pending = computeScrollSignature([messages], [tool('pending')]);
    const completed = computeScrollSignature([messages], [tool('completed')]);
    expect(completed).not.toBe(pending);
  });

  it('CHANGES when thinking content grows', () => {
    const messages = [{ id: 'a' }];
    const before = computeScrollSignature([messages], [thinking('a')]);
    const after = computeScrollSignature([messages], [thinking('ab')]);
    expect(after).not.toBe(before);
  });

  it('handles empty dependencies and segments without throwing', () => {
    expect(typeof computeScrollSignature([], [])).toBe('string');
  });
});
