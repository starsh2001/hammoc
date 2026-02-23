/**
 * QueueTemplateService Tests
 * [Source: Story 15.5 - Task 8.2]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueTemplateService } from '../queueTemplateService.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Mock crypto
vi.mock('node:crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'test-uuid-1234'),
  },
}));

import fs from 'fs/promises';

const mockReadFile = vi.mocked(fs.readFile);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockMkdir = vi.mocked(fs.mkdir);

describe('queueTemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTemplates', () => {
    // TC-QT-11
    it('returns empty array when file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await queueTemplateService.getTemplates('/project');
      expect(result).toEqual([]);
    });

    // TC-QT-12
    it('returns parsed templates from file', async () => {
      const templates = [
        { id: '1', name: 'Test', template: '/dev {story_num}', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(templates));
      const result = await queueTemplateService.getTemplates('/project');
      expect(result).toEqual(templates);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('queue-templates.json'),
        'utf-8',
      );
    });
  });

  describe('saveTemplate', () => {
    // TC-QT-13
    it('creates new template with UUID and writes to file', async () => {
      mockReadFile.mockResolvedValue('[]');
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const result = await queueTemplateService.saveTemplate('/project', 'Test', '/dev {story_num}');
      expect(result.id).toBe('test-uuid-1234');
      expect(result.name).toBe('Test');
      expect(result.template).toBe('/dev {story_num}');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    // TC-QT-14
    it('creates .bmad-studio directory if missing', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await queueTemplateService.saveTemplate('/project', 'Test', '/dev {story_num}');
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.bmad-studio'),
        { recursive: true },
      );
    });

    it('normalizes CRLF line endings to LF when saving', async () => {
      mockReadFile.mockResolvedValue('[]');
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const result = await queueTemplateService.saveTemplate('/project', 'Test', '/dev {story_num}\r\n@pause review');
      expect(result.template).toBe('/dev {story_num}\n@pause review');
    });
  });

  describe('updateTemplate', () => {
    // TC-QT-15
    it('updates existing template by ID', async () => {
      const templates = [
        { id: 'abc', name: 'Old', template: 'old', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(templates));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const result = await queueTemplateService.updateTemplate('/project', 'abc', 'New', 'new template');
      expect(result.name).toBe('New');
      expect(result.template).toBe('new template');
      expect(result.id).toBe('abc');
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    // TC-QT-16
    it('throws for non-existent ID', async () => {
      mockReadFile.mockResolvedValue('[]');
      await expect(
        queueTemplateService.updateTemplate('/project', 'nonexistent', 'Name', 'template'),
      ).rejects.toThrow('Template not found: nonexistent');
    });

    it('normalizes CRLF line endings to LF when updating', async () => {
      const templates = [
        { id: 'abc', name: 'Old', template: 'old', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(templates));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const result = await queueTemplateService.updateTemplate('/project', 'abc', 'New', 'line1\r\nline2');
      expect(result.template).toBe('line1\nline2');
    });
  });

  describe('deleteTemplate', () => {
    // TC-QT-17
    it('removes template by ID', async () => {
      const templates = [
        { id: 'abc', name: 'Test', template: 'test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(templates));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await queueTemplateService.deleteTemplate('/project', 'abc');
      const writeCall = mockWriteFile.mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written).toEqual([]);
    });

    // TC-QT-18
    it('throws for non-existent ID', async () => {
      mockReadFile.mockResolvedValue('[]');
      await expect(
        queueTemplateService.deleteTemplate('/project', 'nonexistent'),
      ).rejects.toThrow('Template not found: nonexistent');
    });
  });
});
