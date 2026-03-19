/**
 * Session Service for Session Management
 * Story 1.6: Session Management
 *
 * Handles session persistence, retrieval, and listing
 * from Claude Code's ~/.claude/projects/ directory structure
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import type {
  SessionInfo,
  SessionsIndex,
  SessionIndexEntry,
  SessionListItem,
  SessionListParams,
  HistoryMessage,
  PaginationInfo,
  PaginationOptions,
} from '@hammoc/shared';
import {
  parseJSONLFile,
  parseJSONLSessionMeta,
  sortMessagesByParentUuid,
  transformToHistoryMessages,
  cleanCommandTags,
} from './historyParser.js';

/**
 * SessionService - Manages Claude Code session data
 */
export class SessionService {
  private readonly claudeProjectsDir: string;

  // Per-project mutex for sessions-index.json writes to prevent concurrent read-modify-write races
  private static indexWriteLocks = new Map<string, Promise<void>>();

  constructor() {
    this.claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  }

  /**
   * Serialize async operations per project slug to prevent concurrent
   * read-modify-write on sessions-index.json.
   */
  private async withIndexLock(projectSlug: string, fn: () => Promise<void>): Promise<void> {
    const prev = SessionService.indexWriteLocks.get(projectSlug) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    SessionService.indexWriteLocks.set(projectSlug, next);
    try {
      await next;
    } finally {
      // Clean up if this is still the latest queued operation
      if (SessionService.indexWriteLocks.get(projectSlug) === next) {
        SessionService.indexWriteLocks.delete(projectSlug);
      }
    }
  }

  /**
   * Encode a project path to Claude Code's directory format
   * /Users/username/myproject -> -Users-username-myproject
   * C:\Users\username\myproject -> C-Users-username-myproject
   */
  encodeProjectPath(projectPath: string): string {
    return projectPath.replace(/[/\\:]/g, '-').replace(/^-/, '');
  }

  /**
   * Get the sessions directory for a project
   */
  getSessionsDir(projectPath: string): string {
    const encoded = this.encodeProjectPath(projectPath);
    return path.join(this.claudeProjectsDir, encoded);
  }

  /**
   * Get the sessions-index.json path for a project
   */
  getSessionsIndexPath(projectPath: string): string {
    return path.join(this.getSessionsDir(projectPath), 'sessions-index.json');
  }

  /**
   * Save the current session ID for a project
   * Note: This creates a simple tracking file, not modifying Claude's actual index
   */
  async saveSessionId(projectPath: string, sessionId: string): Promise<void> {
    const sessionsDir = this.getSessionsDir(projectPath);

    // Ensure directory exists
    if (!existsSync(sessionsDir)) {
      await fs.mkdir(sessionsDir, { recursive: true });
    }

    const trackingPath = path.join(sessionsDir, '.bmad-current-session');
    await fs.writeFile(trackingPath, sessionId, 'utf-8');
  }

