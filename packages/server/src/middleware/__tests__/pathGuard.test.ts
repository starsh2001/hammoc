/**
 * Path Guard Middleware Tests
 * [Source: Story 11.1 - Task 7.1]
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateProjectPath } from '../pathGuard.js';

const PROJECT_ROOT = path.resolve('/tmp/test-project');

describe('validateProjectPath', () => {
  // TC-PG1: Normal relative path returns resolved absolute path
  it('returns resolved absolute path for valid relative path', () => {
    const result = validateProjectPath(PROJECT_ROOT, 'src/index.ts');
    expect(result).toBe(path.resolve(PROJECT_ROOT, 'src/index.ts'));
  });

  it('allows current directory path', () => {
    const result = validateProjectPath(PROJECT_ROOT, '.');
    expect(result).toBe(path.resolve(PROJECT_ROOT));
  });

  it('allows nested paths within project root', () => {
    const result = validateProjectPath(PROJECT_ROOT, 'src/components/App.tsx');
    expect(result).toBe(path.resolve(PROJECT_ROOT, 'src/components/App.tsx'));
  });

  // TC-PG2: ../ path traversal throws error
  it('throws PATH_TRAVERSAL for ../ traversal', () => {
    try {
      validateProjectPath(PROJECT_ROOT, '../etc/passwd');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  // TC-PG3: Absolute paths throw error
  it('throws PATH_TRAVERSAL for Unix absolute path', () => {
    try {
      validateProjectPath(PROJECT_ROOT, '/etc/passwd');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('throws PATH_TRAVERSAL for Windows absolute path', () => {
    try {
      validateProjectPath(PROJECT_ROOT, 'C:\\Windows\\System32');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  // TC-PG4: Null byte throws error
  it('throws PATH_TRAVERSAL for path with null byte', () => {
    try {
      validateProjectPath(PROJECT_ROOT, 'src/index.ts\0.html');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  // TC-PG5: Nested traversal throws error
  it('throws PATH_TRAVERSAL for nested traversal (foo/../../etc/passwd)', () => {
    try {
      validateProjectPath(PROJECT_ROOT, 'foo/../../etc/passwd');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });
});
