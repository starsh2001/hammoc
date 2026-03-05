import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import yaml from 'js-yaml';
import type {
  BoardItem,
  BoardItemStatus,
  BoardResponse,
  CreateIssueRequest,
  UpdateIssueRequest,
  IssueAttachment,
} from '@bmad-studio/shared';
import { bmadStatusService } from './bmadStatusService.js';

const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_ISSUE_TYPES = new Set(['bug', 'improvement']);
const VALID_STATUSES = new Set(['Open', 'InProgress', 'Done', 'Closed', 'Promoted']);

const ATTACHMENT_ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ATTACHMENT_MAX_COUNT = 10;
const ATTACHMENTS_DIR_NAME = 'attachments';

/**
 * Map BmadStoryStatus.status (may include spaces) to BoardItemStatus.
 * Uses case-insensitive matching for common variations.
 * Custom mappings (from board config) take priority over built-in ones.
 */
function mapStoryStatus(status: string, customMappings?: Record<string, BoardItemStatus>): BoardItemStatus {
  // Custom mappings take highest priority (case-insensitive)
  if (customMappings) {
    const lower = status.toLowerCase().trim();
    for (const [key, value] of Object.entries(customMappings)) {
      if (key.toLowerCase().trim() === lower) return value;
    }
  }

  // Exact matches first (most common)
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
      return 'Blocked';
    case 'Done':
    case 'Ready for Done':
      return 'Done';
    case 'Open':
    case 'Closed':
    case 'InProgress':
      return status;
    default:
      break;
  }

  // Case-insensitive fuzzy matching for non-standard values
  const lower = status.toLowerCase().trim();
  if (lower === 'complete' || lower === 'completed') return 'Done';
  if (lower === 'wip' || lower === 'in development' || lower === 'developing') return 'InProgress';
  if (lower === 'todo' || lower === 'to do' || lower === 'to-do') return 'Draft';
  if (lower === 'pending' || lower === 'new') return 'Open';
  if (lower === 'in review' || lower === 'reviewing' || lower === 'under review') return 'Review';
  if (lower === 'on hold' || lower === 'hold') return 'Blocked';
  if (lower === 'closed' || lower === 'archived' || lower === 'cancelled') return 'Closed';

  // Truly unknown status — fallback to Open
  return 'Open';
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
 * Extract attachments from the ## Attachments section.
 * Format: - [originalName](attachments/{issueId}/filename) <!-- size:1234 type:image/png -->
 */
