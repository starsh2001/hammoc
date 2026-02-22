/**
 * fileSystemApi Tests
 * [Source: Story 13.1 - Task 4.2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api client
vi.mock('../client.js', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
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
});
