/**
 * Queue Template Controller — REST API handlers for template CRUD and story extraction
 * [Source: Story 15.5 - Task 3.2, 3.4]
 */

import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { extractStoryNumbers } from '@hammoc/shared';
import type { BmadConfig, QueueStoryInfo } from '@hammoc/shared';
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
    res.status(500).json({ error: req.t!('queueTemplate.error.listFailed') });
  }
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const { name, template } = req.body;
  if (!name || typeof name !== 'string' || !name.trim() || !template || typeof template !== 'string' || !template.trim()) {
    res.status(400).json({ error: req.t!('queueTemplate.validation.nameTemplateRequired') });
    return;
  }
  try {
    const projectRoot = await getProjectRoot(req.params.projectSlug);
    const created = await queueTemplateService.saveTemplate(projectRoot, name.trim(), template);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: req.t!('queueTemplate.error.createFailed') });
  }
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const { name, template } = req.body;
  const { id } = req.params;
  if (!name || typeof name !== 'string' || !name.trim() || !template || typeof template !== 'string' || !template.trim()) {
    res.status(400).json({ error: req.t!('queueTemplate.validation.nameTemplateRequired') });
    return;
  }
  try {
    const projectRoot = await getProjectRoot(req.params.projectSlug);
    const updated = await queueTemplateService.updateTemplate(projectRoot, id, name.trim(), template);
    res.status(200).json(updated);
  } catch (error) {
    if ((error as Error).message?.includes('not found')) {
      res.status(404).json({ error: req.t!('queueTemplate.error.notFound') });
      return;
    }
    res.status(500).json({ error: req.t!('queueTemplate.error.updateFailed') });
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
      res.status(404).json({ error: req.t!('queueTemplate.error.notFound') });
      return;
    }
    res.status(500).json({ error: req.t!('queueTemplate.error.deleteFailed') });
  }
}

// --- Global template handlers ---

export async function listGlobalTemplates(req: Request, res: Response): Promise<void> {
  try {
    const templates = await queueTemplateService.getGlobalTemplates();
    res.status(200).json(templates);
  } catch {
    res.status(500).json({ error: req.t!('queueTemplate.error.listFailed') });
  }
}

export async function createGlobalTemplate(req: Request, res: Response): Promise<void> {
  const { name, template } = req.body;
  if (!name || typeof name !== 'string' || !name.trim() || !template || typeof template !== 'string' || !template.trim()) {
    res.status(400).json({ error: req.t!('queueTemplate.validation.nameTemplateRequired') });
    return;
  }
  try {
    const created = await queueTemplateService.saveGlobalTemplate(name.trim(), template);
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: req.t!('queueTemplate.error.createFailed') });
  }
}

export async function updateGlobalTemplate(req: Request, res: Response): Promise<void> {
  const { name, template } = req.body;
  const { id } = req.params;
  if (!name || typeof name !== 'string' || !name.trim() || !template || typeof template !== 'string' || !template.trim()) {
    res.status(400).json({ error: req.t!('queueTemplate.validation.nameTemplateRequired') });
    return;
  }
  try {
    const updated = await queueTemplateService.updateGlobalTemplate(id, name.trim(), template);
    res.status(200).json(updated);
  } catch (error) {
    if ((error as Error).message?.includes('not found')) {
      res.status(404).json({ error: req.t!('queueTemplate.error.notFound') });
      return;
    }
    res.status(500).json({ error: req.t!('queueTemplate.error.updateFailed') });
  }
}

export async function deleteGlobalTemplate(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    await queueTemplateService.deleteGlobalTemplate(id);
    res.status(204).send();
  } catch (error) {
    if ((error as Error).message?.includes('not found')) {
      res.status(404).json({ error: req.t!('queueTemplate.error.notFound') });
      return;
    }
    res.status(500).json({ error: req.t!('queueTemplate.error.deleteFailed') });
  }
}

/**
 * Extract story numbers from PRD content and brownfield story files.
 * Follows bmadStatusService's 3-step PRD reading pattern (L191-246).
 */
