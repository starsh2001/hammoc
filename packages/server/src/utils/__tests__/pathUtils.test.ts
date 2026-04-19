/**
 * Path Utilities Tests
 * [Source: Story 11.1 - Task 7.2]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { isBinaryFile, getMimeType, MAX_FILE_SIZE, isProtectedPath } from '../pathUtils.js';

describe('isBinaryFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pathutils-test-'));
  });

  // TC-PU1: Text file returns false
  it('returns false for text file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(filePath, 'Hello, this is a text file\nWith multiple lines\n');
    expect(await isBinaryFile(filePath)).toBe(false);
  });

  // TC-PU2: Binary file (null byte) returns true
  it('returns true for binary file with null bytes', async () => {
    const filePath = path.join(tmpDir, 'test.bin');
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG-like header with null byte
    await fs.writeFile(filePath, buffer);
    expect(await isBinaryFile(filePath)).toBe(true);
  });

  it('returns false for empty-like text file', async () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    await fs.writeFile(filePath, 'a');
    expect(await isBinaryFile(filePath)).toBe(false);
  });

  // ZIP headers (PK\x03\x04) contain no null bytes, so the null-byte
  // heuristic alone misclassifies them as text. Extension allowlist covers it.
  it('returns true for .zip even when contents have no null byte', async () => {
    const filePath = path.join(tmpDir, 'archive.zip');
    await fs.writeFile(filePath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
    expect(await isBinaryFile(filePath)).toBe(true);
  });

  it('returns true for .pdf by extension', async () => {
    const filePath = path.join(tmpDir, 'doc.pdf');
    await fs.writeFile(filePath, '%PDF-1.4 no null bytes here');
    expect(await isBinaryFile(filePath)).toBe(true);
  });
});

describe('getMimeType', () => {
  // TC-PU3: .ts extension returns text/typescript
  it('returns text/typescript for .ts extension', () => {
    expect(getMimeType('src/index.ts')).toBe('text/typescript');
  });

  it('returns text/javascript for .js extension', () => {
    expect(getMimeType('app.js')).toBe('text/javascript');
  });

  it('returns application/json for .json extension', () => {
    expect(getMimeType('package.json')).toBe('application/json');
  });

  it('returns text/markdown for .md extension', () => {
    expect(getMimeType('README.md')).toBe('text/markdown');
  });

  it('returns text/html for .html extension', () => {
    expect(getMimeType('index.html')).toBe('text/html');
  });

  it('returns text/css for .css extension', () => {
    expect(getMimeType('styles.css')).toBe('text/css');
  });

  it('returns text/yaml for .yaml extension', () => {
    expect(getMimeType('config.yaml')).toBe('text/yaml');
  });

  it('returns text/yaml for .yml extension', () => {
    expect(getMimeType('config.yml')).toBe('text/yaml');
  });

  it('returns text/x-python for .py extension', () => {
    expect(getMimeType('script.py')).toBe('text/x-python');
  });

  it('returns image/png for .png extension', () => {
    expect(getMimeType('image.png')).toBe('image/png');
  });

  it('returns image/jpeg for .jpg extension', () => {
    expect(getMimeType('photo.jpg')).toBe('image/jpeg');
  });

  it('returns image/jpeg for .jpeg extension', () => {
    expect(getMimeType('photo.jpeg')).toBe('image/jpeg');
  });

  // TC-PU4: Unknown extension returns application/octet-stream
  it('returns application/octet-stream for unknown extension', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
  });

  it('returns application/octet-stream for file without extension', () => {
    expect(getMimeType('Makefile')).toBe('application/octet-stream');
  });
});

describe('MAX_FILE_SIZE', () => {
  it('equals 1MB (1048576 bytes)', () => {
    expect(MAX_FILE_SIZE).toBe(1 * 1024 * 1024);
  });
});

describe('isProtectedPath', () => {
  // TC-PP1: .git → returns true
  it('returns true for .git', () => {
    expect(isProtectedPath('.git')).toBe(true);
  });

  // TC-PP2: .git/config → returns true
  it('returns true for .git/config', () => {
    expect(isProtectedPath('.git/config')).toBe(true);
  });

  // TC-PP3: node_modules/express → returns true
  it('returns true for node_modules/express', () => {
    expect(isProtectedPath('node_modules/express')).toBe(true);
  });

  // TC-PP4: .bmad-core/config.yaml → returns true
  it('returns true for .bmad-core/config.yaml', () => {
    expect(isProtectedPath('.bmad-core/config.yaml')).toBe(true);
  });

  // TC-PP5: src/app.ts → returns false
  it('returns false for src/app.ts', () => {
    expect(isProtectedPath('src/app.ts')).toBe(false);
  });

  // TC-PP6: my-git-project/index.ts → returns false (not a .git prefix)
  it('returns false for my-git-project/index.ts', () => {
    expect(isProtectedPath('my-git-project/index.ts')).toBe(false);
  });
});
