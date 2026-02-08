/**
 * Command Service
 * Scans .bmad-core directory for agent and task commands
 * [Source: Story 5.1 - Task 1]
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import type { SlashCommand } from '@bmad-studio/shared';
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
   * Get slash commands for a project
   * @param projectSlug Project slug from URL
   * @returns Array of SlashCommand
   */
  async getCommands(projectSlug: string): Promise<SlashCommand[]> {
    // Resolve originalPath from projectSlug
    const projects = await projectService.scanProjects();
    const project = projects.find((p) => p.projectSlug === projectSlug);
    if (!project) {
      return [...BUILTIN_COMMANDS];
    }

    const originalPath = project.originalPath;
    const bmadCorePath = path.join(originalPath, '.bmad-core');

    // Check if .bmad-core directory exists
    try {
      const stat = await fs.stat(bmadCorePath);
      if (!stat.isDirectory()) return [...BUILTIN_COMMANDS];
    } catch {
      return [...BUILTIN_COMMANDS];
    }

    // Read slashPrefix from core-config.yaml
    const slashPrefix = await this.getSlashPrefix(bmadCorePath);

    // Scan agents and tasks in parallel
    const [agents, tasks] = await Promise.all([
      this.scanAgents(bmadCorePath, slashPrefix),
      this.scanTasks(bmadCorePath, slashPrefix),
    ]);

    return [...BUILTIN_COMMANDS, ...agents, ...tasks];
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
            name: agentData.agent.name || agentData.agent.id,
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
