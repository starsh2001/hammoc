/**
 * Path Guard Middleware Tests
 * [Source: Story 11.1 - Task 7.1]
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateProjectPath, validateReadPath } from '../pathGuard.js';

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

describe('validateReadPath', () => {
  const ALLOWED_ROOT = path.resolve('/home/user');

  it('returns resolved path for relative path within project', () => {
    const result = validateReadPath(PROJECT_ROOT, 'src/index.ts');
    expect(result).toBe(path.resolve(PROJECT_ROOT, 'src/index.ts'));
  });

  it('allows absolute paths under an allowed root', () => {
    const result = validateReadPath(PROJECT_ROOT, '/home/user/.claude/sessions/test.jsonl', [ALLOWED_ROOT]);
    expect(result).toBe(path.resolve('/home/user/.claude/sessions/test.jsonl'));
  });

  it('allows Windows absolute paths under an allowed root', () => {
    const winRoot = 'C:\\Users\\test';
    const result = validateReadPath(PROJECT_ROOT, 'C:\\Users\\test\\.claude\\sessions\\test.jsonl', [winRoot]);
    expect(result).toBe(path.resolve('C:\\Users\\test\\.claude\\sessions\\test.jsonl'));
  });

  it('throws PATH_TRAVERSAL for absolute path not in any allowed root', () => {
    try {
      validateReadPath(PROJECT_ROOT, '/etc/passwd', [ALLOWED_ROOT]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('throws PATH_TRAVERSAL for relative path escaping project without allowed root', () => {
    try {
      validateReadPath(PROJECT_ROOT, '../../../etc/passwd');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('throws PATH_TRAVERSAL for null bytes', () => {
    try {
      validateReadPath(PROJECT_ROOT, 'src/index.ts\0.html');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('throws PATH_TRAVERSAL for UNC paths', () => {
    try {
      validateReadPath(PROJECT_ROOT, '\\\\server\\share\\file.txt', [ALLOWED_ROOT]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('allows reading from multiple allowed roots', () => {
    const root2 = path.resolve('/opt/data');
    const result = validateReadPath(PROJECT_ROOT, '/opt/data/file.txt', [ALLOWED_ROOT, root2]);
    expect(result).toBe(path.resolve('/opt/data/file.txt'));
  });

  it('ignores relative allowed roots (only absolute allowed)', () => {
    try {
      validateReadPath(PROJECT_ROOT, '/somewhere/file.txt', ['relative/path']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('throws PATH_TRAVERSAL for forward-slash UNC paths', () => {
    try {
      validateReadPath(PROJECT_ROOT, '//server/share/file.txt', [ALLOWED_ROOT]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });

  it('allows files starting with double dots in name (e.g. ..hidden)', () => {
    const result = validateReadPath(PROJECT_ROOT, '..hidden/file.txt');
    expect(result).toBe(path.resolve(PROJECT_ROOT, '..hidden/file.txt'));
  });
});
