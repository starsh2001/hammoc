import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type {
  BoardItem,
  BoardItemStatus,
  BoardResponse,
  CreateIssueRequest,
  UpdateIssueRequest,
} from '@bmad-studio/shared';
import { bmadStatusService } from './bmadStatusService.js';

/**
 * Map BmadStoryStatus.status (may include spaces) to BoardItemStatus.
 */
function mapStoryStatus(status: string): BoardItemStatus {
  switch (status) {
    case 'Draft':
      return 'Draft';
    case 'Approved':
      return 'Approved';
    case 'In Progress':
      return 'InProgress';
    case 'Review':
    case 'Ready for Review':
      return 'Review';
    case 'Blocked':
      return 'InProgress';
    case 'Done':
      return 'Done';
    default:
      return 'Open';
  }
}

/**
 * Generate a URL-safe slug from a title.
 * Strips non-ASCII, converts to kebab-case. Falls back to 'issue' if empty.
 */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug || 'issue';
}

/**
 * Validate issueId to prevent path traversal attacks.
 */
function validateIssueId(issueId: string): boolean {
  if (issueId.includes('..') || issueId.includes('/') || issueId.includes('\\')) {
    return false;
  }
  return issueId.length > 0;
}

/**
 * Extract the content of a named markdown section.
 * Returns the text between `## Name` and the next `## ` header (or EOF), trimmed.
 */
function extractSection(content: string, sectionName: string): string | undefined {
  const headerPattern = `## ${sectionName}`;
  const headerIndex = content.indexOf(headerPattern);
  if (headerIndex === -1) return undefined;

  // Start after the header line
  const afterHeader = content.indexOf('\n', headerIndex);
  if (afterHeader === -1) return undefined;

  // Find the next ## header
  const nextHeader = content.indexOf('\n## ', afterHeader);
  const sectionContent = nextHeader === -1
    ? content.slice(afterHeader + 1)
    : content.slice(afterHeader + 1, nextHeader);

  const value = sectionContent.trim();
  return value || undefined;
}

/**
 * Parse an issue markdown file into a BoardItem.
 */
function parseIssueMarkdown(content: string, issueId: string): BoardItem {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : issueId;

  const status = (extractSection(content, 'Status') || 'Open') as BoardItemStatus;
  const description = extractSection(content, 'Description');
  const severity = extractSection(content, 'Severity') as BoardItem['severity'];
  const issueType = extractSection(content, 'Type') as BoardItem['issueType'];
  const linkedStory = extractSection(content, 'Linked Story');
  const linkedEpic = extractSection(content, 'Linked Epic');

  return {
    id: issueId,
    type: 'issue',
    title,
    status,
    ...(description && { description }),
    ...(severity && { severity }),
    ...(issueType && { issueType }),
    ...(linkedStory && { linkedStory }),
    ...(linkedEpic && { linkedEpic }),
  };
}

/**
 * Generate issue markdown content from data.
 */
function generateIssueMarkdown(data: {
  title: string;
  status?: string;
  description?: string;
  severity?: string;
  issueType?: string;
  linkedStory?: string;
  linkedEpic?: string;
}): string {
  return `# ${data.title}

## Status

${data.status || 'Open'}

## Description

${data.description || ''}

## Severity

${data.severity || ''}

## Type

${data.issueType || ''}

## Linked Story

${data.linkedStory || ''}

## Linked Epic

${data.linkedEpic || ''}
`;
}

