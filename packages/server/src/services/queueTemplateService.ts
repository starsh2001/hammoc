/**
 * Queue Template Service — CRUD operations for saved queue templates
 * [Source: Story 15.5 - Task 3.1]
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import type { QueueTemplate } from '@bmad-studio/shared';

const TEMPLATES_DIR = '.bmad-studio';
const TEMPLATES_FILE = 'queue-templates.json';

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function getTemplatesPath(projectRoot: string): string {
  return path.join(projectRoot, TEMPLATES_DIR, TEMPLATES_FILE);
}

async function readTemplatesFile(projectRoot: string): Promise<QueueTemplate[]> {
  try {
    const content = await fs.readFile(getTemplatesPath(projectRoot), 'utf-8');
    return JSON.parse(content) as QueueTemplate[];
  } catch {
    return [];
  }
}

async function writeTemplatesFile(projectRoot: string, templates: QueueTemplate[]): Promise<void> {
  const dir = path.join(projectRoot, TEMPLATES_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getTemplatesPath(projectRoot), JSON.stringify(templates, null, 2), 'utf-8');
}

export const queueTemplateService = {
  async getTemplates(projectRoot: string): Promise<QueueTemplate[]> {
    return readTemplatesFile(projectRoot);
  },

  async saveTemplate(projectRoot: string, name: string, template: string): Promise<QueueTemplate> {
    const templates = await readTemplatesFile(projectRoot);
    const now = new Date().toISOString();
    const newTemplate: QueueTemplate = {
      id: crypto.randomUUID(),
      name,
      template: normalizeLineEndings(template),
      createdAt: now,
      updatedAt: now,
    };
    templates.push(newTemplate);
    await writeTemplatesFile(projectRoot, templates);
    return newTemplate;
  },

  async updateTemplate(projectRoot: string, id: string, name: string, template: string): Promise<QueueTemplate> {
    const templates = await readTemplatesFile(projectRoot);
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Template not found: ${id}`);
    }
    templates[index] = {
      ...templates[index],
      name,
      template: normalizeLineEndings(template),
      updatedAt: new Date().toISOString(),
    };
    await writeTemplatesFile(projectRoot, templates);
    return templates[index];
  },

  async deleteTemplate(projectRoot: string, id: string): Promise<void> {
    const templates = await readTemplatesFile(projectRoot);
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Template not found: ${id}`);
    }
    templates.splice(index, 1);
    await writeTemplatesFile(projectRoot, templates);
  },
};
