/**
 * Unit Tests for CommandService
 * [Source: Story 5.1 - Task 1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import type { ProjectInfo } from '@hammoc/shared';

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
    it('should return BUILTIN_COMMANDS when project not found', async () => {
      mockScanProjects.mockResolvedValue([]);

      const result = await commandService.getCommands('nonexistent');
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('/compact');
    });

    it('should return BUILTIN_COMMANDS when .bmad-core directory does not exist', async () => {
      mockFs.stat.mockRejectedValue(new Error('ENOENT'));
      mockFs.readdir.mockResolvedValue([] as any);

      const result = await commandService.getCommands('test-slug');
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('/compact');
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

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        command: '/compact',
        name: 'compact',
        description: 'Compact conversation context',
        category: 'builtin',
      });
      expect(result[1]).toEqual({
        command: '/BMad:agents:pm',
        name: 'PM',
        description: 'Product Manager',
        category: 'agent',
        icon: '\uD83D\uDCCB',
      });
      expect(result[2]).toEqual({
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

      expect(result[1].command).toBe('/Custom:agents:pm');
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

      expect(result[1].command).toBe('/BMad:agents:pm');
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

      // Only BUILTIN_COMMANDS, no agents parsed
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('/compact');
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

      // Should skip the invalid file but not crash, only BUILTIN_COMMANDS
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('/compact');
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

      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('/compact');
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

      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('/compact');
    });
  });

  describe('parseStarCommands', () => {
    it('TC1: should extract StarCommand[] from agent with commands section', () => {
      const agentYaml = {
        agent: { id: 'sm', name: 'Bob', title: 'Scrum Master' },
        commands: [
          { help: 'Show numbered list of the following commands to allow selection' },
          { draft: 'Execute task create-next-story.md' },
          { exit: 'Say goodbye as the Scrum Master' },
        ] as Record<string, string>[],
      };

      const result = commandService.parseStarCommands('sm', agentYaml);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        agentId: 'sm',
        command: 'help',
        description: 'Show numbered list of the following commands to allow selection',
      });
      expect(result[1]).toEqual({
        agentId: 'sm',
        command: 'draft',
        description: 'Execute task create-next-story.md',
      });
      expect(result[2]).toEqual({
        agentId: 'sm',
        command: 'exit',
        description: 'Say goodbye as the Scrum Master',
      });
    });

    it('TC2: should return empty array when commands section is missing', () => {
      const agentYaml = {
        agent: { id: 'analyst', name: 'Alice', title: 'Business Analyst' },
      };

      const result = commandService.parseStarCommands('analyst', agentYaml);
      expect(result).toEqual([]);
    });

    it('TC3: should return empty array when commands array is empty', () => {
      const agentYaml = {
        agent: { id: 'dev', name: 'James', title: 'Developer' },
        commands: [],
      };

      const result = commandService.parseStarCommands('dev', agentYaml);
      expect(result).toEqual([]);
    });

    it('TC11: should handle plain object commands format (bmad-orchestrator style)', () => {
      const agentYaml = {
        agent: { id: 'bmad-orchestrator', name: 'BMad Orchestrator', title: 'Master Orchestrator' },
        commands: {
          help: 'Show this guide with available agents and workflows',
          agent: 'Transform into a specialized agent',
          exit: 'Return to BMad or exit session',
        } as unknown as Record<string, string>[],
      };

      const result = commandService.parseStarCommands('bmad-orchestrator', agentYaml);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        agentId: 'bmad-orchestrator',
        command: 'help',
        description: 'Show this guide with available agents and workflows',
      });
      expect(result[1]).toEqual({
        agentId: 'bmad-orchestrator',
        command: 'agent',
        description: 'Transform into a specialized agent',
      });
      expect(result[2]).toEqual({
        agentId: 'bmad-orchestrator',
        command: 'exit',
        description: 'Return to BMad or exit session',
      });
    });

    it('TC12: should include commands with non-string description values using empty description', () => {
      const agentYaml = {
        agent: { id: 'dev', name: 'James', title: 'Developer' },
        commands: [
          { help: 'Show numbered list of commands' },
          { 'develop-story': [{ 'order-of-execution': 'Read task...' }, { blocking: 'HALT for...' }] },
          { exit: 'Say goodbye as the Developer' },
        ] as Record<string, string>[],
      };

      const result = commandService.parseStarCommands('dev', agentYaml);

      expect(result).toHaveLength(3);
      expect(result[0].command).toBe('help');
      expect(result[1]).toEqual({ agentId: 'dev', command: 'develop-story', description: 'Complex workflow command' });
      expect(result[2].command).toBe('exit');
    });
  });

  describe('scanStarCommands', () => {
    const agentMdWithCommands = `# Agent SM
\`\`\`yaml
agent:
  name: Bob
  id: sm
  title: Scrum Master
  icon: "🏃"
commands:
  - help: Show numbered list of the following commands to allow selection
  - draft: Execute task create-next-story.md
  - exit: Say goodbye as the Scrum Master
\`\`\`
`;

    const agentMdNoCommands = `# Agent Analyst
\`\`\`yaml
agent:
  name: Alice
  id: analyst
  title: Business Analyst
  icon: "🔍"
\`\`\`
`;

    it('TC4: should group star commands by agent, excluding agents without commands', async () => {
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['sm.md', 'analyst.md'] as any;
        return [] as any;
      });
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('sm.md')) return agentMdWithCommands;
        if (p.endsWith('analyst.md')) return agentMdNoCommands;
        return '';
      });

      const result = await commandService.scanStarCommands('/fake/.bmad-core');

      expect(Object.keys(result)).toEqual(['sm']);
      expect(result['sm']).toHaveLength(3);
      expect(result['sm'][0].command).toBe('help');
      expect(result['analyst']).toBeUndefined();
    });

    it('TC5: should return empty object when agents directory does not exist', async () => {
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await commandService.scanStarCommands('/fake/.bmad-core');
      expect(result).toEqual({});
    });

    it('TC13: should handle agent with plain object commands format (orchestrator style)', async () => {
      const agentMdObjectCommands = `# BMad Orchestrator
\`\`\`yaml
agent:
  name: BMad Orchestrator
  id: bmad-orchestrator
  title: Master Orchestrator
  icon: "🎭"
commands:
  help: Show this guide
  agent: Transform into a specialized agent
  exit: Return to BMad or exit session
\`\`\`
`;
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['orchestrator.md'] as any;
        return [] as any;
      });
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('orchestrator.md')) return agentMdObjectCommands;
        return '';
      });

      const result = await commandService.scanStarCommands('/fake/.bmad-core');

      expect(Object.keys(result)).toEqual(['bmad-orchestrator']);
      expect(result['bmad-orchestrator']).toHaveLength(3);
      expect(result['bmad-orchestrator'][0].command).toBe('help');
      expect(result['bmad-orchestrator'][2].command).toBe('exit');
    });

    it('TC6: should skip agents with YAML parse failure (graceful degradation)', async () => {
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['good.md', 'bad.md'] as any;
        return [] as any;
      });
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('good.md')) return agentMdWithCommands;
        if (p.endsWith('bad.md')) return agentMdInvalidYaml;
        return '';
      });

      const result = await commandService.scanStarCommands('/fake/.bmad-core');

      expect(Object.keys(result)).toEqual(['sm']);
      expect(result['sm']).toHaveLength(3);
    });
  });

  describe('getCommandsWithStarCommands', () => {
    const agentMdWithCommands = `# Agent SM
\`\`\`yaml
agent:
  name: Bob
  id: sm
  title: Scrum Master
  icon: "🏃"
commands:
  - help: Show numbered list of commands
  - exit: Say goodbye
\`\`\`
`;

    it('TC7: should return commands + starCommands in response', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        if (p.endsWith('sm.md')) return agentMdWithCommands;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['sm.md'] as any;
        if (p.includes('tasks')) return [] as any;
        return [] as any;
      });

      const result = await commandService.getCommandsWithStarCommands('test-slug');

      expect(result.commands).toBeDefined();
      expect(result.commands.length).toBeGreaterThanOrEqual(1);
      expect(result.starCommands).toBeDefined();
      expect(result.starCommands['sm']).toHaveLength(2);
      expect(result.starCommands['sm'][0]).toEqual({
        agentId: 'sm',
        command: 'help',
        description: 'Show numbered list of commands',
      });
    });

    it('TC8: should return BUILTIN_COMMANDS + empty starCommands when project not found', async () => {
      mockScanProjects.mockResolvedValue([]);

      const result = await commandService.getCommandsWithStarCommands('nonexistent');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].command).toBe('/compact');
      expect(result.starCommands).toEqual({});
    });

    it('TC9: getCommands still works after refactoring', async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as import('fs').Stats);
      mockFs.readFile.mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('core-config.yaml')) return coreConfigContent;
        if (p.endsWith('pm.md')) return agentMdContent;
        return '';
      });
      mockFs.readdir.mockImplementation(async (dirPath: unknown) => {
        const p = String(dirPath);
        if (p.includes('agents')) return ['pm.md'] as any;
        if (p.includes('tasks')) return ['create-doc.md'] as any;
        return [] as any;
      });

      const result = await commandService.getCommands('test-slug');

      expect(result).toHaveLength(3);
      expect(result[0].command).toBe('/compact');
      expect(result[1].command).toBe('/BMad:agents:pm');
      expect(result[2].command).toBe('/BMad:tasks:create-doc');
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
