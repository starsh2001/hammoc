/**
 * ThinkingEffort type tests (Story 26.1)
 * Validates type definitions at runtime via assignment checks
 */

import { describe, it, expect } from 'vitest';
import type { ThinkingEffort, ChatOptions } from '../types/sdk.js';
import type { UserPreferences } from '../types/preferences.js';

describe('ThinkingEffort type', () => {
  it('should accept valid effort values', () => {
    const values: ThinkingEffort[] = ['low', 'medium', 'high', 'max'];
    expect(values).toHaveLength(4);
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
    expect(values).toContain('max');
  });

  it('ChatOptions.effort should be optional', () => {
    const withEffort: ChatOptions = { effort: 'high' };
    const withoutEffort: ChatOptions = {};
    expect(withEffort.effort).toBe('high');
    expect(withoutEffort.effort).toBeUndefined();
  });

  it('UserPreferences.defaultEffort should be optional', () => {
    const withDefault: UserPreferences = { defaultEffort: 'medium' };
    const withoutDefault: UserPreferences = {};
    expect(withDefault.defaultEffort).toBe('medium');
    expect(withoutDefault.defaultEffort).toBeUndefined();
  });
});