  /**
   * Get the last used session ID for a project
   */
  async getSessionId(projectPath: string): Promise<string | null> {
    const trackingPath = path.join(this.getSessionsDir(projectPath), '.bmad-current-session');

    try {
      const sessionId = await fs.readFile(trackingPath, 'utf-8');
      return sessionId.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * List all sessions for a project from sessions-index.json
   */
  async listSessions(projectPath: string): Promise<SessionInfo[]> {
    const indexPath = this.getSessionsIndexPath(projectPath);

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionsIndex = JSON.parse(content);

      if (!index.entries || !Array.isArray(index.entries)) {
        return [];
      }

      const projectSlug = this.encodeProjectPath(projectPath);

      return index.entries.map((entry: SessionIndexEntry) => ({
        sessionId: entry.sessionId,
        projectSlug,
        firstPrompt: entry.firstPrompt,
        messageCount: entry.messageCount,
        created: new Date(entry.created),
        modified: new Date(entry.modified),
      }));
    } catch {
      // File doesn't exist or is invalid
      return [];
    }
  }

  /**
   * Check if a session exists in the sessions-index.json
   */
  async sessionExists(projectPath: string, sessionId: string): Promise<boolean> {
    const sessions = await this.listSessions(projectPath);
    return sessions.some((s) => s.sessionId === sessionId);
  }

  /**
   * Get a specific session by ID
   */
  async getSession(projectPath: string, sessionId: string): Promise<SessionInfo | null> {
    const sessions = await this.listSessions(projectPath);
    return sessions.find((s) => s.sessionId === sessionId) || null;
  }

  /**
   * Validate session ID format (basic validation)
   * Session IDs from Claude Code are typically alphanumeric with hyphens
   */
  isValidSessionId(sessionId: string): boolean {
    if (!sessionId || typeof sessionId !== 'string') {
      return false;
    }
    // Allow alphanumeric characters, hyphens, and underscores
    return /^[a-zA-Z0-9_-]+$/.test(sessionId);
  }

  // Story 3.3: Session List API methods

  /**
   * Get original project path from projectSlug
   * @param projectSlug The folder name in ~/.claude/projects/
   * @returns Original project path or null if not found
   */
  async getProjectPathBySlug(projectSlug: string): Promise<string | null> {
    const projectDir = path.join(this.claudeProjectsDir, projectSlug);
    const indexPath = path.join(projectDir, 'sessions-index.json');

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      return index.originalPath || null;
    } catch {
      return null;
    }
  }

  /**
   * Truncate text to specified length with ellipsis
   */
  truncateFirstPrompt(text: string, maxLength: number = 100): string {
    if (!text) return '';
    const cleaned = cleanCommandTags(text);
    if (!cleaned) return '';
    // Use first non-empty line as preview
    const firstLine = cleaned.split('\n').find(line => line.trim())?.trim() || '';
    if (!firstLine) return '';
    if (firstLine.length <= maxLength) return firstLine;
    return firstLine.slice(0, maxLength - 3) + '...';
  }

  /**
   * Safely parse ISO date string for sorting
   * Returns 0 for invalid dates to push them to the end
   */
  private parseDate(dateStr: string): number {
    const timestamp = Date.parse(dateStr);
    return isNaN(timestamp) ? 0 : timestamp;
  }

  /**
   * Check if a session matches the search query by metadata
   * Matches against session name, session ID, and firstPrompt (case-insensitive)
   */
  private matchesMetadata(
    sessionId: string,
    firstPrompt: string,
    queryLower: string,
    sessionNames?: Record<string, string>
  ): boolean {
    if (sessionId.toLowerCase().includes(queryLower)) return true;
    if (firstPrompt && firstPrompt.toLowerCase().includes(queryLower)) return true;
    const name = sessionNames?.[sessionId];
    if (name && name.toLowerCase().includes(queryLower)) return true;
    return false;
  }

