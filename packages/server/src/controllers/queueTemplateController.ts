/**
 * Queue Template Controller — REST API handlers for template CRUD and story extraction
 * [Source: Story 15.5 - Task 3.2, 3.4]
 */

import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { extractStoryNumbers } from '@bmad-studio/shared';
import type { BmadConfig } from '@bmad-studio/shared';
import { queueTemplateService } from '../services/queueTemplateService.js';
import { projectService } from '../services/projectService.js';

async function getProjectRoot(projectSlug: string): Promise<string> {
  return projectService.resolveOriginalPath(projectSlug);
}

export async function listTemplates(req: Request, res: Response): Promise<void> {
  try {
    const projectRoot = await getProjectRoot(req.params.projectSlug);
    const templates = await queueTemplateService.getTemplates(projectRoot);
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list templates' });
  }
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const { name, template } = req.body;
  if (!name || typeof name !== 'string' || !template || typeof template !== 'string') {
    res.status(400).json({ error: 'name and template are required non-empty strings' });
    return;
  }
  try {
    const projectRoot = await getProjectRoot(req.params.projectSlug);
    const created = await queueTemplateService.saveTemplate(projectRoot, name, template);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const { name, template } = req.body;
  const { id } = req.params;
  if (!name || typeof name !== 'string' || !template || typeof template !== 'string') {
    res.status(400).json({ error: 'name and template are required non-empty strings' });
    return;
  }
  try {
    const projectRoot = await getProjectRoot(req.params.projectSlug);
    const updated = await queueTemplateService.updateTemplate(projectRoot, id, name, template);
    res.status(200).json(updated);
  } catch (error) {
    if ((error as Error).message?.includes('not found')) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to update template' });
  }
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const projectRoot = await getProjectRoot(req.params.projectSlug);
    await queueTemplateService.deleteTemplate(projectRoot, id);
    res.status(204).send();
  } catch (error) {
    if ((error as Error).message?.includes('not found')) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete template' });
  }
}

/**
 * Extract story numbers from PRD content.
 * Follows bmadStatusService's 3-step PRD reading pattern (L191-246).
 */
export async function extractStories(req: Request, res: Response): Promise<void> {
  let projectRoot: string;
  try {
    projectRoot = await getProjectRoot(req.params.projectSlug);
  } catch {
    res.status(500).json({ error: 'Failed to resolve project path' });
    return;
  }

  // Parse bmad config
  let config: BmadConfig;
  try {
    const configPath = path.join(projectRoot, '.bmad-core', 'core-config.yaml');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const parsed = yaml.load(configContent) as Record<string, unknown>;
    const prd = parsed.prd as Record<string, unknown> | undefined;
    config = {
      prdFile: prd?.prdFile as string | undefined,
      prdSharded: prd?.prdSharded as boolean | undefined,
      prdShardedLocation: prd?.prdShardedLocation as string | undefined,
      epicFilePattern: prd?.epicFilePattern as string | undefined,
    };
  } catch {
    res.status(404).json({ error: 'BMad config not found for this project' });
    return;
  }

  let prdContent = '';

  // 3-step fallback strategy (mirrors bmadStatusService)
  if (config.prdSharded && config.prdShardedLocation) {
    const shardedDir = path.join(projectRoot, config.prdShardedLocation);

    // Step 1: Try epicFilePattern
    if (config.epicFilePattern) {
      const pattern = epicFilePatternToRegex(config.epicFilePattern);
      try {
        const files = await fs.readdir(shardedDir);
        for (const file of files) {
          if (pattern.test(file)) {
            const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
            prdContent += content + '\n';
          }
        }
      } catch {
        // Directory not found, fall through
      }
    }

    // Step 2: Fallback — read all .md files
    if (!prdContent) {
      try {
        const files = await fs.readdir(shardedDir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
          prdContent += content + '\n';
        }
      } catch {
        // Directory not found
      }
    }
  } else if (config.prdFile) {
    // Step 3: Monolithic PRD
    try {
      prdContent = await fs.readFile(path.join(projectRoot, config.prdFile), 'utf-8');
    } catch {
      // File not found
    }
  }

  if (!prdContent) {
    res.status(200).json({ stories: [], error: 'PRD file not found' });
    return;
  }

  const stories = extractStoryNumbers(prdContent);
  res.status(200).json({ stories });
}

/** Convert epicFilePattern like "epic-{n}*.md" to a regex (same as bmadStatusService) */
function epicFilePatternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{n\\\}/g, '(\\d+)')
    .replace(/\*/g, '.*');
  return new RegExp(`^(?:\\d+-)?${escaped}$`);
}