function extractAttachments(content: string): IssueAttachment[] {
  const section = extractSection(content, 'Attachments');
  if (!section) return [];

  const attachments: IssueAttachment[] = [];
  const lineRegex = /^- \[([^\]]+)\]\([^)]+\/([^/)]+)\)\s*<!--\s*size:(\d+)\s+type:(\S+)\s*-->/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(section)) !== null) {
    attachments.push({
      originalName: match[1],
      filename: match[2],
      size: parseInt(match[3], 10),
      mimeType: match[4],
    });
  }
  return attachments;
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
 * Generate issue markdown content from data.
 */
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
          const content = await fs.readFile(path.join(issuesDir, file), 'utf-8');
          const issueId = file.replace(/\.md$/, '');
          return parseIssueMarkdown(content, issueId);
        } catch {
          // Skip files that can't be read (deleted, permissions, etc.)
          return null;
        }
      })
    );

    return results.filter((item): item is BoardItem => item !== null);
  }

  /**
   * Create a new issue file.
   */
  async createIssue(projectPath: string, data: CreateIssueRequest): Promise<BoardItem> {
    const issuesDir = await this.resolveIssuesDir(projectPath);
    await this.ensureIssuesDir(issuesDir);

    const slug = slugify(data.title);
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const issueId = `${timestamp}-${randomSuffix}-${slug}`;
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

    // Atomic write: write to temp file then rename to prevent partial writes
    const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, updated, 'utf-8');
    await fs.rename(tmpPath, filePath);

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
  }

  /**
   * Get unified board data: issues + epics + stories from bmadStatusService.
   */
  async getBoard(projectPath: string, customStatusMappings?: Record<string, BoardItemStatus>): Promise<Pick<BoardResponse, 'items'>> {
    const [issues, statusResponse, issuesDir] = await Promise.all([
      this.listIssues(projectPath),
      bmadStatusService.scanProject(projectPath),
      this.resolveIssuesDir(projectPath),
    ]);

    // Compute project-relative issues path for externalRef
    const relativeIssuesDir = path.relative(projectPath, issuesDir).replace(/\\/g, '/');

    const items: BoardItem[] = issues.map((issue) => ({
      ...issue,
      externalRef: `${relativeIssuesDir}/${issue.id}.md`,
    }));

    // Resolve story directory (project-relative) for filePath
    const storyLocation = statusResponse.config.devStoryLocation || 'docs/stories';

    for (const epic of statusResponse.epics) {
      // Convert stories to BoardItems
      const storyItems: BoardItem[] = epic.stories.map((story) => {
        const fileMatch = story.file.match(/^(\d+\.\d+)/);
        const storyId = fileMatch ? fileMatch[1] : story.file.replace(/\.md$/, '');
        const epicMatch = story.file.match(/^(\d+)\./);
        const epicNumber = epicMatch ? parseInt(epicMatch[1], 10) : undefined;

        const mapped = mapStoryStatus(story.status, customStatusMappings);
        return {
          id: `story-${storyId}`,
          type: 'story' as const,
          title: story.title ?? story.file,
          status: mapped,
          // Include rawStatus when it differs from the standard mapped value
          ...(story.status !== mapped && { rawStatus: story.status }),
          ...(epicNumber !== undefined && { epicNumber }),
          filePath: `${storyLocation}/${story.file}`,
        };
      });

      items.push(...storyItems);

      // Calculate epic status from mapped story statuses
      const mappedStatuses = epic.stories.map((s) => mapStoryStatus(s.status, customStatusMappings));
      let epicStatus: BoardItemStatus;
      if (mappedStatuses.length === 0) {
        epicStatus = 'Open';
      } else {
        const allDone = mappedStatuses.every((s) => s === 'Done');
        const allDraftOrEmpty = mappedStatuses.every(
          (s) => s === 'Draft' || s === 'Open'
        );

        if (allDone) {
          epicStatus = 'Done';
        } else if (allDraftOrEmpty) {
          epicStatus = 'Open';
        } else {
          epicStatus = 'InProgress';
        }
      }

      // Calculate story progress: use planned count from PRD as denominator when available
      const planned = epic.plannedStories ?? mappedStatuses.length;
      const total = Math.max(planned, mappedStatuses.length);
      const done = mappedStatuses.filter((s) => s === 'Done').length;

      items.push({
        id: `epic-${epic.number}`,
        type: 'epic',
        title: epic.name,
        status: epicStatus,
        epicNumber: epic.number,
        storyProgress: { total, done },
        ...(epic.filePath && { filePath: epic.filePath }),
      });
    }

    return { items };
  }

  /**
   * Normalize a story file's status from a non-standard value (e.g. "Ready for Done")
   * to the standard mapped value (e.g. "Done") in the actual markdown file.
   * @param projectPath Absolute path to the project root
   * @param storyNum Story number like "1.1"
   * @returns The normalized status string
   */
  async normalizeStoryStatus(projectPath: string, storyNum: string): Promise<string> {
    const config = await bmadStatusService.scanProject(projectPath).then((r) => r.config);
    const storiesDir = config.devStoryLocation
      ? path.join(projectPath, config.devStoryLocation)
      : path.join(projectPath, 'docs', 'stories');

    // Find the story file matching the number
    const files = await fs.readdir(storiesDir);
    const storyFile = files.find((f) => f.startsWith(`${storyNum}.`));
    if (!storyFile) {
      const err = new Error(`Story file not found: ${storyNum}`);
      (err as NodeJS.ErrnoException).code = 'STORY_NOT_FOUND';
      throw err;
    }

    const filePath = path.join(storiesDir, storyFile);
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract current status
    const statusMatch = content.match(/^(## Status\s*\n\s*\n\s*)(.+)/m);
    if (!statusMatch) {
      const err = new Error('Status section not found in story file');
      (err as NodeJS.ErrnoException).code = 'STATUS_NOT_FOUND';
      throw err;
    }

    const rawStatus = statusMatch[2].trim();
    const mapped = mapStoryStatus(rawStatus);

    if (rawStatus === mapped) {
      return mapped; // Already standard, no change needed
    }

    // Replace the status in the file (atomic write: temp + rename)
    const updated = content.replace(
      /^(## Status\s*\n\s*\n\s*).+/m,
      `$1${mapped}`,
    );
    const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmpPath, updated, 'utf-8');
    await fs.rename(tmpPath, filePath);

    return mapped;
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
 * Update or create the ## Attachments section in issue markdown.
 */
function updateAttachmentsSection(content: string, attachments: IssueAttachment[], issueId: string): string {
  const attachmentLines = attachments.map(
    (a) => `- [${a.originalName}](${ATTACHMENTS_DIR_NAME}/${issueId}/${a.filename}) <!-- size:${a.size} type:${a.mimeType} -->`
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
