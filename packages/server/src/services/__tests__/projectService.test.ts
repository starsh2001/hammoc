/**
 * Unit Tests for ProjectService
 * [Source: Story 3.1 - Task 2]
 * [Extended: Story 3.6 - Task 2: Project creation tests]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { projectService } from '../projectService.js';
import fs from 'fs/promises';
import * as syncFs from 'fs';
import path from 'path';
import os from 'os';

// Mock fs/promises
vi.mock('fs/promises');

// Mock fs (sync)
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockFs = vi.mocked(fs);
const mockSyncFs = vi.mocked(syncFs);

// Mock data
const mockSessionsIndex = {
  originalPath: '/Users/test/my-project',
  entries: [
    {
      sessionId: 'session-123',
      firstPrompt: 'Create a React component',
      messageCount: 15,
      created: '2026-01-30T10:00:00Z',
      modified: '2026-01-30T11:30:00Z',
    },
    {
      sessionId: 'session-456',
      firstPrompt: 'Fix the bug',
      messageCount: 8,
      created: '2026-01-29T14:00:00Z',
      modified: '2026-01-29T15:00:00Z',
    },
  ],
};

const mockSessionsIndex2 = {
  originalPath: '/Users/test/another-project',
  entries: [
    {
      sessionId: 'session-789',
      firstPrompt: 'Test prompt',
      messageCount: 5,
      created: '2026-01-31T10:00:00Z',
      modified: '2026-01-31T12:00:00Z',
    },
  ],
};

describe('ProjectService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getClaudeProjectsDir', () => {
    it('should return correct projects directory path', () => {
      const result = projectService.getClaudeProjectsDir();
      const expected = path.join(os.homedir(), '.claude', 'projects');
      expect(result).toBe(expected);
    });
  });

  describe('scanProjects', () => {
    it('should return empty array when directory does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await projectService.scanProjects();

      expect(result).toEqual([]);
    });

    it('should return empty array when directory is empty', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      const result = await projectService.scanProjects();

      expect(result).toEqual([]);
    });

    it('should return project list with correct info', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['project-hash-1'] as never);
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          isDirectory: () => true,
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await projectService.scanProjects();

      expect(result).toHaveLength(1);
      expect(result[0].originalPath).toBe('/Users/test/my-project');
      expect(result[0].projectSlug).toBe('project-hash-1');
      expect(result[0].sessionCount).toBe(2);
      expect(result[0].isBmadProject).toBe(false);
    });

    it('should detect BMad projects correctly', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['project-hash-1'] as never);
      mockFs.stat.mockImplementation(async () => {
        // .bmad-core folder exists
        return {
          isDirectory: () => true,
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await projectService.scanProjects();

      expect(result).toHaveLength(1);
      expect(result[0].isBmadProject).toBe(true);
    });

    it('should sort projects by lastModified descending', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        'project-older',
        'project-newer',
      ] as never);

      let readFileCallCount = 0;
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          isDirectory: () => true,
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });

      mockFs.readFile.mockImplementation(async () => {
        readFileCallCount++;
        if (readFileCallCount === 1) {
          // First project - older (modified on 2026-01-30)
          return JSON.stringify(mockSessionsIndex);
        } else {
          // Second project - newer (modified on 2026-01-31)
          return JSON.stringify(mockSessionsIndex2);
        }
      });

      const result = await projectService.scanProjects();

      expect(result).toHaveLength(2);
      // Newer project should be first
      expect(result[0].originalPath).toBe('/Users/test/another-project');
      expect(result[1].originalPath).toBe('/Users/test/my-project');
    });

    it('should throw error with PERMISSION_DENIED code when permission denied', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const permissionError = new Error('EACCES') as NodeJS.ErrnoException;
      permissionError.code = 'EACCES';
      mockFs.readdir.mockRejectedValue(permissionError);

      await expect(projectService.scanProjects()).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });

    it('should skip non-directory entries', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        'some-file.txt',
        'project-hash',
      ] as never);

      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        if (pathStr.includes('some-file.txt')) {
          return { isDirectory: () => false } as import('fs').Stats;
        }
        return {
          isDirectory: () => true,
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));

      const result = await projectService.scanProjects();

      expect(result).toHaveLength(1);
    });

    it('should skip projects with invalid sessions-index.json', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        'valid-project',
        'invalid-project',
      ] as never);

      let readFileCallCount = 0;
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          isDirectory: () => true,
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });

      mockFs.readFile.mockImplementation(async () => {
        readFileCallCount++;
        if (readFileCallCount === 1) {
          return JSON.stringify(mockSessionsIndex);
        } else {
          return 'invalid json';
        }
      });

      const result = await projectService.scanProjects();

      expect(result).toHaveLength(1);
    });
  });

  describe('parseSessionsIndex', () => {
    it('should parse valid sessions-index.json', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          isDirectory: () => true,
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result).not.toBeNull();
      expect(result?.originalPath).toBe('/Users/test/my-project');
      expect(result?.projectSlug).toBe('project-slug');
      expect(result?.sessionCount).toBe(2);
      expect(result?.isBmadProject).toBe(false);
    });

    it('should return null when sessions-index.json does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('not valid json');

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result).toBeNull();
    });

    it('should return null for missing originalPath field when no entries have projectPath', async () => {
      // When neither originalPath (legacy) nor entries[0].projectPath (current) is available
      mockFs.readFile.mockResolvedValue(JSON.stringify({ entries: [] }));

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result).toBeNull();
    });

    it('should use projectPath from first entry when originalPath is missing (current Claude Code format)', async () => {
      // Current Claude Code format: { version: 1, entries: [{ projectPath: "...", ... }] }
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          version: 1,
          entries: [
            {
              sessionId: 'session-1',
              projectPath: '/Users/test/my-project',
              firstPrompt: 'Hello',
              messageCount: 5,
              created: '2026-01-15T10:00:00Z',
              modified: '2026-01-20T14:30:00Z',
            },
          ],
        })
      );
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          mtime: new Date('2026-01-30T12:00:00Z'),
          isDirectory: () => false,
        } as unknown as import('fs').Stats;
      });

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result).not.toBeNull();
      expect(result!.originalPath).toBe('/Users/test/my-project');
      expect(result!.sessionCount).toBe(1);
    });

    it('should handle empty entries array', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/Users/test/empty-project',
          entries: [],
        })
      );
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          mtime: new Date('2026-01-30T12:00:00Z'),
        } as import('fs').Stats;
      });

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result).not.toBeNull();
      expect(result?.sessionCount).toBe(0);
    });

    it('should use file stat when entries have no modified dates', async () => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          originalPath: '/Users/test/project',
          entries: [{ sessionId: 'session-1' }],
        })
      );
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        mtime: new Date('2026-01-25T10:00:00Z'),
      } as import('fs').Stats);

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      expect(result?.lastModified).toBe('2026-01-25T10:00:00.000Z');
    });

    it('should calculate lastModified from entries with modified dates', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSessionsIndex));
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw new Error('ENOENT');
        }
        return {
          mtime: new Date('2026-01-20T12:00:00Z'),
        } as import('fs').Stats;
      });

      const result = await projectService.parseSessionsIndex('/some/path', 'project-slug');

      // Should use the most recent entry modified date (2026-01-30T11:30:00Z)
      expect(result?.lastModified).toBe('2026-01-30T11:30:00.000Z');
    });
  });

  describe('checkBmadProject', () => {
    it('should return true when .bmad-core folder exists', async () => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
      } as import('fs').Stats);

      const result = await projectService.checkBmadProject('/Users/test/project');

      expect(result).toBe(true);
      expect(mockFs.stat).toHaveBeenCalledWith(
        path.join('/Users/test/project', '.bmad-core')
      );
    });

    it('should return false when .bmad-core folder does not exist', async () => {
      mockFs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await projectService.checkBmadProject('/Users/test/project');

      expect(result).toBe(false);
    });

    it('should return false when .bmad-core is a file, not a directory', async () => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
      } as import('fs').Stats);

      const result = await projectService.checkBmadProject('/Users/test/project');

      expect(result).toBe(false);
    });
  });

  // Story 3.6 - Task 2: Project Creation Tests
  describe('validatePath', () => {
    it('should return valid=true for existing directory', async () => {
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core') || pathStr.includes('.claude')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });
      mockFs.access.mockRejectedValue({ code: 'ENOENT' });

      const result = await projectService.validatePath('/Users/test/project');

      expect(result.valid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.isProject).toBe(false);
    });

    it('should return valid=false for non-existent path', async () => {
      mockFs.stat.mockRejectedValue({ code: 'ENOENT' });

      const result = await projectService.validatePath('/non/existent/path');

      expect(result.valid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.error).toContain('존재하지 않습니다');
    });

    it('should return valid=false for relative paths', async () => {
      const result = await projectService.validatePath('../relative/path');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('절대 경로');
    });

    it('should return valid=false for path traversal attempts', async () => {
      const result = await projectService.validatePath('/home/user/../../../etc/passwd');

      expect(result.valid).toBe(false);
    });

    it('should return valid=false for paths with null bytes', async () => {
      const result = await projectService.validatePath('/home/user/\0project');

      expect(result.valid).toBe(false);
    });

    it('should return valid=false when path is a file, not directory', async () => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
      } as import('fs').Stats);

      const result = await projectService.validatePath('/Users/test/file.txt');

      expect(result.valid).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.error).toContain('디렉토리가 아닙니다');
    });

    it('should detect existing project and return projectSlug', async () => {
      // Mock project directory exists with a matching project
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['existing-slug'] as never);
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ originalPath: '/Users/test/my-project', entries: [] })
      );

      const result = await projectService.validatePath('/Users/test/my-project');

      expect(result.valid).toBe(true);
      expect(result.isProject).toBe(true);
      expect(result.projectSlug).toBe('existing-slug');
    });
  });

  describe('findProjectByPath', () => {
    it('should find project by original path', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['project-hash'] as never);
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ originalPath: '/Users/test/project', entries: [] })
      );

      const result = await projectService.findProjectByPath('/Users/test/project');

      expect(result).not.toBeNull();
      expect(result?.projectSlug).toBe('project-hash');
    });

    it('should return null when project not found', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['project-hash'] as never);
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ originalPath: '/Users/test/other-project', entries: [] })
      );

      const result = await projectService.findProjectByPath('/Users/test/project');

      expect(result).toBeNull();
    });
  });

  describe('createProject', () => {
    it('should create new project with BMad setup', async () => {
      // Track state changes
      let projectCreated = false;

      // Mock access - projects dir exists
      mockFs.access.mockResolvedValue(undefined);

      // Mock stat for validation and project scanning
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockImplementation(async () => {
        projectCreated = true;
        return undefined;
      });
      mockSyncFs.existsSync.mockReturnValue(false);

      // Mock readdir to return new project after files are written
      mockFs.readdir.mockImplementation(async () => {
        if (projectCreated) {
          return ['new-hash'] as never;
        }
        return [] as never;
      });

      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ originalPath: '/Users/test/new-project', entries: [] })
      );

      const result = await projectService.createProject({
        path: '/Users/test/new-project',
        setupBmad: true,
      });

      expect(result.isExisting).toBe(false);
      expect(result.project).toBeDefined();
      // Verify BMad setup was called (mkdir called for .bmad-core directories)
      expect(mockFs.mkdir).toHaveBeenCalled();
    });

    it('should return existing project without error', async () => {
      // Mock existing project found
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['existing-slug'] as never);
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ originalPath: '/Users/test/existing-project', entries: [] })
      );

      const result = await projectService.createProject({
        path: '/Users/test/existing-project',
        setupBmad: true,
      });

      expect(result.isExisting).toBe(true);
      expect(result.project.projectSlug).toBe('existing-slug');
    });

    it('should throw error for invalid path', async () => {
      await expect(
        projectService.createProject({
          path: '../invalid/path',
          setupBmad: false,
        })
      ).rejects.toThrow();
    });
  });

  describe('setupBmadCore', () => {
    it('should create .bmad-core directory structure', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockSyncFs.existsSync.mockReturnValue(false);

      await projectService.setupBmadCore('/Users/test/project');

      // Should create main directory
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join('/Users/test/project', '.bmad-core'),
        { recursive: true }
      );

      // Should create subdirectories
      const expectedDirs = ['agents', 'tasks', 'templates', 'checklists', 'data'];
      for (const dir of expectedDirs) {
        expect(mockFs.mkdir).toHaveBeenCalledWith(
          path.join('/Users/test/project', '.bmad-core', dir),
          { recursive: true }
        );
      }

      // Should create core-config.yaml
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/Users/test/project', '.bmad-core', 'core-config.yaml'),
        expect.stringContaining('markdownExploder: true'),
        'utf-8'
      );
    });

    it('should not overwrite existing core-config.yaml', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockSyncFs.existsSync.mockReturnValue(true);

      await projectService.setupBmadCore('/Users/test/project');

      // Should NOT write config file if it exists
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('initializeClaudeProject', () => {
    it('should return existing project slug if found', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['existing-slug'] as never);
      mockFs.stat.mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.bmad-core')) {
          throw { code: 'ENOENT' };
        }
        return {
          isDirectory: () => true,
          mtime: new Date(),
        } as import('fs').Stats;
      });
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({ originalPath: '/Users/test/project', entries: [] })
      );

      const result = await projectService.initializeClaudeProject('/Users/test/project');

      expect(result).toBe('existing-slug');
    });

    it('should create new project with fallback hash when CLI unavailable', async () => {
      // Mock no existing project
      mockFs.access.mockRejectedValue({ code: 'ENOENT' });
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockSyncFs.existsSync.mockReturnValue(false);

      // Mock CLI failure
      const childProcess = await import('child_process');
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('CLI not found');
      });

      // After creation, scanProjects finds new project
      let scanCount = 0;
      mockFs.readdir.mockImplementation(async () => {
        scanCount++;
        if (scanCount <= 2) return [];
        return ['new-hash'] as never;
      });

      const result = await projectService.initializeClaudeProject('/Users/test/new-project');

      // Should return a 16-character hash
      expect(result).toHaveLength(16);
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });
});
