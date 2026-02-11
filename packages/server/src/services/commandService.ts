/**
 * Command Service
 * Scans .bmad-core directory for agent and task commands
 * [Source: Story 5.1 - Task 1]
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import type { SlashCommand, StarCommand, CommandsResponse } from '@bmad-studio/shared';
import { projectService } from './projectService.js';

interface CoreConfig {
  slashPrefix?: string;
}

interface AgentYaml {
  agent?: {
    name?: string;
    id?: string;
    title?: string;
    icon?: string;
  };
  commands?: Array<Record<string, string>> | Record<string, string>;
}

/** Built-in Claude Code system commands that work via SDK programmatic API.
 * Most built-in commands (e.g. /cost, /help, /model) are CLI-only interactive
 * commands and do NOT work through the SDK conversation API.
 * Only /compact is confirmed to work programmatically. */
const BUILTIN_COMMANDS: SlashCommand[] = [
  { command: '/compact', name: 'compact', description: 'Compact conversation context', category: 'builtin' },
];

class CommandService {
  /**
   * Resolve projectSlug to bmadCorePath.
   * Returns null if project not found or .bmad-core is not a directory.
   */
  private async resolveBmadCorePath(projectSlug: string): Promise<string | null> {
    const projects = await projectService.scanProjects();
    const project = projects.find((p) => p.projectSlug === projectSlug);
    if (!project) return null;

    const bmadCorePath = path.join(project.originalPath, '.bmad-core');
    try {
      const stat = await fs.stat(bmadCorePath);
      if (!stat.isDirectory()) return null;
    } catch {
      return null;
    }
    return bmadCorePath;
  }

  /**
   * Get slash commands for a project
   * @param projectSlug Project slug from URL
   * @returns Array of SlashCommand
   */
  async getCommands(projectSlug: string): Promise<SlashCommand[]> {
    const bmadCorePath = await this.resolveBmadCorePath(projectSlug);
    if (!bmadCorePath) return [...BUILTIN_COMMANDS];

    const slashPrefix = await this.getSlashPrefix(bmadCorePath);
    const [agents, tasks] = await Promise.all([
      this.scanAgents(bmadCorePath, slashPrefix),
      this.scanTasks(bmadCorePath, slashPrefix),
    ]);

    return [...BUILTIN_COMMANDS, ...agents, ...tasks];
  }

  /**
   * Get commands with star commands for a project
   * [Source: Story 9.8 - Task 2]
   */
  async getCommandsWithStarCommands(projectSlug: string): Promise<CommandsResponse> {
    const bmadCorePath = await this.resolveBmadCorePath(projectSlug);
    if (!bmadCorePath) {
      return { commands: [...BUILTIN_COMMANDS], starCommands: {} };
    }

    const slashPrefix = await this.getSlashPrefix(bmadCorePath);

    const [agents, tasks, starCommands] = await Promise.all([
      this.scanAgents(bmadCorePath, slashPrefix),
      this.scanTasks(bmadCorePath, slashPrefix),
      this.scanStarCommands(bmadCorePath),
    ]);

    return {
      commands: [...BUILTIN_COMMANDS, ...agents, ...tasks],
      starCommands,
    };
  }

  /**
   * Read slashPrefix from core-config.yaml
   */
  async getSlashPrefix(bmadCorePath: string): Promise<string> {
    const configPath = path.join(bmadCorePath, 'core-config.yaml');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(content) as CoreConfig;
      return config?.slashPrefix || 'BMad';
    } catch {
      return 'BMad';
    }
  }

  /**
   * Scan .bmad-core/agents/ directory for agent commands
   */
  async scanAgents(bmadCorePath: string, slashPrefix: string): Promise<SlashCommand[]> {
    const agentsDir = path.join(bmadCorePath, 'agents');
    const commands: SlashCommand[] = [];

    let files: string[];
    try {
      files = await fs.readdir(agentsDir);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      try {
        const filePath = path.join(agentsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const agentData = this.parseAgentYaml(content);

        if (agentData?.agent?.id) {
          commands.push({
            command: `/${slashPrefix}:agents:${agentData.agent.id}`,
            name: agentData.agent.id.toUpperCase(),
            description: agentData.agent.title,
            category: 'agent',
            icon: agentData.agent.icon,
          });
        }
      } catch {
        // Skip files that fail to parse
        continue;
      }
    }

    return commands;
  }

  /**
   * Scan .bmad-core/tasks/ directory for task commands
   */
  async scanTasks(bmadCorePath: string, slashPrefix: string): Promise<SlashCommand[]> {
    const tasksDir = path.join(bmadCorePath, 'tasks');
    const commands: SlashCommand[] = [];

    let files: string[];
    try {
      files = await fs.readdir(tasksDir);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const taskName = file.replace(/\.md$/, '');
      commands.push({
        command: `/${slashPrefix}:tasks:${taskName}`,
        name: taskName,
        description: `${taskName} task`,
        category: 'task',
      });
    }

    return commands;
  }

  /**
   * Parse star commands from agent YAML commands section
   * [Source: Story 9.8 - Task 2]
   */
  parseStarCommands(agentId: string, agentYaml: AgentYaml): StarCommand[] {
    if (!agentYaml.commands) return [];

    // Normalize: plain object format (e.g., bmad-orchestrator) → array of single-key objects
    const commandsList = Array.isArray(agentYaml.commands)
      ? agentYaml.commands
      : Object.entries(agentYaml.commands).map(([k, v]) => ({ [k]: v }));

    if (commandsList.length === 0) return [];

    return commandsList
      .map((item) => {
        const entries = Object.entries(item);
        if (entries.length === 0) return null;
        const [command, description] = entries[0];
        // Non-string descriptions (e.g., nested workflow objects) → include with fallback description
        return { agentId, command, description: typeof description === 'string' ? description : 'Complex workflow command' };
      })
      .filter((cmd): cmd is StarCommand => cmd !== null);
  }

  /**
   * Scan agents directory for star commands
   * [Source: Story 9.8 - Task 2]
   */
  async scanStarCommands(bmadCorePath: string): Promise<Record<string, StarCommand[]>> {
    const agentsDir = path.join(bmadCorePath, 'agents');
    const result: Record<string, StarCommand[]> = {};

    let files: string[];
    try {
      files = await fs.readdir(agentsDir);
    } catch {
      return {};
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      try {
        const filePath = path.join(agentsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const agentData = this.parseAgentYaml(content);

        if (!agentData?.agent?.id) continue;

        const starCommands = this.parseStarCommands(agentData.agent.id, agentData);
        if (starCommands.length > 0) {
          result[agentData.agent.id] = starCommands;
        }
      } catch {
        continue;
      }
    }

    return result;
  }

  /**
   * Parse YAML block from agent .md file
   * Extracts ```yaml ... ``` block and parses it
   */
  parseAgentYaml(content: string): AgentYaml | null {
    const yamlMatch = content.match(/```yaml\s*\n([\s\S]*?)```/);
    if (!yamlMatch) return null;

    try {
      return yaml.load(yamlMatch[1]) as AgentYaml;
    } catch {
      return null;
    }
  }
}

export const commandService = new CommandService();