  /**
   * Search JSONL file content for a query string
   * Returns true on first match (early termination)
   */
  private async searchFileContent(filePath: string, queryLower: string): Promise<boolean> {
    try {
      const rawMessages = await parseJSONLFile(filePath);
      for (const msg of rawMessages) {
        if (msg.type !== 'user' && msg.type !== 'assistant') continue;
        const content = msg.message?.content;
        if (typeof content === 'string') {
          if (content.toLowerCase().includes(queryLower)) return true;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
              if (block.text.toLowerCase().includes(queryLower)) return true;
            }
          }
        }
      }
    } catch {
      // Skip unparseable files
    }
    return false;
  }

  /**
   * Execute async tasks with bounded concurrency
   */
  private async pMapWithLimit<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const i = nextIndex++;
        results[i] = await fn(items[i]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
    );
    return results;
  }

  /**
   * List sessions for API response (by projectSlug)
   * - Sorted by modified descending (AC 3)
   * - firstPrompt truncated to 100 chars (AC 4)
   * - Also scans for .jsonl files not yet in sessions-index.json
   * - Supports search by query and content search (Story 23.1)
   */
  async listSessionsBySlug(
    projectSlug: string,
    params: SessionListParams & { sessionNames?: Record<string, string> } = {}
  ): Promise<{ sessions: SessionListItem[]; total: number } | null> {
    const { includeEmpty = false, limit = 0, offset = 0, query, searchContent, sessionNames } = params;
    const queryLower = query?.toLowerCase();
    const projectDir = path.join(this.claudeProjectsDir, projectSlug);
    const indexPath = path.join(projectDir, 'sessions-index.json');

    // Check if project directory exists
    if (!existsSync(projectDir)) {
      return null;
    }

    // Fast path: use index as metadata cache, stat for sort, parse only missing
    if (limit > 0) {
      try {
        // Load sessions-index.json as metadata cache (non-blocking)
        const indexMap = new Map<string, SessionIndexEntry>();
        try {
          const indexContent = await fs.readFile(indexPath, 'utf-8');
          const index: SessionsIndex = JSON.parse(indexContent);
          if (index.entries && Array.isArray(index.entries)) {
            for (const entry of index.entries) {
              indexMap.set(entry.sessionId, entry);
            }
          }
        } catch {
          // Index missing or invalid — will fall back to JSONL parsing
        }

        const files = await fs.readdir(projectDir);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

        // Stat all files (cheap) to get modified time
        const fileStats = await Promise.all(
          jsonlFiles.map(async (file) => {
            const stat = await fs.stat(path.join(projectDir, file));
            return { file, sessionId: file.replace('.jsonl', ''), stat };
          })
        );

        // Sort by mtime descending
        fileStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

        // Pre-filter known-empty sessions from index cache when !includeEmpty
        let candidates = fileStats;
        if (!includeEmpty) {
          candidates = fileStats.filter(({ sessionId }) => {
            const cached = indexMap.get(sessionId);
            // If cached and firstPrompt is empty, exclude
            if (cached && !cached.firstPrompt) return false;
            return true; // Include cache misses — will filter after resolution
          });
        }

        // Apply search filter BEFORE pagination
        if (queryLower) {
          // Resolve first prompts for cache-miss sessions before metadata filtering
          const cacheMisses = candidates.filter(({ sessionId }) => !indexMap.has(sessionId));
          if (cacheMisses.length > 0) {
            await this.pMapWithLimit(cacheMisses, async ({ file, sessionId }) => {
              const meta = await parseJSONLSessionMeta(path.join(projectDir, file));
              if (meta) {
                indexMap.set(sessionId, {
                  sessionId,
                  firstPrompt: meta.firstPrompt,
                  messageCount: meta.messageCount,
                  created: '',
                  modified: '',
                });
              }
            }, 8);
          }

          const metadataMatched = new Set<string>();
          const metadataFiltered = candidates.filter(({ sessionId }) => {
            const cached = indexMap.get(sessionId);
            const firstPrompt = cached?.firstPrompt || '';
            if (this.matchesMetadata(sessionId, firstPrompt, queryLower, sessionNames)) {
              metadataMatched.add(sessionId);
              return true;
            }
            return false;
          });

          if (searchContent) {
            // Content search for sessions not already matched by metadata (cap at 100)
            const unmatchedCandidates = candidates
              .filter(({ sessionId }) => !metadataMatched.has(sessionId))
              .slice(0, 100);

            const contentMatched = await this.pMapWithLimit(
              unmatchedCandidates,
              async (entry) => {
                const matched = await this.searchFileContent(
                  path.join(projectDir, entry.file),
                  queryLower
                );
                return matched ? entry : null;
              },
              8
            );

            const contentHits = contentMatched.filter(
              (e): e is (typeof candidates)[number] => e !== null
            );
            candidates = [...metadataFiltered, ...contentHits];
            // Re-sort after merging
            candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
          } else {
            candidates = metadataFiltered;
          }
        }

        const topFiles = candidates.slice(offset, offset + limit);

        // Resolve metadata: use index cache when available, parse JSONL only for misses (in parallel)
        const sessions = (await Promise.all(
          topFiles.map(async ({ file, sessionId, stat }): Promise<SessionListItem | null> => {
            const cached = indexMap.get(sessionId);
            if (cached) {
              return {
                sessionId,
                firstPrompt: this.truncateFirstPrompt(cached.firstPrompt),
                messageCount: cached.messageCount,
                created: stat.birthtime.toISOString(),
                modified: stat.mtime.toISOString(),
              };
            }
            // Cache miss — use lightweight stream parser
            const meta = await parseJSONLSessionMeta(path.join(projectDir, file));
            if (!meta) return null;

            // Filter empty sessions for cache misses when !includeEmpty
            if (!includeEmpty && !meta.firstPrompt) return null;

            return {
              sessionId,
              firstPrompt: meta.firstPrompt ? this.truncateFirstPrompt(meta.firstPrompt) : '',
              messageCount: meta.messageCount,
              created: stat.birthtime.toISOString(),
              modified: stat.mtime.toISOString(),
            };
          })
        )).filter((s): s is SessionListItem => s !== null);

        return { sessions, total: candidates.length };
      } catch {
        return { sessions: [], total: 0 };
      }
    }

    // Full path: build complete session map from index + file scan
    const sessionMap = new Map<string, SessionListItem>();
    // Keep raw firstPrompt (full text) for search matching
    const rawFirstPromptMap = new Map<string, string>();

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionsIndex = JSON.parse(content);

      if (index.entries && Array.isArray(index.entries)) {
        for (const entry of index.entries) {
          rawFirstPromptMap.set(entry.sessionId, entry.firstPrompt);
          sessionMap.set(entry.sessionId, {
            sessionId: entry.sessionId,
            firstPrompt: this.truncateFirstPrompt(entry.firstPrompt),
            messageCount: entry.messageCount,
            created: entry.created,
            modified: entry.modified,
          });
        }
      }
    } catch {
      // Index file doesn't exist or is invalid - continue with file scan
    }

    // Scan for .jsonl files not in index (SDK may not have updated index yet)
    try {
      const files = await fs.readdir(projectDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const sessionId = file.replace('.jsonl', '');
        if (!sessionMap.has(sessionId)) {
          const filePath = path.join(projectDir, file);
          const stat = await fs.stat(filePath);

          const meta = await parseJSONLSessionMeta(filePath);
          if (meta && (meta.firstPrompt || includeEmpty)) {
            if (meta.firstPrompt) rawFirstPromptMap.set(sessionId, meta.firstPrompt);
            sessionMap.set(sessionId, {
              sessionId,
              firstPrompt: meta.firstPrompt ? this.truncateFirstPrompt(meta.firstPrompt) : '',
              messageCount: meta.messageCount,
              created: stat.birthtime.toISOString(),
              modified: stat.mtime.toISOString(),
            });
          } else if (includeEmpty) {
            sessionMap.set(sessionId, {
              sessionId,
              firstPrompt: '',
              messageCount: 0,
              created: stat.birthtime.toISOString(),
              modified: stat.mtime.toISOString(),
            });
          }
        }
      }
    } catch {
      // Failed to read directory - return what we have from index
    }

    if (sessionMap.size === 0) {
      return { sessions: [], total: 0 };
    }

    // Sort by modified descending (AC 3)
    let sorted = [...sessionMap.values()].sort(
      (a, b) => this.parseDate(b.modified) - this.parseDate(a.modified)
    );

    // Apply search filter for full path
    if (queryLower) {
      const metadataMatched = new Set<string>();
      const metadataFiltered = sorted.filter((s) => {
        const rawPrompt = rawFirstPromptMap.get(s.sessionId) || '';
        if (this.matchesMetadata(s.sessionId, rawPrompt, queryLower, sessionNames)) {
          metadataMatched.add(s.sessionId);
          return true;
        }
        return false;
      });

      if (searchContent) {
        // Content search for sessions not already matched (cap at 100)
        const unmatched = sorted
          .filter((s) => !metadataMatched.has(s.sessionId))
          .slice(0, 100);

        const contentHits: SessionListItem[] = [];
        for (const s of unmatched) {
          const filePath = path.join(projectDir, `${s.sessionId}.jsonl`);
          const matched = await this.searchFileContent(filePath, queryLower);
          if (matched) contentHits.push(s);
        }

        sorted = [...metadataFiltered, ...contentHits];
        sorted.sort((a, b) => this.parseDate(b.modified) - this.parseDate(a.modified));
      } else {
        sorted = metadataFiltered;
      }
    }

    return { sessions: sorted, total: sorted.length };
  }

  // Session deletion methods

  /**
   * Remove a session entry from sessions-index.json
   */
  private async removeFromSessionsIndex(projectSlug: string, sessionId: string): Promise<void> {
    const indexPath = path.join(this.claudeProjectsDir, projectSlug, 'sessions-index.json');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionsIndex = JSON.parse(content);
      const before = index.entries.length;
      index.entries = index.entries.filter(e => e.sessionId !== sessionId);
      if (index.entries.length < before) {
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }
    } catch {
      // Index file doesn't exist or is invalid - skip
    }
  }

  /**
   * Remove multiple session entries from sessions-index.json in one write
   */
  private async removeMultipleFromSessionsIndex(projectSlug: string, sessionIds: Set<string>): Promise<void> {
    const indexPath = path.join(this.claudeProjectsDir, projectSlug, 'sessions-index.json');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionsIndex = JSON.parse(content);
      const before = index.entries.length;
      index.entries = index.entries.filter(e => !sessionIds.has(e.sessionId));
      if (index.entries.length < before) {
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }
    } catch {
      // Index file doesn't exist or is invalid - skip
    }
  }

  /**
   * Delete a single session (.jsonl file + index entry)
   */
  async deleteSession(projectSlug: string, sessionId: string): Promise<void> {
    const filePath = this.getSessionFilePath(projectSlug, sessionId);
    await fs.unlink(filePath);
    await this.removeFromSessionsIndex(projectSlug, sessionId);
  }

  /**
   * Delete multiple sessions (batch)
   * Returns count of successfully deleted and failed sessions
   */
  async deleteSessions(projectSlug: string, sessionIds: string[]): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;
    const deletedIds = new Set<string>();

    for (const sessionId of sessionIds) {
      if (!this.isValidPathParam(sessionId)) {
        failed++;
        continue;
      }
      try {
        const filePath = this.getSessionFilePath(projectSlug, sessionId);
        await fs.unlink(filePath);
        deleted++;
        deletedIds.add(sessionId);
      } catch {
        failed++;
      }
    }

    // Remove all deleted sessions from index in one write
    if (deletedIds.size > 0) {
      await this.removeMultipleFromSessionsIndex(projectSlug, deletedIds);
    }

    return { deleted, failed };
  }

  /**
   * Update or insert a session entry in sessions-index.json.
   * Called after a stream completes so the index stays fresh and
   * future list queries avoid expensive JSONL re-parsing.
   */
  async updateSessionIndex(projectSlug: string, sessionId: string): Promise<void> {
    await this.withIndexLock(projectSlug, async () => {
      const projectDir = path.join(this.claudeProjectsDir, projectSlug);
      const indexPath = path.join(projectDir, 'sessions-index.json');
      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

      const meta = await parseJSONLSessionMeta(sessionFile);
      if (!meta) return;

      const stat = await fs.stat(sessionFile);

      const entry: SessionIndexEntry = {
        sessionId,
        firstPrompt: meta.firstPrompt,
        messageCount: meta.messageCount,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
      };

      // Read existing index — skip update entirely if file exists but is unparseable
      let index: SessionsIndex;
      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        index = JSON.parse(content);
        if (!index.entries || !Array.isArray(index.entries)) {
          index.entries = [];
        }
      } catch (err: unknown) {
        // If index file exists but is corrupt, skip to avoid overwriting valid data
        if (existsSync(indexPath)) return;
        index = { version: 1, entries: [] };
      }

      // Upsert: replace existing entry or append
      const existingIdx = index.entries.findIndex(e => e.sessionId === sessionId);
      if (existingIdx >= 0) {
        index.entries[existingIdx] = entry;
      } else {
        index.entries.push(entry);
      }

      // Atomic write: write to temp file then rename
      const tmpPath = `${indexPath}.tmp.${Date.now()}`;
      await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
      await fs.rename(tmpPath, indexPath);
    });
  }

  // Story 3.5: Session History Loading methods

  /**
   * Get the JSONL file path for a session
   * Claude Code stores session files directly in the project folder (not in a sessions subfolder)
   * @param projectSlug The project slug
   * @param sessionId The session ID
   * @returns Full path to the JSONL session file
   */
  getSessionFilePath(projectSlug: string, sessionId: string): string {
    return path.join(this.claudeProjectsDir, projectSlug, `${sessionId}.jsonl`);
  }

  /**
   * Check if a session file exists
   * @param projectSlug The project slug
   * @param sessionId The session ID
   * @returns true if the session file exists
   */
  sessionFileExists(projectSlug: string, sessionId: string): boolean {
    const filePath = this.getSessionFilePath(projectSlug, sessionId);
    return existsSync(filePath);
  }

  /**
   * Validate path parameter to prevent path traversal attacks
   * @param param The path parameter to validate
   * @returns true if the parameter is safe
   */
  isValidPathParam(param: string): boolean {
    // Reject if contains path traversal sequences
    if (param.includes('..') || param.includes('/') || param.includes('\\')) {
      return false;
    }
    // Reject if contains null bytes or other dangerous characters
    if (param.includes('\0') || param.includes('%00')) {
      return false;
    }
    // Only allow alphanumeric, hyphens, and underscores
    return /^[a-zA-Z0-9_-]+$/.test(param);
  }

  /**
   * Get session messages with pagination
   * @param projectSlug The project slug
   * @param sessionId The session ID
   * @param options Pagination options (limit, offset)
   * @returns Messages with pagination info, or null if session not found
   */
  async getSessionMessages(
    projectSlug: string,
    sessionId: string,
    options: PaginationOptions = {}
  ): Promise<{ messages: HistoryMessage[]; pagination: PaginationInfo; lastAgentCommand: string | null } | null> {
    const { limit = 50, offset = 0, streamStartedAt } = options;

    const filePath = this.getSessionFilePath(projectSlug, sessionId);

    if (!existsSync(filePath)) {
      return null;
    }

    const rawMessages = await parseJSONLFile(filePath);
    const sorted = sortMessagesByParentUuid(rawMessages);
    let transformed = transformToHistoryMessages(sorted);

    // If session has an active stream, exclude messages from the stream period.
    // Those messages are covered by WebSocket buffer replay (stream:buffer-replay).
    // This prevents duplicate tool/message cards when the client loads both
    // JSONL history and buffer replay simultaneously.
    if (streamStartedAt) {
      transformed = transformed.filter(
        (m) => new Date(m.timestamp).getTime() < streamStartedAt
      );
    }

    const total = transformed.length;

    // Chat UI: Load from the END (most recent messages first)
    // offset=0 means "most recent N messages"
    // offset=50 means "skip 50 most recent, get next N older messages"
    const startIndex = Math.max(0, total - offset - limit);
    const endIndex = Math.max(0, total - offset);
    const paginated = transformed.slice(startIndex, endIndex);

    // Scan full message list (reverse) for last agent command in user messages.
    // Must match agent command pattern (:agents:), not any slash command —
    // otherwise non-agent commands like /commit would shadow the real agent.
    let lastAgentCommand: string | null = null;
    for (let i = transformed.length - 1; i >= 0; i--) {
      if (transformed[i].type === 'user' && transformed[i].content.includes(':agents:')) {
        lastAgentCommand = transformed[i].content;
        break;
      }
    }

    return {
      messages: paginated,
      pagination: {
        total,
        limit,
        offset,
        hasMore: startIndex > 0, // There are older messages to load
      },
      lastAgentCommand,
    };
  }
}

// Singleton export for controllers (Story 3.3)
export const sessionService = new SessionService();
