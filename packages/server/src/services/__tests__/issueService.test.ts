import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { BoardItem } from '@bmad-studio/shared';

// Mock bmadStatusService
vi.mock('../bmadStatusService.js', () => ({
  bmadStatusService: {
    scanProject: vi.fn(),
  },
}));

import { issueService } from '../issueService.js';
import { bmadStatusService } from '../bmadStatusService.js';

const mockScanProject = vi.mocked(bmadStatusService.scanProject);

const PROJECT_ROOT = path.join(os.tmpdir(), `issue-service-test-${Date.now()}`);
const ISSUES_DIR = path.join(PROJECT_ROOT, 'docs', 'issues');

beforeEach(async () => {
  vi.restoreAllMocks();
  // Clean and recreate test directory
  try {
    await fs.rm(PROJECT_ROOT, { recursive: true });
  } catch {
    // ignore
  }
  await fs.mkdir(ISSUES_DIR, { recursive: true });
  // Create a minimal core-config.yaml (no issuesLocation = default docs/issues)
  const bmadDir = path.join(PROJECT_ROOT, '.bmad-core');
  await fs.mkdir(bmadDir, { recursive: true });
  await fs.writeFile(
    path.join(bmadDir, 'core-config.yaml'),
    'prd:\n  prdFile: docs/prd.md\n'
  );
});

