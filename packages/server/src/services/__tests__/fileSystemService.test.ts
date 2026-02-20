/**
 * File System Service Tests
 * Uses real temporary directories for file I/O testing.
 * [Source: Story 11.1 - Task 7.3]
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileSystemService } from '../fileSystemService.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-service-test-'));

  // Create test file structure
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'console.log("hello");');
  await fs.writeFile(path.join(tmpDir, 'readme.md'), '# Test Project\n\nSome content here.');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('fileSystemService.readFile', () => {
  // TC-FS1: Normal text file read
  it('reads text file with correct response fields', async () => {
    const result = await fileSystemService.readFile(tmpDir, 'src/index.ts');

    expect(result.content).toBe('console.log("hello");');
    expect(result.isBinary).toBe(false);
    expect(result.isTruncated).toBe(false);
    expect(result.size).toBeGreaterThan(0);
    expect(result.mimeType).toBe('text/typescript');
  });

  // TC-FS2: Binary file read returns content=null, isBinary=true
  it('returns metadata only for binary file', async () => {
    const binaryPath = path.join(tmpDir, 'image.png');
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xd8]);
    await fs.writeFile(binaryPath, buffer);

    const result = await fileSystemService.readFile(tmpDir, 'image.png');

    expect(result.content).toBeNull();
    expect(result.isBinary).toBe(true);
    expect(result.isTruncated).toBe(false);
    expect(result.size).toBe(buffer.length);
    expect(result.mimeType).toBe('image/png');
  });

  // TC-FS3: Large file (> 1MB) is truncated
  it('truncates files larger than 1MB', async () => {
    const largePath = path.join(tmpDir, 'large.txt');
    // Create a file slightly over 1MB
    const content = 'A'.repeat(1024 * 1024 + 100);
    await fs.writeFile(largePath, content);

    const result = await fileSystemService.readFile(tmpDir, 'large.txt');

    expect(result.isBinary).toBe(false);
    expect(result.isTruncated).toBe(true);
    expect(result.content).not.toBeNull();
    expect(result.content!.length).toBeLessThanOrEqual(1024 * 1024);
    expect(result.size).toBe(content.length);
  });

  // TC-FS8: Empty file (0 bytes) reads successfully with empty content
  it('reads empty file (0 bytes) correctly', async () => {
    const emptyPath = path.join(tmpDir, 'empty.txt');
    await fs.writeFile(emptyPath, '');

    const result = await fileSystemService.readFile(tmpDir, 'empty.txt');

    expect(result.content).toBe('');
    expect(result.isBinary).toBe(false);
    expect(result.isTruncated).toBe(false);
    expect(result.size).toBe(0);
    expect(result.mimeType).toBe('text/plain');
  });

  // TC-FS4: Non-existent file throws FILE_NOT_FOUND
  it('throws FILE_NOT_FOUND for non-existent file', async () => {
    try {
      await fileSystemService.readFile(tmpDir, 'nonexistent.txt');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('FILE_NOT_FOUND');
    }
  });

  it('throws PATH_TRAVERSAL for path traversal attempt', async () => {
    try {
      await fileSystemService.readFile(tmpDir, '../../../etc/passwd');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });
});

describe('fileSystemService.listDirectory', () => {
  // TC-FS5: Directory listing returns entries
  it('lists directory with correct entry fields', async () => {
    const result = await fileSystemService.listDirectory(tmpDir, '.');

    expect(result.path).toBe('.');
    expect(result.entries).toBeInstanceOf(Array);
    expect(result.entries.length).toBeGreaterThan(0);

    // Find the 'src' directory entry
    const srcEntry = result.entries.find((e) => e.name === 'src');
    expect(srcEntry).toBeDefined();
    expect(srcEntry!.type).toBe('directory');
    expect(srcEntry!.size).toBe(0);
    expect(srcEntry!.modifiedAt).toBeTruthy();

    // Find the 'readme.md' file entry
    const readmeEntry = result.entries.find((e) => e.name === 'readme.md');
    expect(readmeEntry).toBeDefined();
    expect(readmeEntry!.type).toBe('file');
    expect(readmeEntry!.size).toBeGreaterThan(0);
    expect(readmeEntry!.modifiedAt).toBeTruthy();
    // Verify modifiedAt is ISO 8601
    expect(new Date(readmeEntry!.modifiedAt).toISOString()).toBe(readmeEntry!.modifiedAt);
  });

  it('lists subdirectory contents', async () => {
    const result = await fileSystemService.listDirectory(tmpDir, 'src');

    expect(result.path).toBe('src');
    const indexEntry = result.entries.find((e) => e.name === 'index.ts');
    expect(indexEntry).toBeDefined();
    expect(indexEntry!.type).toBe('file');
  });

  // TC-FS6: Non-existent directory throws DIRECTORY_NOT_FOUND
  it('throws DIRECTORY_NOT_FOUND for non-existent directory', async () => {
    try {
      await fileSystemService.listDirectory(tmpDir, 'nonexistent-dir');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('DIRECTORY_NOT_FOUND');
    }
  });

  // TC-FS7: File path as directory throws NOT_A_DIRECTORY
  it('throws NOT_A_DIRECTORY when path is a file', async () => {
    try {
      await fileSystemService.listDirectory(tmpDir, 'readme.md');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('NOT_A_DIRECTORY');
    }
  });
});
