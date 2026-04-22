/**
 * Git Service
 * Wraps simple-git to provide Git read and write operations for projects.
 * [Source: Story 16.1 - Task 3, Story 16.2 - Task 2]
 */

import { promises as fs } from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import type {
  GitStatusResponse,
  GitLogResponse,
  GitBranchesResponse,
  GitDiffResponse,
  GitFileStatus,
} from '@hammoc/shared';
import { isBinaryFile } from '../utils/pathUtils.js';

class GitService {
  private wrapError(operation: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`Git ${operation} failed: ${message}`);
    if (error instanceof Error) {
      wrapped.stack = error.stack;
    }
    return wrapped;
  }

  async getStatus(projectPath: string): Promise<GitStatusResponse> {
    const git = simpleGit(projectPath);

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { initialized: false };
    }

    try {
      const status = await git.status();

      // Map staged files from status.files where index indicates staging
      const staged: GitFileStatus[] = status.files
        .filter((f) => f.index !== ' ' && f.index !== '?')
        .map((f) => ({ path: f.path, index: f.index, working_dir: f.working_dir }));

      // Map unstaged files (modified or deleted in working directory, not untracked)
      const unstaged: GitFileStatus[] = status.files
        .filter((f) => f.working_dir !== ' ' && f.working_dir !== '?' && f.working_dir !== '')
        .map((f) => ({ path: f.path, index: f.index, working_dir: f.working_dir }));

      return {
        initialized: true,
        branch: status.current || undefined,
        ahead: status.ahead,
        behind: status.behind,
        staged,
        unstaged,
        untracked: status.not_added,
      };
    } catch (error) {
      throw this.wrapError('status', error);
    }
  }

  async getLog(projectPath: string, limit = 20, offset = 0): Promise<GitLogResponse> {
    const git = simpleGit(projectPath);

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { commits: [] };
    }

    try {
      const logOptions: Record<string, unknown> = { maxCount: limit };
      if (offset > 0) {
        logOptions['--skip'] = offset;
      }

      const log = await git.log(logOptions);

      const commits = log.all.map((entry) => ({
        hash: entry.hash,
        message: entry.message,
        author: entry.author_name,
        date: entry.date,
      }));

      return { commits };
    } catch (error) {
      // git log exits with non-zero on repos with no commits yet — treat as empty
      const msg = error instanceof Error ? error.message : String(error);
      if (/does not have any commits yet|bad default revision|unknown revision/i.test(msg)) {
        return { commits: [] };
      }
      throw this.wrapError('log', error);
    }
  }

  async getBranches(projectPath: string): Promise<GitBranchesResponse> {
    const git = simpleGit(projectPath);

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { current: '', local: [], remote: [] };
    }

    try {
      const localBranches = await git.branchLocal();
      const remoteBranches = await git.branch(['-r']);

      return {
        current: localBranches.current,
        local: localBranches.all,
        remote: remoteBranches.all,
      };
    } catch (error) {
      throw this.wrapError('branches', error);
    }
  }

  async getDiff(projectPath: string, file: string, staged = false): Promise<GitDiffResponse> {
    const git = simpleGit(projectPath);

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { initialized: false };
    }

    try {
      // Run without --binary so git emits "Binary files … differ" for binary
      // paths. The --binary flag causes git to output a "GIT binary patch" block
      // instead, which breaks the "Binary files" regex below.
      const args = staged
        ? ['--cached', '--', file]
        : ['--', file];
      const diff = await git.diff(args);

      // Detect binary via the standard git marker.
      let isBinary = /^Binary files .* differ$/m.test(diff);

      // Untracked or newly added files never appear in `git diff`, so the
      // output is empty regardless of binary status. Fall back to reading the
      // file directly (covers .zip/.pdf and friends via the extension
      // allowlist in pathUtils.isBinaryFile).
      if (!isBinary && !diff.trim()) {
        try {
          isBinary = await isBinaryFile(path.join(projectPath, file));
        } catch {
          // File may not exist (e.g. deleted). Leave isBinary=false.
        }
      }

      let before = '';
      let after = '';
      if (!isBinary) {
        // Staged view: compare HEAD blob (before) against index blob (after).
        // Unstaged view: compare index blob (before) against working copy (after).
        // Any `git show` failure (missing blob — new/untracked file) collapses to ''.
        const beforeRef = staged ? `HEAD:${file}` : `:${file}`;
        try {
          before = await git.show([beforeRef]);
        } catch {
          before = '';
        }
        if (staged) {
          try {
            after = await git.show([`:${file}`]);
          } catch {
            after = '';
          }
        } else {
          try {
            after = await fs.readFile(path.join(projectPath, file), 'utf8');
          } catch {
            // Deleted file — working copy missing.
            after = '';
          }
        }
      }

      return {
        initialized: true,
        diff,
        before,
        after,
        file,
        staged,
        isBinary,
      };
    } catch (error) {
      throw this.wrapError('diff', error);
    }
  }

  // ── Write operations (Story 16.2) ──

  private throwNotInitialized(): never {
    const error = new Error('Project is not a Git repository') as NodeJS.ErrnoException;
    error.code = 'GIT_NOT_INITIALIZED';
    throw error;
  }

  async init(projectPath: string): Promise<void> {
    const git = simpleGit(projectPath);
    try {
      await git.init();
    } catch (error) {
      throw this.wrapError('init', error);
    }
  }

  async stage(projectPath: string, files: string[]): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      this.throwNotInitialized();
    }
    try {
      await git.add(files);
    } catch (error) {
      throw this.wrapError('stage', error);
    }
  }

  async unstage(projectPath: string, files: string[]): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      this.throwNotInitialized();
    }
    try {
      await git.reset(['--', ...files]);
    } catch (error) {
      throw this.wrapError('unstage', error);
    }
  }

  async commit(projectPath: string, message: string): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      this.throwNotInitialized();
    }
    try {
      await git.commit(message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('nothing to commit')) {
        const nothingError = new Error('Nothing to commit') as NodeJS.ErrnoException;
        nothingError.code = 'GIT_NOTHING_TO_COMMIT';
        throw nothingError;
      }
      throw this.wrapError('commit', error);
    }
  }

  async push(projectPath: string): Promise<void> {
    const git = simpleGit(projectPath);
    if (!await git.checkIsRepo()) {
      this.throwNotInitialized();
    }
    try {
      const { current } = await git.branch();
      await git.push(['origin', current, '--set-upstream']);
    } catch (error) {
      throw this.wrapError('push', error);
    }
  }

  async pull(projectPath: string): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      this.throwNotInitialized();
    }
    try {
      await git.pull();
    } catch (error) {
      throw this.wrapError('pull', error);
    }
  }

  async checkout(projectPath: string, branch: string): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      this.throwNotInitialized();
    }
    try {
      await git.checkout(branch);
    } catch (error) {
      throw this.wrapError('checkout', error);
    }
  }

  async createBranch(projectPath: string, name: string, startPoint?: string): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      this.throwNotInitialized();
    }
    try {
      const args: string[] = startPoint ? ['-b', name, startPoint] : ['-b', name];
      await git.checkout(args);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('already exists')) {
        const branchError = new Error('Branch already exists') as NodeJS.ErrnoException;
        branchError.code = 'GIT_BRANCH_EXISTS';
        throw branchError;
      }
      throw this.wrapError('createBranch', error);
    }
  }
}

export const gitService = new GitService();