describe('IssueService', () => {
  describe('resolveIssuesDir', () => {
    it('should use default docs/issues when issuesLocation not set', async () => {
      const dir = await issueService.resolveIssuesDir(PROJECT_ROOT);
      expect(dir).toBe(path.join(PROJECT_ROOT, 'docs', 'issues'));
    });

    it('should use custom issuesLocation from config', async () => {
      await fs.writeFile(
        path.join(PROJECT_ROOT, '.bmad-core', 'core-config.yaml'),
        'issuesLocation: custom/issues\n'
      );
      const dir = await issueService.resolveIssuesDir(PROJECT_ROOT);
      expect(dir).toBe(path.join(PROJECT_ROOT, 'custom', 'issues'));
    });

    it('should fallback to default when config is missing', async () => {
      await fs.rm(path.join(PROJECT_ROOT, '.bmad-core'), { recursive: true });
      const dir = await issueService.resolveIssuesDir(PROJECT_ROOT);
      expect(dir).toBe(path.join(PROJECT_ROOT, 'docs', 'issues'));
    });
  });

  describe('createIssue', () => {
    it('should create an issue file and return BoardItem', async () => {
      const item = await issueService.createIssue(PROJECT_ROOT, {
        title: 'Login bug fix',
        description: 'Cannot log in',
        severity: 'high',
        issueType: 'bug',
      });

      expect(item.type).toBe('issue');
      expect(item.title).toBe('Login bug fix');
      expect(item.status).toBe('Open');
      expect(item.description).toBe('Cannot log in');
      expect(item.severity).toBe('high');
      expect(item.issueType).toBe('bug');
      expect(item.id).toMatch(/^\d+-[a-f0-9]{6}-login-bug-fix$/);
    });

    it('should use "issue" slug for non-ASCII titles', async () => {
      const item = await issueService.createIssue(PROJECT_ROOT, {
        title: '로그인 버그',
      });

      expect(item.id).toMatch(/^\d+-[a-f0-9]{6}-issue$/);
      expect(item.title).toBe('로그인 버그');
    });

    it('should create issues directory if it does not exist', async () => {
      await fs.rm(ISSUES_DIR, { recursive: true });
      const item = await issueService.createIssue(PROJECT_ROOT, { title: 'New issue' });
      expect(item.title).toBe('New issue');

      const files = await fs.readdir(ISSUES_DIR);
      expect(files).toHaveLength(1);
    });
  });

  describe('listIssues', () => {
    it('should return empty array when no issues exist', async () => {
      const items = await issueService.listIssues(PROJECT_ROOT);
      expect(items).toEqual([]);
    });

    it('should return empty array when issues dir does not exist', async () => {
      await fs.rm(ISSUES_DIR, { recursive: true });
      const items = await issueService.listIssues(PROJECT_ROOT);
      expect(items).toEqual([]);
    });

    it('should scan multiple issues', async () => {
      await issueService.createIssue(PROJECT_ROOT, { title: 'Bug 1', severity: 'low' });
      await issueService.createIssue(PROJECT_ROOT, { title: 'Bug 2', severity: 'high' });

      const items = await issueService.listIssues(PROJECT_ROOT);
      expect(items).toHaveLength(2);
      expect(items.every((i: BoardItem) => i.type === 'issue')).toBe(true);
    });
  });

  describe('getIssue', () => {
    it('should return a single issue by ID', async () => {
      const created = await issueService.createIssue(PROJECT_ROOT, { title: 'Test issue' });
      const item = await issueService.getIssue(PROJECT_ROOT, created.id);
      expect(item).not.toBeNull();
      expect(item!.title).toBe('Test issue');
    });

    it('should return null for non-existent issue', async () => {
      const item = await issueService.getIssue(PROJECT_ROOT, 'non-existent');
      expect(item).toBeNull();
    });

    it('should return null for path traversal attempt', async () => {
      const item = await issueService.getIssue(PROJECT_ROOT, '../etc/passwd');
      expect(item).toBeNull();
    });
  });

  describe('updateIssue', () => {
    it('should update issue status and content', async () => {
      const created = await issueService.createIssue(PROJECT_ROOT, { title: 'Original' });
      const updated = await issueService.updateIssue(PROJECT_ROOT, created.id, {
        title: 'Updated',
        status: 'InProgress',
        severity: 'critical',
      });

      expect(updated.title).toBe('Updated');
      expect(updated.status).toBe('InProgress');
      expect(updated.severity).toBe('critical');
    });

    it('should throw ISSUE_NOT_FOUND for non-existent issue', async () => {
      await expect(
        issueService.updateIssue(PROJECT_ROOT, 'non-existent', { title: 'X' })
      ).rejects.toMatchObject({ code: 'ISSUE_NOT_FOUND' });
    });

    it('should throw INVALID_ISSUE_ID for path traversal', async () => {
      await expect(
        issueService.updateIssue(PROJECT_ROOT, '../hack', { title: 'X' })
      ).rejects.toMatchObject({ code: 'INVALID_ISSUE_ID' });
    });

    it('should preserve existing fields when not provided', async () => {
      const created = await issueService.createIssue(PROJECT_ROOT, {
        title: 'Keep me',
        description: 'Original desc',
        severity: 'high',
      });
      const updated = await issueService.updateIssue(PROJECT_ROOT, created.id, {
        status: 'Done',
      });

      expect(updated.title).toBe('Keep me');
      expect(updated.description).toBe('Original desc');
      expect(updated.severity).toBe('high');
      expect(updated.status).toBe('Done');
    });
  });

  describe('deleteIssue', () => {
    it('should delete issue file', async () => {
      const created = await issueService.createIssue(PROJECT_ROOT, { title: 'To delete' });
      await issueService.deleteIssue(PROJECT_ROOT, created.id);

      const item = await issueService.getIssue(PROJECT_ROOT, created.id);
      expect(item).toBeNull();
    });

    it('should throw ISSUE_NOT_FOUND for non-existent issue', async () => {
      await expect(
        issueService.deleteIssue(PROJECT_ROOT, 'non-existent')
      ).rejects.toMatchObject({ code: 'ISSUE_NOT_FOUND' });
    });

    it('should throw INVALID_ISSUE_ID for path traversal', async () => {
      await expect(
        issueService.deleteIssue(PROJECT_ROOT, '..\\hack')
      ).rejects.toMatchObject({ code: 'INVALID_ISSUE_ID' });
    });
  });

  describe('issue markdown parsing', () => {
    it('should correctly parse all fields from markdown', async () => {
      const markdown = `# Test Bug

## Status
InProgress

## Description
Something is broken

## Severity
critical

## Type
bug

## Linked Story
21.1

## Linked Epic
21
`;
      await fs.writeFile(path.join(ISSUES_DIR, 'test-issue.md'), markdown);
      const item = await issueService.getIssue(PROJECT_ROOT, 'test-issue');

      expect(item).not.toBeNull();
      expect(item!.title).toBe('Test Bug');
      expect(item!.status).toBe('InProgress');
      expect(item!.description).toBe('Something is broken');
      expect(item!.severity).toBe('critical');
      expect(item!.issueType).toBe('bug');
      expect(item!.linkedStory).toBe('21.1');
      expect(item!.linkedEpic).toBe('21');
    });

    it('should handle empty optional fields', async () => {
      const markdown = `# Minimal Issue

## Status
Open

## Description


## Severity


## Type


## Linked Story


## Linked Epic

`;
      await fs.writeFile(path.join(ISSUES_DIR, 'minimal.md'), markdown);
      const item = await issueService.getIssue(PROJECT_ROOT, 'minimal');

      expect(item!.title).toBe('Minimal Issue');
      expect(item!.status).toBe('Open');
      expect(item!.description).toBeUndefined();
      expect(item!.severity).toBeUndefined();
      expect(item!.issueType).toBeUndefined();
    });
  });

  describe('getBoard', () => {
    it('should combine issues with epics and stories', async () => {
      await issueService.createIssue(PROJECT_ROOT, { title: 'Board issue', severity: 'low' });

      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 1,
            name: 'Core Setup',
            stories: [
              { file: '1.1.story.md', status: 'Done', title: 'Init project' },
              { file: '1.2.story.md', status: 'In Progress', title: 'Add auth' },
            ],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);

      const issues = result.items.filter((i: BoardItem) => i.type === 'issue');
      const stories = result.items.filter((i: BoardItem) => i.type === 'story');
      const epics = result.items.filter((i: BoardItem) => i.type === 'epic');

      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Board issue');

      expect(stories).toHaveLength(2);
      expect(stories[0].id).toBe('story-1.1');
      expect(stories[0].status).toBe('Done');
      expect(stories[1].id).toBe('story-1.2');
      expect(stories[1].status).toBe('InProgress');

      expect(epics).toHaveLength(1);
      expect(epics[0].id).toBe('epic-1');
      expect(epics[0].status).toBe('InProgress');
      expect(epics[0].storyProgress).toEqual({ total: 2, done: 1 });
    });

    it('should compute epic status as Open when all stories are Draft', async () => {
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 2,
            name: 'New Epic',
            stories: [
              { file: '2.1.story.md', status: 'Draft' },
              { file: '2.2.story.md', status: 'Draft' },
            ],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);
      const epic = result.items.find((i: BoardItem) => i.id === 'epic-2');
      expect(epic!.status).toBe('Open');
    });

    it('should compute epic status as Done when all stories are Done', async () => {
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 3,
            name: 'Done Epic',
            stories: [
              { file: '3.1.story.md', status: 'Done' },
              { file: '3.2.story.md', status: 'Done' },
            ],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);
      const epic = result.items.find((i: BoardItem) => i.id === 'epic-3');
      expect(epic!.status).toBe('Done');
      expect(epic!.storyProgress).toEqual({ total: 2, done: 2 });
    });

    it('should compute epic status as Open when no stories', async () => {
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 4,
            name: 'Empty Epic',
            stories: [],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);
      const epic = result.items.find((i: BoardItem) => i.id === 'epic-4');
      expect(epic!.status).toBe('Open');
      expect(epic!.storyProgress).toEqual({ total: 0, done: 0 });
    });

    it('should preserve Blocked status for stories', async () => {
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 5,
            name: 'Blocked Epic',
            stories: [
              { file: '5.1.story.md', status: 'Blocked' },
              { file: '5.2.story.md', status: 'Draft' },
            ],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);
      const epic = result.items.find((i: BoardItem) => i.id === 'epic-5');
      expect(epic!.status).toBe('InProgress');

      const blockedStory = result.items.find((i: BoardItem) => i.id === 'story-5.1');
      expect(blockedStory!.status).toBe('Blocked');
    });

    it('should use file name as fallback title for stories', async () => {
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 6,
            name: 'Epic Six',
            stories: [
              { file: '6.1.story.md', status: 'Draft' },
            ],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);
      const story = result.items.find((i: BoardItem) => i.id === 'story-6.1');
      expect(story!.title).toBe('6.1.story.md');
    });

    it('should map story status correctly', async () => {
      mockScanProject.mockResolvedValueOnce({
        config: {} as never,
        documents: {} as never,
        auxiliaryDocuments: [],
        epics: [
          {
            number: 7,
            name: 'Status Test',
            stories: [
              { file: '7.1.story.md', status: 'Approved', title: 'Approved story' },
              { file: '7.2.story.md', status: 'Review', title: 'Review story' },
              { file: '7.3.story.md', status: 'Unknown Status', title: 'Unknown story' },
            ],
          },
        ],
      });

      const result = await issueService.getBoard(PROJECT_ROOT);
      const stories = result.items.filter((i: BoardItem) => i.type === 'story');

      expect(stories.find((s: BoardItem) => s.id === 'story-7.1')!.status).toBe('Approved');
      expect(stories.find((s: BoardItem) => s.id === 'story-7.2')!.status).toBe('Review');
      expect(stories.find((s: BoardItem) => s.id === 'story-7.3')!.status).toBe('Open');
    });
  });
});
