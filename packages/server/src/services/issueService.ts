import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import yaml from 'js-yaml';
import type {
  BoardItem,
  BoardResponse,
  CreateIssueRequest,
  UpdateIssueRequest,
  IssueAttachment,
} from '@hammoc/shared';
import { bmadStatusService } from './bmadStatusService.js';

const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_ISSUE_TYPES = new Set(['bug', 'improvement']);
const VALID_STATUSES = new Set(['Open', 'In Progress', 'InProgress', 'Ready for Review', 'Ready for Done', 'Done', 'Closed', 'Promoted']);

const ATTACHMENT_ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ATTACHMENT_MAX_COUNT = 10;
const ATTACHMENTS_DIR_NAME = 'attachments';
const REVIEWS_DIR_NAME = 'reviews';

const ISSUE_ID_PREFIX = 'ISSUE-';
const ISSUE_ID_RE = /^ISSUE-(\d+)$/;

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
 * Extract attachments from the ## Attachments section.
 * Format: - [originalName](attachments/{issueId}/filename) <!-- size:1234 type:image/png -->
 */
function extractAttachments(content: string): IssueAttachment[] {
  const section = extractSection(content, 'Attachments');
  if (!section) return [];

  const attachments: IssueAttachment[] = [];
  const lineRegex = /^- \[((?:[^\]\\]|\\.)+)\]\([^)]+\/([^/)]+)\)\s*<!--\s*size:(\d+)\s+type:(\S+)\s*-->/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(section)) !== null) {
    // Unescape markdown link text
    const originalName = match[1].replace(/\\([[\\])/g, '$1');
    attachments.push({
      originalName,
      filename: match[2],
      size: parseInt(match[3], 10),
      mimeType: match[4],
    });
  }
  return attachments;
}

/**
 * Scan the reviews/ directory under issuesDir for issue review YAML files.
 * Groups by issueId, keeps newest by mtime. Returns a map of issueId → gate token.
 */
async function scanIssueReviews(issuesDir: string): Promise<Map<string, string>> {
  const reviewsDir = path.join(issuesDir, REVIEWS_DIR_NAME);
  const gateResults = new Map<string, string>();

  let files: string[];
  try {
    files = await fs.readdir(reviewsDir);
  } catch {
    return gateResults; // reviews dir doesn't exist yet
  }

  // Group by issueId, keep newest by mtime
  const latestPerIssue = new Map<string, { file: string; mtime: number }>();
  for (const f of files) {
    const match = f.match(/^(.+)-review\.yml$/);
    if (!match) continue;
    const issueId = match[1];
    try {
      const stat = await fs.stat(path.join(reviewsDir, f));
      const existing = latestPerIssue.get(issueId);
      if (!existing || stat.mtimeMs > existing.mtime) {
        latestPerIssue.set(issueId, { file: f, mtime: stat.mtimeMs });
      }
    } catch { /* skip unreadable files */ }
  }

  // Parse each latest review file
  for (const [issueId, { file }] of latestPerIssue) {
    try {
      const content = await fs.readFile(path.join(reviewsDir, file), 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown> | null;
      const gate = (typeof parsed?.gate === 'string') ? parsed.gate.trim().toUpperCase() : '';
      if (gate) gateResults.set(issueId, gate);
    } catch { /* skip unparseable files */ }
  }

  return gateResults;
}

/**
 * Parse an issue markdown file into a BoardItem.
 */
function parseIssueMarkdown(content: string, issueId: string): BoardItem {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : issueId;

  const rawStatus = extractSection(content, 'Status') || 'Open';
  // Normalize: legacy 'Review' → 'Ready for Review', issues 'Ready for Review' → 'Ready for Done'
  let status = rawStatus === 'Review' ? 'Ready for Review' : rawStatus;
  if (status === 'Ready for Review') status = 'Ready for Done';
  const description = extractSection(content, 'Description');
  const severity = extractSection(content, 'Severity') as BoardItem['severity'];
  const issueType = extractSection(content, 'Type') as BoardItem['issueType'];
  const linkedStory = extractSection(content, 'Linked Story');
  const linkedEpic = extractSection(content, 'Linked Epic');
  const attachments = extractAttachments(content);

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
    ...(attachments.length > 0 && { attachments }),
  };
}

