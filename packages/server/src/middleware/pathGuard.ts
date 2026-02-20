/**
 * Path Guard Middleware
 * Validates that requested paths stay within the project root.
 * Prevents path traversal attacks for file system API endpoints.
 * [Source: Story 11.1 - Task 2]
 */

import path from 'path';

/**
 * Validates that the requested path stays within the project root.
 * Throws error with code 'PATH_TRAVERSAL' if validation fails.
 * @param projectRoot Absolute path to the project root directory
 * @param requestedPath Relative path requested by the client
 * @returns Resolved absolute path
 */
export function validateProjectPath(projectRoot: string, requestedPath: string): string {
  // 1. Null byte check
  if (requestedPath.includes('\0')) {
    const err = new Error('Invalid path: null byte detected');
    (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
    throw err;
  }

  // 2. Block absolute paths (Unix: /, Windows: C:\, \\UNC)
  if (path.isAbsolute(requestedPath)) {
    const err = new Error('Invalid path: absolute paths are not allowed');
    (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
    throw err;
  }

  // 3. Resolve the full path
  const resolvedPath = path.resolve(projectRoot, requestedPath);

  // 4. Ensure resolved path is within projectRoot
  const normalizedRoot = path.resolve(projectRoot) + path.sep;
  const normalizedResolved = path.resolve(resolvedPath);

  // Allow exact match (root itself) or child paths
  if (normalizedResolved !== path.resolve(projectRoot) && !normalizedResolved.startsWith(normalizedRoot)) {
    const err = new Error('Invalid path: path traversal detected');
    (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
    throw err;
  }

  return resolvedPath;
}
