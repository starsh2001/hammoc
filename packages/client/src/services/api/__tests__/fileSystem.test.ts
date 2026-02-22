/**
 * fileSystemApi Tests
 * [Source: Story 13.1 - Task 4.2]
 * [Extended: Story 13.3 - Task 6.1 — CRUD method tests]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api client
vi.mock('../client.js', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

import { api } from '../client.js';
import { fileSystemApi } from '../fileSystem.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fileSystemApi', () => {
  describe('listDirectory', () => {
    it('calls api.get with correct URL for default path', async () => {
      const mockResponse = { path: '.', entries: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.listDirectory('my-project');

      expect(api.get).toHaveBeenCalledWith('/projects/my-project/fs/list?path=.');
      expect(result).toEqual(mockResponse);
    });

    it('calls api.get with correct URL for subdirectory path', async () => {
      const mockResponse = { path: 'src/components', entries: [] };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.listDirectory('my-project', 'src/components');

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/fs/list?path=src%2Fcomponents',
      );
      expect(result).toEqual(mockResponse);
    });

    it('encodes special characters in path', async () => {
      vi.mocked(api.get).mockResolvedValue({ path: 'my folder', entries: [] });

      await fileSystemApi.listDirectory('my-project', 'my folder');

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/fs/list?path=my%20folder',
      );
    });
  });

  describe('readFile', () => {
    it('calls api.get with correct URL', async () => {
      const mockResponse = { content: 'hello', isBinary: false, isTruncated: false };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.readFile('my-project', 'src/index.ts');

      expect(api.get).toHaveBeenCalledWith(
        '/projects/my-project/fs/read?path=src%2Findex.ts',
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('writeFile', () => {
    it('calls api.put with correct URL and body', async () => {
      const mockResponse = { success: true };
      vi.mocked(api.put).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.writeFile('my-project', 'src/index.ts', 'new content');

      expect(api.put).toHaveBeenCalledWith(
        '/projects/my-project/fs/write?path=src%2Findex.ts',
        { content: 'new content' },
      );
      expect(result).toEqual(mockResponse);
    });
  });

  // TC-FS-6: createEntry calls POST with correct URL and body
  describe('createEntry', () => {
    it('calls api.post with correct URL and body', async () => {
      const mockResponse = { success: true, type: 'file', path: 'src/new-file.ts' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.createEntry('my-project', 'src/new-file.ts', 'file');

      expect(api.post).toHaveBeenCalledWith(
        '/projects/my-project/fs/create?path=src%2Fnew-file.ts',
        { type: 'file' },
      );
      expect(result).toEqual(mockResponse);
    });

    it('defaults type to file', async () => {
      vi.mocked(api.post).mockResolvedValue({ success: true, type: 'file', path: 'test.txt' });

      await fileSystemApi.createEntry('my-project', 'test.txt');

      expect(api.post).toHaveBeenCalledWith(
        '/projects/my-project/fs/create?path=test.txt',
        { type: 'file' },
      );
    });
  });

  // TC-FS-7: deleteEntry calls DELETE with correct URL (including force parameter)
  describe('deleteEntry', () => {
    it('calls api.delete with correct URL', async () => {
      const mockResponse = { success: true, path: 'src/old-file.ts' };
      vi.mocked(api.delete).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.deleteEntry('my-project', 'src/old-file.ts');

      expect(api.delete).toHaveBeenCalledWith(
        '/projects/my-project/fs/delete?path=src%2Fold-file.ts',
      );
      expect(result).toEqual(mockResponse);
    });

    it('includes force=true parameter when force is true', async () => {
      vi.mocked(api.delete).mockResolvedValue({ success: true, path: 'node_modules' });

      await fileSystemApi.deleteEntry('my-project', 'node_modules', true);

      expect(api.delete).toHaveBeenCalledWith(
        '/projects/my-project/fs/delete?path=node_modules&force=true',
      );
    });
  });

  // TC-FS-8: renameEntry calls PATCH with correct URL
  describe('renameEntry', () => {
    it('calls api.patch with correct URL', async () => {
      const mockResponse = { success: true, oldPath: 'src/old.ts', newPath: 'src/new.ts' };
      vi.mocked(api.patch).mockResolvedValue(mockResponse);

      const result = await fileSystemApi.renameEntry('my-project', 'src/old.ts', 'src/new.ts');

      expect(api.patch).toHaveBeenCalledWith(
        '/projects/my-project/fs/rename?path=src%2Fold.ts&newPath=src%2Fnew.ts',
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