/**
 * Sanitize a string to prevent markdown header injection.
 * Strips newlines and leading '#' characters.
 */
function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/^#+\s*/, '').trim();
}

function generateIssueMarkdown(data: {
  title: string;
  status?: string;
  description?: string;
  severity?: string;
  issueType?: string;
  linkedStory?: string;
  linkedEpic?: string;
}): string {
  const safeTitle = sanitizeLine(data.title);
  const safeSeverity = data.severity && VALID_SEVERITIES.has(data.severity) ? data.severity : '';
  const safeType = data.issueType && VALID_ISSUE_TYPES.has(data.issueType) ? data.issueType : '';
  const safeStatus = data.status && VALID_STATUSES.has(data.status) ? data.status : 'Open';
  return `# ${safeTitle}

## Status

${safeStatus}

## Description

${data.description || ''}

## Severity

${safeSeverity}

## Type

${safeType}

## Linked Story

${data.linkedStory || ''}

## Linked Epic

${data.linkedEpic || ''}
`;
}

/**
 * Per-issue write lock to serialize attachment add/remove operations.
 * Prevents concurrent writes from corrupting the ## Attachments section.
 */
const issueLocks = new Map<string, Promise<unknown>>();

function withIssueLock<T>(issueId: string, fn: () => Promise<T>): Promise<T> {
  const prev = issueLocks.get(issueId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // always run fn after previous settles
  issueLocks.set(issueId, next);
  // Clean up after completion to avoid memory leak
  next.then(() => {
    if (issueLocks.get(issueId) === next) {
      issueLocks.delete(issueId);
    }
  });
  return next;
}

/**
 * Determine the canonical column-level status for epic aggregation.
 * Maps common raw status strings to a simplified set for epic status calculation.
 */
function toEpicAggregationStatus(rawStatus: string): 'done' | 'open' | 'other' {
  const lower = rawStatus.toLowerCase().trim();
  if (lower === 'done' || lower === 'complete' || lower === 'completed') return 'done';
  if (lower === 'draft' || lower === 'open' || lower === 'new' || lower === 'pending' || lower === 'approved') return 'open';
  return 'other';
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

    // Enforce boundary: resolved path must be within projectPath
    const resolved = path.resolve(projectPath, issuesLocation);
    const projectRoot = path.resolve(projectPath);
    if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
      return path.join(projectPath, 'docs', 'issues');
    }

    return resolved;
  }

  /**
   * Ensure the issues directory exists.
   */
  private async ensureIssuesDir(issuesDir: string): Promise<void> {
    await fs.mkdir(issuesDir, { recursive: true });
  }

  /**
   * Scan existing issue files and return the next sequential number.
   */
  private async nextIssueNumber(issuesDir: string): Promise<number> {
    let files: string[];
    try {
      files = await fs.readdir(issuesDir);
    } catch {
      return 1;
    }
    let max = 0;
    for (const f of files) {
      const match = f.replace(/\.md$/, '').match(ISSUE_ID_RE);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max + 1;
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

    const results = await Promise.all(
      mdFiles.map(async (file) => {
        try {
          const filePath = path.join(issuesDir, file);
          const [content, stat] = await Promise.all([
            fs.readFile(filePath, 'utf-8'),
            fs.stat(filePath),
          ]);
          const issueId = file.replace(/\.md$/, '');
          const item = parseIssueMarkdown(content, issueId);
          if (item) {
            item.updatedAt = stat.mtimeMs;
          }
          return item;
        } catch {
          // Skip files that can't be read (deleted, permissions, etc.)
          return null;
        }
      })
    );

    return results.filter((item): item is BoardItem => item !== null);
  }

  /**
   * Count legacy (non-ISSUE-N) issue files.
   */
  async countLegacyIssues(projectPath: string): Promise<number> {
    const issuesDir = await this.resolveIssuesDir(projectPath);
    let files: string[];
    try {
      files = await fs.readdir(issuesDir);
    } catch {
      return 0;
    }
    return files.filter((f) => f.endsWith('.md') && !ISSUE_ID_RE.test(f.replace(/\.md$/, ''))).length;
  }

  /**
   * Migrate all legacy issue files to ISSUE-N format.
   * Renames files and their attachment directories. Returns count of migrated files.
   */
  async migrateIssues(projectPath: string): Promise<number> {
    const issuesDir = await this.resolveIssuesDir(projectPath);
    let files: string[];
    try {
      files = await fs.readdir(issuesDir);
    } catch {
      return 0;
    }

    const legacyFiles = files
      .filter((f) => f.endsWith('.md') && !ISSUE_ID_RE.test(f.replace(/\.md$/, '')))
      .sort(); // deterministic order

    if (legacyFiles.length === 0) return 0;

    let nextNum = await this.nextIssueNumber(issuesDir);
    let migrated = 0;

    for (const file of legacyFiles) {
      const oldId = file.replace(/\.md$/, '');
      const newId = `${ISSUE_ID_PREFIX}${nextNum}`;
      const oldPath = path.join(issuesDir, file);
      const newPath = path.join(issuesDir, `${newId}.md`);

      await fs.rename(oldPath, newPath);

      // Rename attachment directory if it exists
      const oldAttachDir = path.join(issuesDir, ATTACHMENTS_DIR_NAME, oldId);
      const newAttachDir = path.join(issuesDir, ATTACHMENTS_DIR_NAME, newId);
      try {
        await fs.access(oldAttachDir);
        await fs.rename(oldAttachDir, newAttachDir);
      } catch {
        // No attachments directory — skip
      }

      // Rename review file if it exists
      const oldReview = path.join(issuesDir, REVIEWS_DIR_NAME, `${oldId}-review.yml`);
      const newReview = path.join(issuesDir, REVIEWS_DIR_NAME, `${newId}-review.yml`);
      try {
        await fs.access(oldReview);
        await fs.rename(oldReview, newReview);
      } catch {
        // No review file — skip
      }

      nextNum++;
      migrated++;
    }

    return migrated;
  }

  /**
   * Create a new issue file.
   */
  async createIssue(projectPath: string, data: CreateIssueRequest): Promise<BoardItem> {
    const issuesDir = await this.resolveIssuesDir(projectPath);
    await this.ensureIssuesDir(issuesDir);

    const nextNum = await this.nextIssueNumber(issuesDir);
    const issueId = `${ISSUE_ID_PREFIX}${nextNum}`;
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

    let updated = generateIssueMarkdown({
      title: data.title ?? existing.title,
      status: data.status ?? existing.status,
      description: data.description ?? existing.description ?? '',
      severity: data.severity ?? existing.severity ?? '',
      issueType: data.issueType ?? existing.issueType ?? '',
      linkedStory: data.linkedStory ?? existing.linkedStory ?? '',
      linkedEpic: data.linkedEpic ?? existing.linkedEpic ?? '',
    });

    // Preserve existing ## Attachments section
    const existingAttachments = extractAttachments(content);
    if (existingAttachments.length > 0) {
      updated = updateAttachmentsSection(updated, existingAttachments, issueId);
    }

    // Atomic write: write to temp file then rename to prevent partial writes
    const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, updated, 'utf-8');
    await fs.rename(tmpPath, filePath);

    return parseIssueMarkdown(updated, issueId);
  }

  /**
   * Update a story's status by modifying its markdown file.
   * @param projectPath - absolute path to the project root
   * @param storyId - story ID (e.g. "story-1.1")
   * @param status - new status string
   * @throws Error with code 'STORY_NOT_FOUND' if story file doesn't exist
   */
  async updateStoryStatus(projectPath: string, storyId: string, status: string): Promise<void> {
    // Get the board to find the story's filePath
    const board = await this.getBoard(projectPath);
    const story = board.items.find((item) => item.id === storyId && item.type === 'story');
    if (!story || !story.filePath) {
      const err = new Error(`Story not found: ${storyId}`);
      (err as NodeJS.ErrnoException).code = 'STORY_NOT_FOUND';
      throw err;
    }

    const filePath = path.join(projectPath, story.filePath);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      const err = new Error(`Story file not found: ${story.filePath}`);
      (err as NodeJS.ErrnoException).code = 'STORY_NOT_FOUND';
      throw err;
    }

    // Replace status in the markdown content using the same formats extractStoryMeta recognizes
    let updated = content;
    const replacements: [RegExp, string][] = [
      [/^(## Status\s*\n\s*\n\s*).+/m, `$1${status}`],        // format 1: heading + blank + value
      [/^(## Status\s*\n\s*)([^\n#].+)/m, `$1${status}`],      // format 2: heading + value
      [/^(## Status\s*:\s*).+/m, `$1${status}`],                // format 3: heading with inline
      [/^(\*{0,2}Status\*{0,2}\s*:\s*).+/m, `$1${status}`],    // format 4 & 5: key-value
    ];

    let replaced = false;
    for (const [pattern, replacement] of replacements) {
      if (pattern.test(content)) {
        updated = content.replace(pattern, replacement);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      // No status found — insert after the first heading
      const headingMatch = content.match(/^#\s+.+$/m);
      if (headingMatch) {
        const insertPos = (headingMatch.index ?? 0) + headingMatch[0].length;
        updated = content.slice(0, insertPos) + `\n\n## Status: ${status}` + content.slice(insertPos);
      } else {
        updated = `## Status: ${status}\n\n${content}`;
      }
    }

    // Atomic write
    const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, updated, 'utf-8');
    await fs.rename(tmpPath, filePath);
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
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        const err = new Error(`Issue not found: ${issueId}`);
        (err as NodeJS.ErrnoException).code = 'ISSUE_NOT_FOUND';
        throw err;
      }
      throw error;
    }

    // Clean up attachment directory if it exists
    const attachDir = await this.resolveAttachmentsDir(issuesDir, issueId);
    try {
      await fs.rm(attachDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — don't fail the delete
    }

    // Clean up review file if it exists
    const reviewFile = path.join(issuesDir, REVIEWS_DIR_NAME, `${issueId}-review.yml`);
    try {
      await fs.unlink(reviewFile);
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Get unified board data: issues + epics + stories from bmadStatusService.
   * Raw status strings are preserved as-is — no normalization layer.
   */
  async getBoard(projectPath: string): Promise<Pick<BoardResponse, 'items'>> {
    const issuesDir = await this.resolveIssuesDir(projectPath);
    const [issues, statusResponse, reviewResults] = await Promise.all([
      this.listIssues(projectPath),
      bmadStatusService.scanProject(projectPath).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'NOT_BMAD_PROJECT') return null;
        throw err;
      }),
      scanIssueReviews(issuesDir),
    ]);

    // Compute project-relative issues path for externalRef
    const relativeIssuesDir = path.relative(projectPath, issuesDir).replace(/\\/g, '/');

    // Issues keep their raw status as-is
    const items: BoardItem[] = issues.map((issue) => {
      const gateResult = reviewResults.get(issue.id);
      return {
        ...issue,
        ...(gateResult && { gateResult }),
        externalRef: `${relativeIssuesDir}/${issue.id}.md`,
      };
    });

    if (!statusResponse) {
      return { items };
    }

    // Resolve story directory (project-relative) for filePath
    const storyLocation = statusResponse.config.devStoryLocation || 'docs/stories';

    for (const epic of statusResponse.epics) {
      // Determine epic key prefix for ID extraction
      const epicKey = epic.number;
      const isBfStandalone = epicKey === 'BS';

      // Convert stories to BoardItems — raw status preserved directly
      const storyItems: BoardItem[] = await Promise.all(
        epic.stories.map(async (story) => {
          // Extract story ID from filename based on prefix type
          let storyId: string;
          let epicNumber: number | string | undefined;

          const bfStandaloneMatch = story.file.match(/^BS-(\d+)/);
          const regularMatch = story.file.match(/^(\d+\.\d+)/);

          if (bfStandaloneMatch) {
            storyId = `BS-${bfStandaloneMatch[1]}`;
            epicNumber = 'BS';
          } else if (regularMatch) {
            storyId = regularMatch[1];
            const epicMatch = story.file.match(/^(\d+)\./);
            epicNumber = epicMatch ? parseInt(epicMatch[1], 10) : undefined;
          } else {
            storyId = story.file.replace(/\.md$/, '');
          }

          let updatedAt: number | undefined;
          try {
            const stat = await fs.stat(path.join(projectPath, storyLocation, story.file));
            updatedAt = stat.mtimeMs;
          } catch { /* file may not exist */ }

          return {
            id: `story-${storyId}`,
            type: 'story' as const,
            title: story.title ?? story.file,
            status: story.status === 'Review' ? 'Ready for Review' : story.status,
            ...(epicNumber !== undefined && { epicNumber }),
            ...(story.gateResult && { gateResult: story.gateResult }),
            filePath: `${storyLocation}/${story.file}`,
            ...(updatedAt !== undefined && { updatedAt }),
          };
        })
      );

      items.push(...storyItems);

      // Skip epic card for standalone brownfield stories (BS) — they have no parent epic
      if (isBfStandalone) continue;

      // Calculate epic status from story statuses
      const aggregated = epic.stories.map((s) => toEpicAggregationStatus(s.status));
      let epicStatus: string;
      if (aggregated.length === 0) {
        epicStatus = 'Open';
      } else {
        const allStoriesCreated = !epic.plannedStories || aggregated.length >= epic.plannedStories;
        const allDone = aggregated.every((s) => s === 'done');
        const allOpen = aggregated.every((s) => s === 'open');

        if (allDone && allStoriesCreated) {
          epicStatus = 'Done';
        } else if (allOpen) {
          epicStatus = 'Open';
        } else {
          epicStatus = 'In Progress';
        }
      }

      // Calculate story progress: use planned count from PRD as denominator when available
      const planned = epic.plannedStories ?? aggregated.length;
      const total = Math.max(planned, aggregated.length);
      const done = aggregated.filter((s) => s === 'done').length;

      // Epic updatedAt: use the most recent story mtime
      const epicUpdatedAt = storyItems.reduce((max, s) =>
        s.updatedAt && s.updatedAt > max ? s.updatedAt : max, 0) || undefined;

      items.push({
        id: `epic-${epic.number}`,
        type: 'epic',
        title: epic.name,
        status: epicStatus,
        epicNumber: epic.number,
        storyProgress: { total, done },
        ...(epic.filePath && { filePath: epic.filePath }),
        ...(epicUpdatedAt && { updatedAt: epicUpdatedAt }),
      });
    }

    return { items };
  }

  /**
   * Get the next available number for backlog stories (BS) or epics.
   */
  async getNextNum(projectPath: string, type: 'BS' | 'epic'): Promise<number> {
    if (type === 'BS') {
      let storyLocation = 'docs/stories';
      try {
        const configPath = path.join(projectPath, '.bmad-core', 'core-config.yaml');
        const content = await fs.readFile(configPath, 'utf-8');
        const parsed = yaml.load(content) as Record<string, unknown>;
        if (parsed && typeof parsed.devStoryLocation === 'string') {
          storyLocation = parsed.devStoryLocation;
        }
      } catch { /* use default */ }

      const storiesDir = path.join(projectPath, storyLocation);
      const regex = /^BS-(\d+)\./;
      const nums: number[] = [];
      try {
        const files = await fs.readdir(storiesDir);
        for (const file of files) {
          const match = file.match(regex);
          if (match) nums.push(parseInt(match[1], 10));
        }
      } catch { /* directory not found */ }
      return nums.length > 0 ? Math.max(...nums) + 1 : 1;
    }

    // epic: scan docs/prd/ for epic-{number}-*.md files
    const prdDir = path.join(projectPath, 'docs', 'prd');
    const regex = /^epic-(\d+)-/;
    const nums: number[] = [];
    try {
      const files = await fs.readdir(prdDir);
      for (const file of files) {
        const match = file.match(regex);
        if (match) nums.push(parseInt(match[1], 10));
      }
    } catch { /* directory not found */ }
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  }

  /**
   * Resolve the attachments directory for an issue.
   */
  private async resolveAttachmentsDir(issuesDir: string, issueId: string): Promise<string> {
    return path.join(issuesDir, ATTACHMENTS_DIR_NAME, issueId);
  }

  /**
   * Add an attachment to an issue.
   * Saves the file to disk and updates the ## Attachments section in the markdown.
   */
  async addAttachment(
    projectPath: string,
    issueId: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number }
  ): Promise<IssueAttachment> {
    return withIssueLock(issueId, () => this._addAttachment(projectPath, issueId, file));
  }

  private async _addAttachment(
    projectPath: string,
    issueId: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number }
  ): Promise<IssueAttachment> {
    if (!validateIssueId(issueId)) {
      const err = new Error('Invalid issue ID');
      (err as NodeJS.ErrnoException).code = 'INVALID_ISSUE_ID';
      throw err;
    }

    if (!ATTACHMENT_ACCEPTED_TYPES.has(file.mimetype)) {
      const err = new Error(`Unsupported file type: ${file.mimetype}`);
      (err as NodeJS.ErrnoException).code = 'INVALID_FILE_TYPE';
      throw err;
    }

    if (file.size > ATTACHMENT_MAX_SIZE) {
      const err = new Error('File too large');
      (err as NodeJS.ErrnoException).code = 'FILE_TOO_LARGE';
      throw err;
    }

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const issueFilePath = path.join(issuesDir, `${issueId}.md`);

    // Verify issue exists
    let content: string;
    try {
      content = await fs.readFile(issueFilePath, 'utf-8');
    } catch {
      const err = new Error(`Issue not found: ${issueId}`);
      (err as NodeJS.ErrnoException).code = 'ISSUE_NOT_FOUND';
      throw err;
    }

    // Check attachment count
    const existing = extractAttachments(content);
    if (existing.length >= ATTACHMENT_MAX_COUNT) {
      const err = new Error('Maximum attachment count reached');
      (err as NodeJS.ErrnoException).code = 'MAX_ATTACHMENTS';
      throw err;
    }

    // Generate unique filename
    const ext = path.extname(file.originalname) || mimeToExt(file.mimetype);
    const baseName = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const filename = `${baseName}-${uniqueSuffix}${ext}`;

    // Save file to disk
    const attachDir = await this.resolveAttachmentsDir(issuesDir, issueId);
    await fs.mkdir(attachDir, { recursive: true });
    await fs.writeFile(path.join(attachDir, filename), file.buffer);

    const attachment: IssueAttachment = {
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };

    // Update markdown
    const updatedAttachments = [...existing, attachment];
    const updatedContent = updateAttachmentsSection(content, updatedAttachments, issueId);
    const tmpPath = `${issueFilePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, updatedContent, 'utf-8');
    await fs.rename(tmpPath, issueFilePath);

    return attachment;
  }

  /**
   * Remove an attachment from an issue.
   */
  async removeAttachment(projectPath: string, issueId: string, filename: string): Promise<void> {
    return withIssueLock(issueId, () => this._removeAttachment(projectPath, issueId, filename));
  }

  private async _removeAttachment(projectPath: string, issueId: string, filename: string): Promise<void> {
    if (!validateIssueId(issueId)) {
      const err = new Error('Invalid issue ID');
      (err as NodeJS.ErrnoException).code = 'INVALID_ISSUE_ID';
      throw err;
    }

    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      const err = new Error('Invalid filename');
      (err as NodeJS.ErrnoException).code = 'INVALID_FILENAME';
      throw err;
    }

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const issueFilePath = path.join(issuesDir, `${issueId}.md`);

    let content: string;
    try {
      content = await fs.readFile(issueFilePath, 'utf-8');
    } catch {
      const err = new Error(`Issue not found: ${issueId}`);
      (err as NodeJS.ErrnoException).code = 'ISSUE_NOT_FOUND';
      throw err;
    }

    // Delete file from disk
    const attachDir = await this.resolveAttachmentsDir(issuesDir, issueId);
    try {
      await fs.unlink(path.join(attachDir, filename));
    } catch {
      // File may already be deleted, continue to update markdown
    }

    // Update markdown
    const existing = extractAttachments(content);
    const updatedAttachments = existing.filter((a) => a.filename !== filename);
    const updatedContent = updateAttachmentsSection(content, updatedAttachments, issueId);
    const tmpPath = `${issueFilePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, updatedContent, 'utf-8');
    await fs.rename(tmpPath, issueFilePath);
  }

  /**
   * List attachments for an issue.
   */
  async listAttachments(projectPath: string, issueId: string): Promise<IssueAttachment[]> {
    if (!validateIssueId(issueId)) {
      return [];
    }

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const issueFilePath = path.join(issuesDir, `${issueId}.md`);

    try {
      const content = await fs.readFile(issueFilePath, 'utf-8');
      return extractAttachments(content);
    } catch {
      return [];
    }
  }

  /**
   * Resolve the absolute path to an attachment file (for serving).
   */
  async resolveAttachmentPath(projectPath: string, issueId: string, filename: string): Promise<string | null> {
    if (!validateIssueId(issueId)) return null;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return null;

    const issuesDir = await this.resolveIssuesDir(projectPath);
    const filePath = path.join(issuesDir, ATTACHMENTS_DIR_NAME, issueId, filename);

    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }
}

/**
 * Escape markdown link-breaking characters in display text.
 */
function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[[\]\\]/g, (ch) => `\\${ch}`);
}

