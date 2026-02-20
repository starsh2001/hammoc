/**
 * File System API Service
 * Client-side API service for file read/write operations
 * [Source: Story 11.3 - Task 1]
 */

import { api } from './client.js';
import type { FileReadResponse, FileWriteResponse } from '@bmad-studio/shared';

export const fileSystemApi = {
  readFile: (projectSlug: string, path: string) =>
    api.get<FileReadResponse>(`/projects/${projectSlug}/fs/read?path=${encodeURIComponent(path)}`),

  writeFile: (projectSlug: string, path: string, content: string) =>
    api.put<FileWriteResponse>(`/projects/${projectSlug}/fs/write?path=${encodeURIComponent(path)}`, { content }),
};
