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

describe('fileSystemService.writeFile', () => {
  // TC-WR1: Normal file write
  it('writes file and returns success with size', async () => {
    const content = 'Hello, World!';
    const result = await fileSystemService.writeFile(tmpDir, 'src/newfile.ts', content);

    expect(result.success).toBe(true);
    expect(result.size).toBeGreaterThan(0);

    // Verify content was written
    const written = await fs.readFile(path.join(tmpDir, 'src', 'newfile.ts'), 'utf-8');
    expect(written).toBe(content);
  });

  // TC-WR2: Overwrite existing file
  it('overwrites existing file content', async () => {
    const newContent = 'console.log("updated");';
    const result = await fileSystemService.writeFile(tmpDir, 'src/index.ts', newContent);

    expect(result.success).toBe(true);

    const written = await fs.readFile(path.join(tmpDir, 'src', 'index.ts'), 'utf-8');
    expect(written).toBe(newContent);
  });

  // TC-WR3: Parent directory not found
  it('throws PARENT_NOT_FOUND when parent directory does not exist', async () => {
    try {
      await fileSystemService.writeFile(tmpDir, 'nonexistent/dir/file.ts', 'content');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PARENT_NOT_FOUND');
    }
  });

  // TC-WR4: Empty string content writes 0-byte file
  it('writes empty string content as 0-byte file', async () => {
    const result = await fileSystemService.writeFile(tmpDir, 'src/empty.ts', '');

    expect(result.success).toBe(true);
    expect(result.size).toBe(0);

    const written = await fs.readFile(path.join(tmpDir, 'src', 'empty.ts'), 'utf-8');
    expect(written).toBe('');
  });
});

describe('fileSystemService.createEntry', () => {
  // TC-CR1: Create empty file
  it('creates empty file', async () => {
    const result = await fileSystemService.createEntry(tmpDir, 'src/newfile.ts', 'file');

    expect(result.success).toBe(true);
    expect(result.type).toBe('file');
    expect(result.path).toBe('src/newfile.ts');

    const stat = await fs.stat(path.join(tmpDir, 'src', 'newfile.ts'));
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBe(0);
  });

  // TC-CR2: Create directory
  it('creates directory', async () => {
    const result = await fileSystemService.createEntry(tmpDir, 'src/components', 'directory');

    expect(result.success).toBe(true);
    expect(result.type).toBe('directory');
    expect(result.path).toBe('src/components');

    const stat = await fs.stat(path.join(tmpDir, 'src', 'components'));
    expect(stat.isDirectory()).toBe(true);
  });

  // TC-CR3: Already exists
  it('throws FILE_ALREADY_EXISTS when path already exists', async () => {
    try {
      await fileSystemService.createEntry(tmpDir, 'src/index.ts', 'file');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('FILE_ALREADY_EXISTS');
    }
  });

  // TC-CR4: Parent directory not found
  it('throws PARENT_NOT_FOUND when parent directory does not exist', async () => {
    try {
      await fileSystemService.createEntry(tmpDir, 'nonexistent/dir/file.ts', 'file');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PARENT_NOT_FOUND');
    }
  });
});

describe('fileSystemService.deleteEntry', () => {
  // TC-DE1: Delete file
  it('deletes a file', async () => {
    const result = await fileSystemService.deleteEntry(tmpDir, 'readme.md');

    expect(result.success).toBe(true);
    expect(result.path).toBe('readme.md');

    // Verify file is gone
    try {
      await fs.stat(path.join(tmpDir, 'readme.md'));
      expect.fail('File should have been deleted');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  // TC-DE2: Delete directory recursively
  it('deletes a directory recursively', async () => {
    const result = await fileSystemService.deleteEntry(tmpDir, 'src');

    expect(result.success).toBe(true);
    expect(result.path).toBe('src');

    try {
      await fs.stat(path.join(tmpDir, 'src'));
      expect.fail('Directory should have been deleted');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  // TC-DE3: Non-existent file
  it('throws FILE_NOT_FOUND for non-existent file', async () => {
    try {
      await fileSystemService.deleteEntry(tmpDir, 'nonexistent.txt');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('FILE_NOT_FOUND');
    }
  });

  // TC-DE4: Protected path without force
  it('throws PROTECTED_PATH for .git without force', async () => {
    await fs.mkdir(path.join(tmpDir, '.git'));
    await fs.writeFile(path.join(tmpDir, '.git', 'config'), 'test');

    try {
      await fileSystemService.deleteEntry(tmpDir, '.git', false);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PROTECTED_PATH');
    }
  });

  // TC-DE5: Protected path with force
  it('deletes .git directory with force=true', async () => {
    await fs.mkdir(path.join(tmpDir, '.git'));
    await fs.writeFile(path.join(tmpDir, '.git', 'config'), 'test');

    const result = await fileSystemService.deleteEntry(tmpDir, '.git', true);

    expect(result.success).toBe(true);
    expect(result.path).toBe('.git');
  });

  // TC-DE6: Protected sub-path without force
  it('throws PROTECTED_PATH for .git/config without force', async () => {
    await fs.mkdir(path.join(tmpDir, '.git'));
    await fs.writeFile(path.join(tmpDir, '.git', 'config'), 'test');

    try {
      await fileSystemService.deleteEntry(tmpDir, '.git/config', false);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PROTECTED_PATH');
    }
  });
});

describe('fileSystemService.renameEntry', () => {
  // TC-RN1: Rename file
  it('renames a file', async () => {
    const result = await fileSystemService.renameEntry(tmpDir, 'readme.md', 'docs.md');

    expect(result.success).toBe(true);
    expect(result.oldPath).toBe('readme.md');
    expect(result.newPath).toBe('docs.md');

    // Verify rename
    const stat = await fs.stat(path.join(tmpDir, 'docs.md'));
    expect(stat.isFile()).toBe(true);

    // Verify old file is gone
    try {
      await fs.stat(path.join(tmpDir, 'readme.md'));
      expect.fail('Old file should not exist');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  // TC-RN2: Target already exists
  it('throws RENAME_TARGET_EXISTS when target already exists', async () => {
    try {
      await fileSystemService.renameEntry(tmpDir, 'readme.md', 'src/index.ts');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('RENAME_TARGET_EXISTS');
    }
  });

  // TC-RN3: Source not found
  it('throws FILE_NOT_FOUND when source does not exist', async () => {
    try {
      await fileSystemService.renameEntry(tmpDir, 'nonexistent.txt', 'new.txt');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('FILE_NOT_FOUND');
    }
  });

  // TC-RN4: Target parent directory not found
  it('throws PARENT_NOT_FOUND when target parent does not exist', async () => {
    try {
      await fileSystemService.renameEntry(tmpDir, 'readme.md', 'nonexistent/dir/readme.md');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PARENT_NOT_FOUND');
    }
  });

  // TC-RN5: Path traversal on newPath
  it('throws PATH_TRAVERSAL for traversal attempt on newPath', async () => {
    try {
      await fileSystemService.renameEntry(tmpDir, 'readme.md', '../../../etc/evil');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_TRAVERSAL');
    }
  });
});