/**
 * Update or create the ## Attachments section in issue markdown.
 */
function updateAttachmentsSection(content: string, attachments: IssueAttachment[], issueId: string): string {
  const attachmentLines = attachments.map(
    (a) => `- [${escapeMarkdownLinkText(a.originalName)}](${ATTACHMENTS_DIR_NAME}/${issueId}/${a.filename}) <!-- size:${a.size} type:${a.mimeType} -->`
  );
  const newSection = attachments.length > 0
    ? `## Attachments\n\n${attachmentLines.join('\n')}\n`
    : '';

  // Check if ## Attachments section already exists
  const headerPattern = '## Attachments';
  const headerIndex = content.indexOf(headerPattern);

  if (headerIndex !== -1) {
    // Find the end of the Attachments section (next ## or EOF)
    const afterHeader = content.indexOf('\n', headerIndex);
    if (afterHeader === -1) {
      return newSection ? content.slice(0, headerIndex) + newSection : content.slice(0, headerIndex).trimEnd() + '\n';
    }
    const nextHeader = content.indexOf('\n## ', afterHeader);
    if (nextHeader === -1) {
      return newSection ? content.slice(0, headerIndex) + newSection : content.slice(0, headerIndex).trimEnd() + '\n';
    }
    return newSection
      ? content.slice(0, headerIndex) + newSection + '\n' + content.slice(nextHeader + 1)
      : content.slice(0, headerIndex) + content.slice(nextHeader + 1);
  }

  // No existing section — append at end
  if (!newSection) return content;
  return content.trimEnd() + '\n\n' + newSection;
}

/**
 * Map MIME type to file extension.
 */
function mimeToExt(mimeType: string): string {
  switch (mimeType) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/gif': return '.gif';
    case 'image/webp': return '.webp';
    default: return '.bin';
  }
}

export const issueService = new IssueService();
