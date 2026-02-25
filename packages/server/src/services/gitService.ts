/**
 * Git Service
 * Wraps simple-git to provide Git read operations for projects.
 * [Source: Story 16.1 - Task 3]
 */

import simpleGit from 'simple-git';
import type {
  GitStatusResponse,
  GitLogResponse,
  GitBranchesResponse,
  GitDiffResponse,
  GitFileStatus,
} from '@bmad-studio/shared';

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
        message: entry.body || entry.message,
        author: entry.author_name,
        date: entry.date,
      }));

      return { commits };
    } catch (error) {
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
      const args = staged ? ['--cached', '--', file] : ['--', file];
      const diff = await git.diff(args);

      return {
        initialized: true,
        diff,
        file,
        staged,
      };
    } catch (error) {
      throw this.wrapError('diff', error);
    }
  }
}

export const gitService = new GitService();
