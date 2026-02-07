/**
 * Unit Tests for CommandService
 * [Source: Story 5.1 - Task 1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import type { ProjectInfo } from '@bmad-studio/shared';

// Hoist mock to avoid initialization issues
const { mockScanProjects } = vi.hoisted(() => ({
  mockScanProjects: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises');

// Mock projectService
vi.mock('../projectService', () => ({
  projectService: {
    scanProjects: mockScanProjects,
  },
}));

import { commandService } from '../commandService.js';

const mockFs = vi.mocked(fs);

const mockProject: ProjectInfo = {
  originalPath: '/Users/test/my-project',
  projectSlug: 'test-slug',
  sessionCount: 1,
  lastModified: '2026-01-30T10:00:00Z',
  isBmadProject: true,
};

const agentMdContent = `# Agent PM

Some description here.

\`\`\`yaml
agent:
  name: PM (Product Manager)
  id: pm
  title: Product Manager
  icon: "\uD83D\uDCCB"
\`\`\`

More content below.
`;

const agentMdNoYaml = `# Agent without YAML block

Just a markdown file with no yaml block.
`;

const agentMdInvalidYaml = `# Agent with invalid YAML

\`\`\`yaml
agent:
  name: [invalid
  id: broken
\`\`\`
`;

const coreConfigContent = `slashPrefix: BMad
markdownExploder: true
`;

const coreConfigCustomPrefix = `slashPrefix: Custom
markdownExploder: true
`;

describe('CommandService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanProjects.mockResolvedValue([mockProject]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getCommands', () => {
    it('should return empty array when project not found', async () => {
      mockScanProjects.mockResolvedValue([]);

      const result = await commandService.getCommands('nonexistent');
      expect(result).toEqual([]);
    });

    it('should return empty array when .bmad-core directory does not exist', async () => {
      mockFs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await commandService.getCommands('test-slug');
      expect(result).toEqual([]);
    });

    it('should scan agents and tasks from .bmad-core directory', async () => {
      // .bmad-core stat
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      // core-config.yaml
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        if (p.endsWith('pm.md')) return agentMdContent;
        return '';
      });
      // agents readdir
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['pm.md'] as any;
        if (p.includes('tasks')) return ['create-doc.md'] as any;
        return [] as any;
      });

      const result = await commandService.getCommands('test-slug');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        command: '/BMad:agents:pm',
        name: 'PM (Product Manager)',
        description: 'Product Manager',
        category: 'agent',
        icon: '\uD83D\uDCCB',
      });
      expect(result[1]).toEqual({
        command: '/BMad:tasks:create-doc',
        name: 'create-doc',
        description: 'create-doc task',
        category: 'task',
      });
    });

    it('should use custom slashPrefix from core-config.yaml', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigCustomPrefix;
        if (p.endsWith('pm.md')) return agentMdContent;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['pm.md'] as any;
        if (p.includes('tasks')) return [] as any;
        return [];
      });

      const result = await commandService.getCommands('test-slug');

      expect(result[0].command).toBe('/Custom:agents:pm');
    });

    it('should default to "BMad" when core-config.yaml is missing', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) throw new Error('ENOENT');
        if (p.endsWith('pm.md')) return agentMdContent;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['pm.md'] as any;
        if (p.includes('tasks')) return [] as any;
        return [];
      });

      const result = await commandService.getCommands('test-slug');

      expect(result[0].command).toBe('/BMad:agents:pm');
    });

    it('should skip agent files without yaml block', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        if (p.endsWith('no-yaml.md')) return agentMdNoYaml;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['no-yaml.md'] as any;
        if (p.includes('tasks')) return [] as any;
        return [];
      });

      const result = await commandService.getCommands('test-slug');

      expect(result).toHaveLength(0);
    });

    it('should skip agent files with invalid yaml', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        if (p.endsWith('invalid.md')) return agentMdInvalidYaml;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['invalid.md'] as any;
        if (p.includes('tasks')) return [] as any;
        return [];
      });

      const result = await commandService.getCommands('test-slug');

      // Should skip the invalid file but not crash
      expect(result).toHaveLength(0);
    });

    it('should return empty when agents and tasks directories do not exist', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        return '';
      });
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await commandService.getCommands('test-slug');

      expect(result).toEqual([]);
    });

    it('should skip non-.md files in agents and tasks', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['readme.txt', '.DS_Store'] as any;
        if (p.includes('tasks')) return ['config.yaml'] as any;
        return [];
      });

      const result = await commandService.getCommands('test-slug');

      expect(result).toEqual([]);
    });
  });

  describe('parseAgentYaml', () => {
    it('should extract agent data from yaml block in markdown', () => {
      const result = commandService.parseAgentYaml(agentMdContent);

      expect(result?.agent?.id).toBe('pm');
      expect(result?.agent?.name).toBe('PM (Product Manager)');
      expect(result?.agent?.icon).toBe('\uD83D\uDCCB');
      expect(result?.agent?.title).toBe('Product Manager');
    });

    it('should return null when no yaml block found', () => {
      const result = commandService.parseAgentYaml(agentMdNoYaml);
      expect(result).toBeNull();
    });

    it('should return null for invalid yaml', () => {
      const result = commandService.parseAgentYaml(agentMdInvalidYaml);
      expect(result).toBeNull();
    });
  });
});
