/**
 * Formatters Tests
 * [Source: Story 3.2 - Task 3]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatProjectPath } from '../formatters';

describe('formatters', () => {
  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Mock current date to 2026-02-01T12:00:00Z
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "방금 전" for less than a minute ago', () => {
      const date = new Date('2026-02-01T11:59:30Z').toISOString();
      expect(formatRelativeTime(date)).toBe('방금 전');
    });

    it('should return minutes for less than an hour ago', () => {
      const date = new Date('2026-02-01T11:30:00Z').toISOString();
      expect(formatRelativeTime(date)).toBe('30분 전');
    });

    it('should return "1분 전" for exactly 1 minute ago', () => {
      const date = new Date('2026-02-01T11:59:00Z').toISOString();
      expect(formatRelativeTime(date)).toBe('1분 전');
    });

    it('should return hours for less than a day ago', () => {
      const date = new Date('2026-02-01T09:00:00Z').toISOString();
      expect(formatRelativeTime(date)).toBe('3시간 전');
    });

    it('should return "1시간 전" for exactly 1 hour ago', () => {
      const date = new Date('2026-02-01T11:00:00Z').toISOString();
      expect(formatRelativeTime(date)).toBe('1시간 전');
    });

    it('should return days for more than a day ago', () => {
      const date = new Date('2026-01-29T12:00:00Z').toISOString();
      expect(formatRelativeTime(date)).toBe('3일 전');
    });

    it('should return "1일 전" for exactly 1 day ago', () => {
      const date = new Date('2026-01-31T12:00:00Z').toISOString();
      expect(formatRelativeTime(date)).toBe('1일 전');
    });
  });

  describe('formatProjectPath', () => {
    it('should replace Unix home directory with ~', () => {
      expect(formatProjectPath('/Users/john/projects/my-app')).toBe('~/projects/my-app');
    });

    it('should replace Windows home directory with ~', () => {
      expect(formatProjectPath('C:\\Users\\john\\projects\\my-app')).toBe('~\\projects\\my-app');
    });

    it('should not modify paths without home directory', () => {
      expect(formatProjectPath('/opt/projects/my-app')).toBe('/opt/projects/my-app');
    });

    it('should truncate long paths', () => {
      const longPath = '/Users/john/very/long/path/that/exceeds/the/maximum/length/allowed/for/display/in/ui';
      const result = formatProjectPath(longPath);
      expect(result.length).toBeLessThanOrEqual(40);
      expect(result.startsWith('...')).toBe(true);
    });

    it('should not truncate short paths', () => {
      const shortPath = '/Users/john/app';
      const result = formatProjectPath(shortPath);
      expect(result).toBe('~/app');
      expect(result.startsWith('...')).toBe(false);
    });

    it('should handle exact max length', () => {
      // After ~ replacement, path becomes exactly 40 chars
      const path = '/Users/j/abcdefghijklmnopqrstuvwxyz1234567';
      const result = formatProjectPath(path);
      expect(result.length).toBeLessThanOrEqual(40);
    });
  });
});
