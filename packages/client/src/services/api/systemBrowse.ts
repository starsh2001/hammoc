/**
 * System Browse API Service
 * Client-side wrapper for the directory-only system browse API (Epic 34, Story 34.2).
 *
 * Unlike fileSystem.ts (project-scoped, RELATIVE paths under a project root), this
 * API operates on ABSOLUTE paths across the whole host filesystem and takes NO
 * projectSlug — it runs *before* a project is registered. It is consumed by the
 * directory browser dialog so the user can pick a project path visually.
 *
 * Server contract (Story 34.1, verified against systemBrowseController):
 *   GET  /system/browse                      → drive roots (isDriveRoots:true)
 *   GET  /system/browse?path=<absolute dir>  → that dir's child directories (folders only)
 *   POST /system/browse/mkdir   { parentPath, name }  → 201 { success, path }
 *   POST /system/browse/rename  { path, newName }     → 200 { success, oldPath, newPath }
 * There is intentionally NO delete method — the server exposes no delete route.
 *
 * Errors propagate as the raw ApiError (status/code/message) from client.ts; the
 * dialog catches them and renders inline (no wrapping needed here).
 * [Source: docs/stories/34.2.story.md#Task 1; packages/shared/src/types/systemBrowse.ts]
 */

import { api } from './client.js';
import type {
  BrowseResponse,
  MkdirResponse,
  RenameResponse,
} from '@hammoc/shared';

export const systemBrowseApi = {
  /**
   * List the child directories of an absolute path. With NO argument the server
   * returns the drive-roots ("My PC") view (isDriveRoots:true) — identical to the
   * explicit __MYPC__ sentinel (controller: `!queryPath || queryPath === '__MYPC__'`),
   * so this single method serves both the initial drive enumeration and the
   * "My PC" breadcrumb node. No separate drives() method is kept (avoids the
   * documented redundancy).
   */
  browse: (path?: string) =>
    api.get<BrowseResponse>(
      '/system/browse' + (path ? `?path=${encodeURIComponent(path)}` : ''),
    ),

  /** Create a new folder under an absolute parent directory. */
  mkdir: (parentPath: string, name: string) =>
    api.post<MkdirResponse>('/system/browse/mkdir', { parentPath, name }),

  /** Rename an entry within its same parent directory (stays in the same folder). */
  rename: (path: string, newName: string) =>
    api.post<RenameResponse>('/system/browse/rename', { path, newName }),
};