export async function extractStories(req: Request, res: Response): Promise<void> {
  let projectRoot: string;
  try {
    projectRoot = await getProjectRoot(req.params.projectSlug);
  } catch {
    res.status(500).json({ error: req.t!('queueTemplate.error.projectPathFailed') });
    return;
  }

  // Parse bmad config
  let config: BmadConfig & { devStoryLocation?: string };
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
      devStoryLocation: parsed.devStoryLocation as string | undefined,
    };
  } catch {
    res.status(404).json({ error: req.t!('queueTemplate.error.bmadConfigNotFound') });
    return;
  }

  const allStories: QueueStoryInfo[] = [];
  let hasPrdContent = false;

  // Regex to detect epic headers within file content (same as bmadStatusService)
  const EPIC_HEADER_RE = /^(?:#{1,3}\s+)?(?:\d+\.\s+)?Epic\s+(\d+)[\s:\u2013-]+(.+)/m;

  // 3-step fallback strategy (mirrors bmadStatusService)
  if (config.prdSharded && config.prdShardedLocation) {
    const shardedDir = path.join(projectRoot, config.prdShardedLocation);
    const scannedFiles = new Set<string>();

    // Step 1: Try epicFilePattern — process each file individually with epic context
    if (config.epicFilePattern) {
      const pattern = epicFilePatternToRegex(config.epicFilePattern);
      try {
        const files = await fs.readdir(shardedDir);
        for (const file of files) {
          const fileMatch = file.match(pattern);
          if (fileMatch) {
            scannedFiles.add(file);
            const epicNum = parseInt(fileMatch[1], 10);
            const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
            hasPrdContent = true;
            allStories.push(...extractStoryNumbers(content, epicNum));
          }
        }
      } catch {
        // Directory not found, fall through
      }
    }

    // Step 2: Scan remaining .md files for additional stories
    try {
      const files = await fs.readdir(shardedDir);
      for (const file of files) {
        if (!file.endsWith('.md') || scannedFiles.has(file)) continue;
        const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
        hasPrdContent = true;
        // Detect single-epic files to provide context for standalone story headers
        const epicHeaders: number[] = [];
        const epicRegex = new RegExp(EPIC_HEADER_RE.source, 'gm');
        let epicMatch;
        while ((epicMatch = epicRegex.exec(content)) !== null) {
          epicHeaders.push(parseInt(epicMatch[1], 10));
        }
        const epicContext = epicHeaders.length === 1 ? epicHeaders[0] : undefined;
        allStories.push(...extractStoryNumbers(content, epicContext));
      }
    } catch {
      // Directory not found
    }
  } else if (config.prdFile) {
    // Step 3: Monolithic PRD
    try {
      const prdContent = await fs.readFile(path.join(projectRoot, config.prdFile), 'utf-8');
      hasPrdContent = true;
      allStories.push(...extractStoryNumbers(prdContent));
    } catch {
      // File not found
    }
  }

  // Step 4: Scan story files directory for BE-/BS- brownfield stories
  const storyLocation = config.devStoryLocation || 'docs/stories';
  try {
    const storiesDir = path.join(projectRoot, storyLocation);
    const storyFiles = await fs.readdir(storiesDir);

    const bfStandaloneRegex = /^BS-(\d+)\..+\.md$/;

    for (const file of storyFiles) {
      let storyInfo: QueueStoryInfo | null = null;
      const bsMatch = file.match(bfStandaloneRegex);

      if (bsMatch) {
        const storyIndex = parseInt(bsMatch[1], 10);
        const title = await extractTitleFromStoryFile(path.join(storiesDir, file));
        storyInfo = {
          storyNum: `BS-${bsMatch[1]}`,
          epicNum: 'BS',
          storyIndex,
          title,
        };
      }

      if (storyInfo) {
        hasPrdContent = true;
        allStories.push(storyInfo);
      }
    }
  } catch {
    // Story directory not found
  }

  if (!hasPrdContent) {
    res.status(200).json({ stories: [], error: req.t!('queueTemplate.error.prdNotFound') });
    return;
  }

  // Deduplicate and sort: numbers first, then BE-*, then BS
  const seen = new Set<string>();
  const stories = allStories
    .sort((a, b) => {
      const aIsNum = typeof a.epicNum === 'number';
      const bIsNum = typeof b.epicNum === 'number';
      if (aIsNum && bIsNum) return (a.epicNum as number) - (b.epicNum as number) || a.storyIndex - b.storyIndex;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      if (a.epicNum === 'BS' && b.epicNum !== 'BS') return 1;
      if (b.epicNum === 'BS' && a.epicNum !== 'BS') return -1;
      const cmp = String(a.epicNum).localeCompare(String(b.epicNum), undefined, { numeric: true });
      return cmp !== 0 ? cmp : a.storyIndex - b.storyIndex;
    })
    .filter((s) => { if (seen.has(s.storyNum)) return false; seen.add(s.storyNum); return true; });
  res.status(200).json({ stories });
}

/** Extract story title from the first markdown heading in a story file */
async function extractTitleFromStoryFile(filePath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(/^#\s+(?:Story[:\s]*)?(.+)/m);
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Convert epicFilePattern like "epic-{n}*.md" to a regex (same as bmadStatusService) */
function epicFilePatternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{n\\\}/g, '(\\d+)')
    .replace(/\*/g, '.*');
  return new RegExp(`^(?:\\d+-)?${escaped}$`);
}
