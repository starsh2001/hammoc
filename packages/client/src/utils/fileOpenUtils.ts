/**
 * Shared file-open utilities for tool cards and path displays.
 * Centralizes path normalization and image-vs-editor routing.
 */

import { isImagePath } from './languageDetect';
import { useFileStore } from '../stores/fileStore';
import { useImageViewerStore } from '../stores/imageViewerStore';
import { fileSystemApi } from '../services/api/fileSystem';

/**
 * Convert an absolute file path to a project-relative path.
 * Tool calls return absolute paths (e.g. d:\repo\project\src\file.tsx),
 * but the server pathGuard requires relative paths.
 */
export function toRelativePath(absolutePath: string, projectRoot: string): string {
  if (!projectRoot) return absolutePath;
  // Normalize separators to forward slash for comparison
  const normAbs = absolutePath.replace(/\\/g, '/');
  const normRoot = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  // Case-insensitive prefix check for Windows (D:\ vs d:\)
  if (normAbs.toLowerCase().startsWith(normRoot.toLowerCase() + '/')) {
    return normAbs.slice(normRoot.length + 1);
  }
  // Already relative or different root — return as-is
  return absolutePath;
}

/**
 * Open a project file in the appropriate viewer (image viewer or text editor).
 */
export function openProjectFile(projectSlug: string, filePath: string, projectRoot: string): void {
  const relativePath = toRelativePath(filePath, projectRoot);
  if (isImagePath(relativePath)) {
    useImageViewerStore.getState().openImageViewer(projectSlug, relativePath);
  } else {
    useFileStore.getState().openFileInEditor(projectSlug, relativePath);
  }
}

/**
 * Open an image from the file explorer, collecting sibling images in the same
 * directory so the viewer can navigate ←/→ through them. Falls back to the
 * single-image path when listing fails or there are no siblings.
 */
export async function openImageWithSiblings(projectSlug: string, relativePath: string): Promise<void> {
  const normalized = relativePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '.';
  try {
    const listing = await fileSystemApi.listDirectory(projectSlug, dir);
    const siblings = listing.entries
      .filter(e => e.type === 'file' && isImagePath(e.name))
      .map(e => {
        const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
        return {
          url: `/api/projects/${projectSlug}/fs/raw?path=${encodeURIComponent(rel)}`,
          name: rel,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const idx = siblings.findIndex(s => s.name === normalized);
    if (idx >= 0 && siblings.length > 1) {
      useImageViewerStore.getState().openImageViewerUrls(siblings, idx);
      return;
    }
  } catch {
    // Listing failed — fall back to single-image open below.
  }
  useImageViewerStore.getState().openImageViewer(projectSlug, relativePath);
}
