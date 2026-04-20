/**
 * Effort Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import { clampEffortForModel } from '../effortUtils.js';

describe('clampEffortForModel', () => {
  describe('undefined / empty inputs', () => {
    it('returns undefined when effort is undefined', () => {
      expect(clampEffortForModel(undefined, 'sonnet-4-6')).toBeUndefined();
    });

    it('returns the effort unchanged when model is undefined (cannot clamp without capability info)', () => {
      expect(clampEffortForModel('high', undefined)).toBe('high');
    });

    it('clamps max → high when model is undefined (cannot verify capability → fall back to safe)', () => {
      expect(clampEffortForModel('max', undefined)).toBe('high');
    });

    it('clamps xhigh → high when model is undefined', () => {
      expect(clampEffortForModel('xhigh', undefined)).toBe('high');
    });
  });

  describe('passthrough levels (none/low/medium/high)', () => {
    it.each(['none', 'low', 'medium', 'high'] as const)('passes %s through regardless of model', (effort) => {
      expect(clampEffortForModel(effort, 'haiku')).toBe(effort);
      expect(clampEffortForModel(effort, 'opus')).toBe(effort);
      expect(clampEffortForModel(effort, 'some-unknown-model')).toBe(effort);
    });
  });

  describe('max effort capability matrix', () => {
    it.each([
      'opus',
      'sonnet',
      'claude-opus-4-6',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-opus-4-6-20250914',
      'claude-sonnet-4-6[1m]',
    ])('keeps max for supporting model %s', (model) => {
      expect(clampEffortForModel('max', model)).toBe('max');
    });

    it.each([
      'haiku',
      'claude-haiku-4-5',
      'claude-sonnet-4-5',
      'claude-opus-4-5',
      'gpt-4',
      '',
    ])('clamps max → high for unsupporting model %s', (model) => {
      expect(clampEffortForModel('max', model)).toBe('high');
    });
  });

  describe('xhigh effort capability matrix', () => {
    it.each([
      'opus',
      'claude-opus-4-7',
      'claude-opus-4-7[1m]',
    ])('keeps xhigh for supporting model %s', (model) => {
      expect(clampEffortForModel('xhigh', model)).toBe('xhigh');
    });

    it.each([
      'sonnet',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'haiku',
      'claude-haiku-4-5',
    ])('clamps xhigh → high for unsupporting model %s', (model) => {
      expect(clampEffortForModel('xhigh', model)).toBe('high');
    });
  });
});
