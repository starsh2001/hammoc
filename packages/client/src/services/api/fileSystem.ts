/**
 * File System API Service
 * Client-side API service for file read/write operations
 * [Source: Story 11.3 - Task 1]
 */

import { api } from './client.js';
import type {
  FileReadResponse,
  FileWriteResponse,
  DirectoryListResponse,
  FileCreateResponse,
  FileDeleteResponse,
  FileRenameResponse,
} from '@bmad-studio/shared';

export const fileSystemApi = {
  readFile: (projectSlug: string, path: string) =>
    api.get<FileReadResponse>(`/projects/${projectSlug}/fs/read?path=${encodeURIComponent(path)}`),

  writeFile: (projectSlug: string, path: string, content: string) =>
    api.put<FileWriteResponse>(`/projects/${projectSlug}/fs/write?path=${encodeURIComponent(path)}`, { content }),

  listDirectory: (projectSlug: string, path: string = '.') =>
    api.get<DirectoryListResponse>(`/projects/${projectSlug}/fs/list?path=${encodeURIComponent(path)}`),

  createEntry: (projectSlug: string, path: string, type: 'file' | 'directory' = 'file') =>
    api.post<FileCreateResponse>(
      `/projects/${projectSlug}/fs/create?path=${encodeURIComponent(path)}`,
      { type },
    ),

  deleteEntry: (projectSlug: string, path: string, force: boolean = false) =>
    api.delete<FileDeleteResponse>(
      `/projects/${projectSlug}/fs/delete?path=${encodeURIComponent(path)}${force ? '&force=true' : ''}`,
    ),

  renameEntry: (projectSlug: string, path: string, newPath: string) =>
    api.patch<FileRenameResponse>(
      `/projects/${projectSlug}/fs/rename?path=${encodeURIComponent(path)}&newPath=${encodeURIComponent(newPath)}`,
    ),
};
