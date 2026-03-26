import { describe, it, expect } from 'vitest';
import { getBaseUuid } from '../messageTree';

describe('messageTree', () => {
  describe('getBaseUuid', () => {
    it('returns UUID for plain message ID', () => {
      expect(getBaseUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('extracts base UUID from text split ID', () => {
      expect(getBaseUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890-text-3')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('extracts base UUID from tool split ID', () => {
      expect(getBaseUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890-tool-xyz')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('extracts base UUID from thinking split ID', () => {
      expect(getBaseUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890-thinking')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('returns original for non-UUID ID', () => {
      expect(getBaseUuid('some-random-id')).toBe('some-random-id');
    });
  });
});
