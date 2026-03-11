/**
 * Shared file-open utilities for tool cards and path displays.
 * Centralizes path normalization and image-vs-editor routing.
 */

import { isImagePath } from './languageDetect';
import { useFileStore } from '../stores/fileStore';
import { useImageViewerStore } from '../stores/imageViewerStore';

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
