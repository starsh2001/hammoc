/**
 * Queue Template Service — CRUD operations for saved queue templates
 * Supports both project-level (~project/.hammoc/) and global (~/.hammoc/) templates
 * [Source: Story 15.5 - Task 3.1]
 */

import os from 'node:os';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import type { QueueTemplate } from '@hammoc/shared';

const TEMPLATES_DIR = '.hammoc';
const TEMPLATES_FILE = 'queue-templates.json';

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function getTemplatesPath(root: string): string {
  return path.join(root, TEMPLATES_DIR, TEMPLATES_FILE);
}

function getGlobalTemplatesPath(): string {
  return path.join(os.homedir(), TEMPLATES_DIR, TEMPLATES_FILE);
}

async function readTemplatesFile(filePath: string): Promise<QueueTemplate[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as QueueTemplate[];
  } catch {
    return [];
  }
}

async function writeTemplatesFile(filePath: string, templates: QueueTemplate[]): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(templates, null, 2), 'utf-8');
}

function createTemplate(name: string, template: string): QueueTemplate {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    template: normalizeLineEndings(template),
    createdAt: now,
    updatedAt: now,
  };
}

export const queueTemplateService = {
  // --- Project-level templates ---

  async getTemplates(projectRoot: string): Promise<QueueTemplate[]> {
    return readTemplatesFile(getTemplatesPath(projectRoot));
  },

  async saveTemplate(projectRoot: string, name: string, template: string): Promise<QueueTemplate> {
    const filePath = getTemplatesPath(projectRoot);
    const templates = await readTemplatesFile(filePath);
    const newTemplate = createTemplate(name, template);
    templates.push(newTemplate);
    await writeTemplatesFile(filePath, templates);
    return newTemplate;
  },

  async updateTemplate(projectRoot: string, id: string, name: string, template: string): Promise<QueueTemplate> {
    const filePath = getTemplatesPath(projectRoot);
    const templates = await readTemplatesFile(filePath);
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
    await writeTemplatesFile(filePath, templates);
    return templates[index];
  },

  async deleteTemplate(projectRoot: string, id: string): Promise<void> {
    const filePath = getTemplatesPath(projectRoot);
    const templates = await readTemplatesFile(filePath);
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Template not found: ${id}`);
    }
    templates.splice(index, 1);
    await writeTemplatesFile(filePath, templates);
  },

  // --- Global templates ---

  async getGlobalTemplates(): Promise<QueueTemplate[]> {
    return readTemplatesFile(getGlobalTemplatesPath());
  },

  async saveGlobalTemplate(name: string, template: string): Promise<QueueTemplate> {
    const filePath = getGlobalTemplatesPath();
    const templates = await readTemplatesFile(filePath);
    const newTemplate = createTemplate(name, template);
    templates.push(newTemplate);
    await writeTemplatesFile(filePath, templates);
    return newTemplate;
  },

  async updateGlobalTemplate(id: string, name: string, template: string): Promise<QueueTemplate> {
    const filePath = getGlobalTemplatesPath();
    const templates = await readTemplatesFile(filePath);
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
    await writeTemplatesFile(filePath, templates);
    return templates[index];
  },

  async deleteGlobalTemplate(id: string): Promise<void> {
    const filePath = getGlobalTemplatesPath();
    const templates = await readTemplatesFile(filePath);
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Template not found: ${id}`);
    }
    templates.splice(index, 1);
    await writeTemplatesFile(filePath, templates);
  },
};
