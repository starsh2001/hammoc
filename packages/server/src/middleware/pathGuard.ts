/**
 * Path Guard Middleware
 * Validates that requested paths stay within the project root.
 * Prevents path traversal attacks for file system API endpoints.
 * [Source: Story 11.1 - Task 2]
 */

import path from 'path';

/**
 * Validates a path for read-only access with whitelist enforcement.
 * Resolved path must fall under projectRoot or one of the allowedRoots.
 * Blocks null bytes and UNC/device paths.
 * @param projectRoot Absolute path to the project root
 * @param requestedPath Relative or absolute path requested by the client
 * @param allowedRoots Additional allowed root directories for read access
 * @returns Resolved absolute path
 */
/**
 * Check if `target` is contained within `root` using path.relative.
 * Handles Windows case-insensitivity and root path edge cases (/, C:\).
 */
function isContainedIn(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  // Empty string means exact match; '..' or '../*' means escape; absolute means different drive
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false;
  return true;
}

export function validateReadPath(projectRoot: string, requestedPath: string, allowedRoots: string[] = []): string {
  // Null byte check
  if (requestedPath.includes('\0')) {
    const err = new Error('Invalid path: null byte detected');
    (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
    throw err;
  }

  // Block UNC/device paths (\\server\share, //server/share, \\?\...) to prevent network access
  if (requestedPath.startsWith('\\\\') || requestedPath.startsWith('//')) {
    const err = new Error('Invalid path: UNC paths are not allowed');
    (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
    throw err;
  }

  // Resolve the path
  const resolvedPath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(projectRoot, requestedPath);

  // Double-check resolved path isn't UNC (e.g. mixed separator input)
  const normalizedForUNC = resolvedPath.replace(/\//g, '\\');
  if (normalizedForUNC.startsWith('\\\\')) {
    const err = new Error('Invalid path: UNC paths are not allowed');
    (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
    throw err;
  }

  // Check if path falls under project root or any allowed root
  // Only accept absolute allowed roots to prevent CWD-dependent behavior
  const roots = [projectRoot, ...allowedRoots.filter(r => path.isAbsolute(r))];

  for (const root of roots) {
    if (isContainedIn(resolvedPath, root)) {
      return resolvedPath;
    }
  }

  const err = new Error('Invalid path: outside allowed directories');
  (err as NodeJS.ErrnoException).code = 'PATH_TRAVERSAL';
  throw err;
}

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
