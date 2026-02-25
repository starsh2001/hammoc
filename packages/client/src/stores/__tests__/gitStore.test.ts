/**
 * Git Store Tests
 * [Source: Story 16.3 - Task 7.1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGitStore } from '../gitStore';

vi.mock('../../services/api/git', () => ({
  gitApi: {
    getStatus: vi.fn(),
    getLog: vi.fn(),
    getBranches: vi.fn(),
    getDiff: vi.fn(),
    init: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    checkout: vi.fn(),
    createBranch: vi.fn(),
  },
}));

import { gitApi } from '../../services/api/git';

const mockedApi = vi.mocked(gitApi);

const mockStatus = {
  initialized: true,
  branch: 'main',
  ahead: 2,
  behind: 1,
  staged: [{ path: 'src/index.ts', index: 'M', working_dir: ' ' }],
  unstaged: [{ path: 'src/utils.ts', index: ' ', working_dir: 'M' }],
  untracked: ['src/temp.ts'],
};

const mockBranches = {
  current: 'main',
  local: ['main', 'feature/git-tab'],
  remote: ['origin/main'],
};

const mockLog = {
  commits: [
    { hash: 'abc1234567890', message: 'feat: add git tab', author: 'dev', date: '2026-02-25T10:00:00Z' },
  ],
  total: 1,
};

const mockDiff = {
  initialized: true,
  diff: '- old\n+ new',
  file: 'src/index.ts',
  staged: false,
};

const mockOpResponse = { success: true, message: 'OK' };

const initialState = {
  status: null,
  commits: [],
  branches: null,
  isLoading: false,
  error: null,
};

describe('useGitStore', () => {
  beforeEach(() => {
    useGitStore.setState(initialState);
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TC-GIT-S1: fetchStatus', () => {
    it('should call gitApi.getStatus and update state', async () => {
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      await useGitStore.getState().fetchStatus('test-project');
      expect(mockedApi.getStatus).toHaveBeenCalledWith('test-project');
      expect(useGitStore.getState().status).toEqual(mockStatus);
    });
  });

  describe('TC-GIT-S2: fetchLog', () => {
    it('should call gitApi.getLog and update commits', async () => {
      mockedApi.getLog.mockResolvedValue(mockLog);
      await useGitStore.getState().fetchLog('test-project');
      expect(mockedApi.getLog).toHaveBeenCalledWith('test-project', 20);
      expect(useGitStore.getState().commits).toEqual(mockLog.commits);
    });
  });

  describe('TC-GIT-S3: fetchBranches', () => {
    it('should call gitApi.getBranches and update branches', async () => {
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      await useGitStore.getState().fetchBranches('test-project');
      expect(mockedApi.getBranches).toHaveBeenCalledWith('test-project');
      expect(useGitStore.getState().branches).toEqual(mockBranches);
    });
  });

  describe('TC-GIT-S4: stageFiles', () => {
    it('should call gitApi.stage then refreshAll', async () => {
      mockedApi.stage.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().stageFiles('test-project', ['file.ts']);
      expect(mockedApi.stage).toHaveBeenCalledWith('test-project', ['file.ts']);
      expect(mockedApi.getStatus).toHaveBeenCalled();
      expect(mockedApi.getBranches).toHaveBeenCalled();
      expect(mockedApi.getLog).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S5: unstageFiles', () => {
    it('should call gitApi.unstage then refreshAll', async () => {
      mockedApi.unstage.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().unstageFiles('test-project', ['file.ts']);
      expect(mockedApi.unstage).toHaveBeenCalledWith('test-project', ['file.ts']);
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S6: commit', () => {
    it('should call gitApi.commit then refreshAll', async () => {
      mockedApi.commit.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().commit('test-project', 'test commit');
      expect(mockedApi.commit).toHaveBeenCalledWith('test-project', 'test commit');
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S7: push', () => {
    it('should call gitApi.push then refreshAll', async () => {
      mockedApi.push.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().push('test-project');
      expect(mockedApi.push).toHaveBeenCalledWith('test-project');
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S8: pull', () => {
    it('should call gitApi.pull then refreshAll', async () => {
      mockedApi.pull.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().pull('test-project');
      expect(mockedApi.pull).toHaveBeenCalledWith('test-project');
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S9: checkout', () => {
    it('should call gitApi.checkout then refreshAll', async () => {
      mockedApi.checkout.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().checkout('test-project', 'feature');
      expect(mockedApi.checkout).toHaveBeenCalledWith('test-project', 'feature');
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S10: createBranch', () => {
    it('should call gitApi.createBranch then refreshAll', async () => {
      mockedApi.createBranch.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().createBranch('test-project', 'new-branch');
      expect(mockedApi.createBranch).toHaveBeenCalledWith('test-project', 'new-branch', undefined);
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S11: initRepo', () => {
    it('should call gitApi.init then refreshAll', async () => {
      mockedApi.init.mockResolvedValue(mockOpResponse);
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().initRepo('test-project');
      expect(mockedApi.init).toHaveBeenCalledWith('test-project');
      expect(mockedApi.getStatus).toHaveBeenCalled();
    });
  });

  describe('TC-GIT-S12: API error sets error state', () => {
    it('should set error on API failure', async () => {
      const { ApiError } = await import('../../services/api/client');
      mockedApi.getStatus.mockRejectedValue(new ApiError(500, 'GIT_ERROR', 'Git failed'));

      await useGitStore.getState().fetchStatus('test-project');
      expect(useGitStore.getState().error).toBe('Git failed');

      // Auto-clear after 5 seconds
      vi.advanceTimersByTime(5000);
      expect(useGitStore.getState().error).toBeNull();
    });
  });

  describe('TC-GIT-S13: refreshAll', () => {
    it('should call fetchStatus, fetchBranches, fetchLog concurrently', async () => {
      mockedApi.getStatus.mockResolvedValue(mockStatus);
      mockedApi.getBranches.mockResolvedValue(mockBranches);
      mockedApi.getLog.mockResolvedValue(mockLog);

      await useGitStore.getState().refreshAll('test-project');
      expect(mockedApi.getStatus).toHaveBeenCalledWith('test-project');
      expect(mockedApi.getBranches).toHaveBeenCalledWith('test-project');
      expect(mockedApi.getLog).toHaveBeenCalledWith('test-project', 20);
      expect(useGitStore.getState().isLoading).toBe(false);
    });
  });

  describe('TC-GIT-S14: fetchDiff', () => {
    it('should call gitApi.getDiff and return diff string', async () => {
      mockedApi.getDiff.mockResolvedValue(mockDiff);
      const result = await useGitStore.getState().fetchDiff('test-project', 'src/index.ts', false);
      expect(mockedApi.getDiff).toHaveBeenCalledWith('test-project', 'src/index.ts', false);
      expect(result).toBe('- old\n+ new');
    });

    it('should return empty string when diff is undefined', async () => {
      mockedApi.getDiff.mockResolvedValue({ initialized: true });
      const result = await useGitStore.getState().fetchDiff('test-project', 'file.ts');
      expect(result).toBe('');
    });
  });
});