class IssueService {
  /**
   * Resolve the issues directory for a project.
   * Reads issuesLocation from core-config.yaml, defaults to 'docs/issues'.
   */
  async resolveIssuesDir(projectPath: string): Promise<string> {
    let issuesLocation = 'docs/issues';

    try {
      const configPath = path.join(projectPath, '.bmad-core', 'core-config.yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;
      if (parsed && typeof parsed.issuesLocation === 'string') {
        issuesLocation = parsed.issuesLocation;
      }
    } catch {
      // Config not found or parse error — use default
    }

    return path.join(projectPath, issuesLocation);
  }

  /**
   * Ensure the issues directory exists.
   */
  private async ensureIssuesDir(issuesDir: string): Promise<void> {
    await fs.mkdir(issuesDir, { recursive: true });
  }

  /**
   * List all issues in the project.
   */
  async listIssues(projectPath: string): Promise<BoardItem[]> {
    const issuesDir = await this.resolveIssuesDir(projectPath);

    let files: string[];
    try {
      files = await fs.readdir(issuesDir);
    } catch {
      return [];
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));

    const items = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await fs.readFile(path.join(issuesDir, file), 'utf-8');
        const issueId = file.replace(/\.md$/, '');
        return parseIssueMarkdown(content, issueId);
      })
    );

    return items;
  }

  /**
   * Create a new issue file.
   */
  async createIssue(projectPath: string, data: CreateIssueRequest): Promise<BoardItem> {
    const issuesDir = await this.resolveIssuesDir(projectPath);
    await this.ensureIssuesDir(issuesDir);

    const slug = slugify(data.title);
    const timestamp = Date.now();
    const issueId = `${timestamp}-${slug}`;
    const fileName = `${issueId}.md`;

    const markdown = generateIssueMarkdown({
      title: data.title,
      description: data.description,
      severity: data.severity,
      issueType: data.issueType,
    });

    await fs.writeFile(path.join(issuesDir, fileName), markdown, 'utf-8');

    return parseIssueMarkdown(markdown, issueId);
  }

  /**
   * Get a single issue by ID.
   */
  async getIssue(projectPath: string, issueId: string): Promise<BoardItem | null> {
    if (!validateIssueId(issueId)) {
      return null;
    }

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const filePath = path.join(issuesDir, `${issueId}.md`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return parseIssueMarkdown(content, issueId);
    } catch {
      return null;
    }
  }

  /**
   * Update an existing issue.
   * @throws Error with code 'ISSUE_NOT_FOUND' if issue doesn't exist
   * @throws Error with code 'INVALID_ISSUE_ID' if issueId contains path traversal
   */
  async updateIssue(projectPath: string, issueId: string, data: UpdateIssueRequest): Promise<BoardItem> {
    if (!validateIssueId(issueId)) {
      const err = new Error('Invalid issue ID');
      (err as NodeJS.ErrnoException).code = 'INVALID_ISSUE_ID';
      throw err;
    }

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const filePath = path.join(issuesDir, `${issueId}.md`);

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      const err = new Error(`Issue not found: ${issueId}`);
      (err as NodeJS.ErrnoException).code = 'ISSUE_NOT_FOUND';
      throw err;
    }

    const existing = parseIssueMarkdown(content, issueId);

    const updated = generateIssueMarkdown({
      title: data.title ?? existing.title,
      status: data.status ?? existing.status,
      description: data.description ?? existing.description ?? '',
      severity: data.severity ?? existing.severity ?? '',
      issueType: data.issueType ?? existing.issueType ?? '',
      linkedStory: data.linkedStory ?? existing.linkedStory ?? '',
      linkedEpic: data.linkedEpic ?? existing.linkedEpic ?? '',
    });

    await fs.writeFile(filePath, updated, 'utf-8');

    return parseIssueMarkdown(updated, issueId);
  }

  /**
   * Delete an issue.
   * @throws Error with code 'ISSUE_NOT_FOUND' if issue doesn't exist
   * @throws Error with code 'INVALID_ISSUE_ID' if issueId contains path traversal
   */
  async deleteIssue(projectPath: string, issueId: string): Promise<void> {
    if (!validateIssueId(issueId)) {
      const err = new Error('Invalid issue ID');
      (err as NodeJS.ErrnoException).code = 'INVALID_ISSUE_ID';
      throw err;
    }

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const filePath = path.join(issuesDir, `${issueId}.md`);

    try {
      await fs.access(filePath);
    } catch {
      const err = new Error(`Issue not found: ${issueId}`);
      (err as NodeJS.ErrnoException).code = 'ISSUE_NOT_FOUND';
      throw err;
    }

    await fs.unlink(filePath);
  }

  /**
   * Get unified board data: issues + epics + stories from bmadStatusService.
   */
  async getBoard(projectPath: string): Promise<BoardResponse> {
    const [issues, statusResponse] = await Promise.all([
      this.listIssues(projectPath),
      bmadStatusService.scanProject(projectPath),
    ]);

    const items: BoardItem[] = [...issues];

    for (const epic of statusResponse.epics) {
      // Convert stories to BoardItems
      const storyItems: BoardItem[] = epic.stories.map((story) => {
        const fileMatch = story.file.match(/^(\d+\.\d+)/);
        const storyId = fileMatch ? fileMatch[1] : story.file.replace(/\.md$/, '');
        const epicMatch = story.file.match(/^(\d+)\./);
        const epicNumber = epicMatch ? parseInt(epicMatch[1], 10) : undefined;

        return {
          id: `story-${storyId}`,
          type: 'story' as const,
          title: story.title ?? story.file,
          status: mapStoryStatus(story.status),
          ...(epicNumber !== undefined && { epicNumber }),
        };
      });

      items.push(...storyItems);

      // Calculate epic status from stories
      let epicStatus: BoardItemStatus;
      if (epic.stories.length === 0) {
        epicStatus = 'Open';
      } else {
        const allDone = epic.stories.every((s) => s.status === 'Done');
        const allDraftOrEmpty = epic.stories.every(
          (s) => s.status === 'Draft' || !s.status
        );

        if (allDone) {
          epicStatus = 'Done';
        } else if (allDraftOrEmpty) {
          epicStatus = 'Open';
        } else {
          epicStatus = 'InProgress';
        }
      }

      // Calculate story progress
      const total = epic.stories.length;
      const done = epic.stories.filter((s) => s.status === 'Done').length;

      items.push({
        id: `epic-${epic.number}`,
        type: 'epic',
        title: epic.name,
        status: epicStatus,
        epicNumber: epic.number,
        storyProgress: { total, done },
      });
    }

    return { items };
  }
}

export const issueService = new IssueService();
