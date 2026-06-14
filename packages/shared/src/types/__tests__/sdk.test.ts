/**
 * Tests for the native-1M model helpers in sdk.ts.
 *
 * Policy under test: Opus-family models auto-upgrade to 1M (free on Max), Sonnet
 * (and other 1M-capable models) default to 200K and only run at 1M via an explicit
 * `[1m]` opt-in, and the context meter must report the *real* window.
 */

import { describe, it, expect } from 'vitest';
import {
  stripNative1MSuffix,
  hasNative1MSuffix,
  isNative1MModel,
  isAutoNative1MModel,
  resolveEffectiveModel,
  effectiveModelIs1M,
  correctContextWindow,
} from '../sdk.js';

describe('stripNative1MSuffix', () => {
  it('removes a trailing [1m] suffix (case-insensitive)', () => {
    expect(stripNative1MSuffix('claude-sonnet-4-6[1m]')).toBe('claude-sonnet-4-6');
    expect(stripNative1MSuffix('claude-opus-4-8[1M]')).toBe('claude-opus-4-8');
    expect(stripNative1MSuffix('sonnet[1m]')).toBe('sonnet');
  });

  it('leaves a bare model id unchanged', () => {
    expect(stripNative1MSuffix('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(stripNative1MSuffix('')).toBe('');
  });
});

describe('hasNative1MSuffix', () => {
  it('detects the [1m] opt-in suffix', () => {
    expect(hasNative1MSuffix('claude-sonnet-4-6[1m]')).toBe(true);
    expect(hasNative1MSuffix('opus[1M]')).toBe(true);
  });

  it('is false for bare ids, empty, and undefined', () => {
    expect(hasNative1MSuffix('claude-sonnet-4-6')).toBe(false);
    expect(hasNative1MSuffix('')).toBe(false);
    expect(hasNative1MSuffix(undefined)).toBe(false);
  });
});

describe('isNative1MModel (capability gate — includes Sonnet)', () => {
  it('is true for Opus 4.6/4.7/4.8, Sonnet 4.6, aliases, and [1m] forms', () => {
    for (const m of [
      'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
      'claude-sonnet-4-6', 'claude-sonnet-4-6-20260101',
      'opus', 'sonnet', 'claude-sonnet-4-6[1m]', 'claude-opus-4-8[1m]',
      'claude-fable-5', 'claude-fable-5[1m]',
    ]) {
      expect(isNative1MModel(m)).toBe(true);
    }
  });

  it('is false for non-1M models and undefined', () => {
    for (const m of [
      'claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514',
      'claude-opus-4-5-20251101', 'claude-haiku-4-5-20251001', 'haiku', '',
    ]) {
      expect(isNative1MModel(m)).toBe(false);
    }
    expect(isNative1MModel(undefined)).toBe(false);
  });
});

describe('isAutoNative1MModel (Opus-only — free on Max)', () => {
  it('is true only for the Opus family + alias', () => {
    for (const m of [
      'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
      'claude-opus-4-8-20260101', 'opus', 'claude-opus-4-8[1m]',
    ]) {
      expect(isAutoNative1MModel(m)).toBe(true);
    }
  });

  it('is false for Sonnet/Fable (their 1M is a paid opt-in) and non-1M models', () => {
    for (const m of [
      'claude-sonnet-4-6', 'claude-sonnet-4-6[1m]', 'sonnet',
      'claude-fable-5', 'claude-fable-5[1m]',
      'claude-opus-4-5-20251101', 'haiku', '',
    ]) {
      expect(isAutoNative1MModel(m)).toBe(false);
    }
    expect(isAutoNative1MModel(undefined)).toBe(false);
  });
});

describe('resolveEffectiveModel (engine-boundary suffix resolution)', () => {
  it('auto-applies [1m] for Opus family (free on Max)', () => {
    expect(resolveEffectiveModel('claude-opus-4-8')).toBe('claude-opus-4-8[1m]');
    expect(resolveEffectiveModel('opus')).toBe('opus[1m]');
  });

  it('leaves Sonnet/Fable bare unless explicitly opted in', () => {
    expect(resolveEffectiveModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveEffectiveModel('sonnet')).toBe('sonnet');
    expect(resolveEffectiveModel('claude-sonnet-4-6[1m]')).toBe('claude-sonnet-4-6[1m]');
    expect(resolveEffectiveModel('claude-fable-5')).toBe('claude-fable-5');
    expect(resolveEffectiveModel('claude-fable-5[1m]')).toBe('claude-fable-5[1m]');
  });

  it('is idempotent for already-suffixed and leaves non-1M models bare', () => {
    expect(resolveEffectiveModel('claude-opus-4-8[1m]')).toBe('claude-opus-4-8[1m]');
    expect(resolveEffectiveModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001');
  });

  it('passes through empty/undefined', () => {
    expect(resolveEffectiveModel('')).toBe('');
    expect(resolveEffectiveModel(undefined)).toBeUndefined();
  });
});

describe('effectiveModelIs1M', () => {
  it('is true for Opus auto and explicit Sonnet opt-in', () => {
    expect(effectiveModelIs1M('claude-opus-4-8')).toBe(true);
    expect(effectiveModelIs1M('opus')).toBe(true);
    expect(effectiveModelIs1M('claude-sonnet-4-6[1m]')).toBe(true);
    expect(effectiveModelIs1M('sonnet[1m]')).toBe(true);
  });

  it('is false for bare Sonnet and non-1M models', () => {
    expect(effectiveModelIs1M('claude-sonnet-4-6')).toBe(false);
    expect(effectiveModelIs1M('sonnet')).toBe(false);
    expect(effectiveModelIs1M('haiku')).toBe(false);
    expect(effectiveModelIs1M(undefined)).toBe(false);
  });
});

describe('correctContextWindow', () => {
  it('bumps an under-reported window to 1M only when is1M', () => {
    expect(correctContextWindow(200_000, true)).toBe(1_000_000);
    expect(correctContextWindow(200_000, false)).toBe(200_000);
  });

  it('never shrinks a window already larger than 1M', () => {
    expect(correctContextWindow(1_200_000, true)).toBe(1_200_000);
    expect(correctContextWindow(1_200_000, false)).toBe(1_200_000);
  });
});
