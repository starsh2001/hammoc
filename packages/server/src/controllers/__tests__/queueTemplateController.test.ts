/**
 * QueueTemplateController Tests
 * [Source: Story 15.5 - Task 8.3]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock dependencies
const mockGetTemplates = vi.fn();
const mockSaveTemplate = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();

vi.mock('../../services/queueTemplateService.js', () => ({
  queueTemplateService: {
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    saveTemplate: (...args: unknown[]) => mockSaveTemplate(...args),
    updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  },
}));

vi.mock('../../services/projectService.js', () => ({
  projectService: {
    resolveOriginalPath: vi.fn().mockResolvedValue('/mock/project/path'),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn(),
  },
}));

import { listTemplates, createTemplate, updateTemplate, deleteTemplate, extractStories } from '../queueTemplateController.js';
import fs from 'fs/promises';
import yaml from 'js-yaml';

function createMockReq(params: Record<string, string> = {}, body: Record<string, unknown> = {}): Request {
  return { params, body, t: (key: string) => key, language: 'en' } as unknown as Request;
}

function createMockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null as unknown,
    status(code: number) { res._status = code; return res; },
    json(data: unknown) { res._json = data; return res; },
    send() { return res; },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

describe('QueueTemplateController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-QT-19
  describe('listTemplates', () => {
    it('GET /queue/templates returns 200 with templates array', async () => {
      const templates = [{ id: '1', name: 'T1', template: 'test', createdAt: '', updatedAt: '' }];
      mockGetTemplates.mockResolvedValue(templates);

      const req = createMockReq({ projectSlug: 'test-project' });
      const res = createMockRes();
      await listTemplates(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(res._json).toEqual(templates);
    });
  });

  // TC-QT-20
  describe('createTemplate', () => {
    it('POST /queue/templates returns 201 with created template', async () => {
      const created = { id: '1', name: 'Test', template: '/dev {story_num}', createdAt: '', updatedAt: '' };
      mockSaveTemplate.mockResolvedValue(created);

      const req = createMockReq({ projectSlug: 'test-project' }, { name: 'Test', template: '/dev {story_num}' });
      const res = createMockRes();
      await createTemplate(req, res as unknown as Response);

      expect(res._status).toBe(201);
      expect(res._json).toEqual(created);
    });

    // TC-QT-21
    it('POST /queue/templates returns 400 when name or template missing', async () => {
      const req = createMockReq({ projectSlug: 'test-project' }, { name: '' });
      const res = createMockRes();
      await createTemplate(req, res as unknown as Response);

      expect(res._status).toBe(400);
    });

    it('returns 400 when template is missing', async () => {
      const req = createMockReq({ projectSlug: 'test-project' }, { name: 'Valid', template: '' });
      const res = createMockRes();
      await createTemplate(req, res as unknown as Response);
      expect(res._status).toBe(400);
    });
  });

  // TC-QT-22
  describe('updateTemplate', () => {
    it('PUT /queue/templates/:id returns 200 with updated template', async () => {
      const updated = { id: 'abc', name: 'Updated', template: 'new', createdAt: '', updatedAt: '' };
      mockUpdateTemplate.mockResolvedValue(updated);

      const req = createMockReq({ projectSlug: 'test-project', id: 'abc' }, { name: 'Updated', template: 'new' });
      const res = createMockRes();
      await updateTemplate(req, res as unknown as Response);

      expect(res._status).toBe(200);
      expect(res._json).toEqual(updated);
    });
  });

  // TC-QT-23
  describe('deleteTemplate', () => {
    it('DELETE /queue/templates/:id returns 204', async () => {
      mockDeleteTemplate.mockResolvedValue(undefined);

      const req = createMockReq({ projectSlug: 'test-project', id: 'abc' });
      const res = createMockRes();
      await deleteTemplate(req, res as unknown as Response);

      expect(res._status).toBe(204);
    });
  });

  describe('extractStories', () => {
    // TC-QT-24
    it('GET /queue/stories returns 200 with extracted stories', async () => {
      const mockReadFile = vi.mocked(fs.readFile);
      const mockYamlLoad = vi.mocked(yaml.load);

      mockYamlLoad.mockReturnValue({
        prd: { prdSharded: true, prdShardedLocation: 'docs/prd', epicFilePattern: 'epic-{n}*.md' },
      });
      mockReadFile.mockResolvedValue('yaml content');

      const mockReaddir = vi.mocked(fs.readdir);
      mockReaddir.mockResolvedValue(['6-epic-details.md'] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer U> ? U : never);
      // The second readFile call (for the epic file) returns story headers
      mockReadFile
        .mockResolvedValueOnce('yaml content') // config file
        .mockResolvedValueOnce('### Story 1.1: Auth Setup\n### Story 1.2: Login\n### Story 2.1: Dashboard\n'); // PRD content

      const req = createMockReq({ projectSlug: 'test-project' });
      const res = createMockRes();
      await extractStories(req, res as unknown as Response);

      expect(res._status).toBe(200);
      const json = res._json as { stories: unknown[] };
      expect(json.stories).toBeDefined();
    });

    // TC-QT-25a
    it('GET /queue/stories returns 200 with empty array and error when PRD file not found', async () => {
      const mockReadFile = vi.mocked(fs.readFile);
      const mockYamlLoad = vi.mocked(yaml.load);

      mockYamlLoad.mockReturnValue({
        prd: { prdFile: 'docs/nonexistent.md' },
      });
      mockReadFile
        .mockResolvedValueOnce('yaml content') // config read succeeds
        .mockRejectedValueOnce(new Error('ENOENT')); // PRD read fails

      const req = createMockReq({ projectSlug: 'test-project' });
      const res = createMockRes();
      await extractStories(req, res as unknown as Response);

      expect(res._status).toBe(200);
      const json = res._json as { stories: unknown[]; error?: string };
      expect(json.stories).toEqual([]);
      expect(json.error).toBe('queueTemplate.error.prdNotFound');
    });

    // TC-QT-25b
    it('GET /queue/stories returns 404 when bmad-config not found', async () => {
      const mockReadFile = vi.mocked(fs.readFile);
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const req = createMockReq({ projectSlug: 'test-project' });
      const res = createMockRes();
      await extractStories(req, res as unknown as Response);

      expect(res._status).toBe(404);
      const json = res._json as { error: string };
      expect(json.error).toBe('queueTemplate.error.bmadConfigNotFound');
    });
  });
});
