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
  HistoryMessage,
  PaginationInfo,
  PaginationOptions,
} from '@bmad-studio/shared';
import {
  parseJSONLFile,
  sortMessagesByParentUuid,
  transformToHistoryMessages,
} from './historyParser.js';

/**
 * SessionService - Manages Claude Code session data
 */
export class SessionService {
  private readonly claudeProjectsDir: string;

  constructor() {
    this.claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
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
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
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
   * List sessions for API response (by projectSlug)
   * - Sorted by modified descending (AC 3)
   * - firstPrompt truncated to 100 chars (AC 4)
   * - Also scans for .jsonl files not yet in sessions-index.json
   */
  async listSessionsBySlug(projectSlug: string, includeEmpty = false): Promise<SessionListItem[] | null> {
    const projectDir = path.join(this.claudeProjectsDir, projectSlug);
    const indexPath = path.join(projectDir, 'sessions-index.json');

    // Check if project directory exists
    if (!existsSync(projectDir)) {
      return null;
    }

    // Build session map from index file (if exists)
    const sessionMap = new Map<string, SessionListItem>();

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionsIndex = JSON.parse(content);

      if (index.entries && Array.isArray(index.entries)) {
        for (const entry of index.entries) {
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
          // Session file exists but not in index - add it
          const filePath = path.join(projectDir, file);
          const stat = await fs.stat(filePath);

          // Try to extract first prompt and add session
          try {
            const rawMessages = await parseJSONLFile(filePath);
            // JSONL format: type is 'user', content is in message.content
            const userMessage = rawMessages.find(m => m.type === 'user');
            if (userMessage) {
              const content = userMessage.message?.content;
              let firstPrompt: string | null = null;

              if (typeof content === 'string') {
                firstPrompt = this.truncateFirstPrompt(content);
              } else if (Array.isArray(content)) {
                const textBlock = content.find((b: { type: string }) => b.type === 'text');
                if (textBlock && 'text' in textBlock) {
                  firstPrompt = this.truncateFirstPrompt(textBlock.text as string);
                }
              }

              // Only add session if it has a valid first prompt (or includeEmpty is true)
              if (firstPrompt || includeEmpty) {
                const messageCount = rawMessages.filter(
                  m => m.type === 'user' || m.type === 'assistant'
                ).length;

                sessionMap.set(sessionId, {
                  sessionId,
                  firstPrompt: firstPrompt || '',
                  messageCount,
                  created: stat.birthtime.toISOString(),
                  modified: stat.mtime.toISOString(),
                });
              }
            } else if (includeEmpty) {
              // No user message found but includeEmpty is true
              sessionMap.set(sessionId, {
                sessionId,
                firstPrompt: '',
                messageCount: 0,
                created: stat.birthtime.toISOString(),
                modified: stat.mtime.toISOString(),
              });
            }
          } catch {
            // Failed to parse file - add as empty if includeEmpty
            if (includeEmpty) {
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
      }
    } catch {
      // Failed to read directory - return what we have from index
    }

    if (sessionMap.size === 0) {
      return [];
    }

    // Sort by modified descending (AC 3)
    const sorted = [...sessionMap.values()].sort(
      (a, b) => this.parseDate(b.modified) - this.parseDate(a.modified)
    );

    return sorted;
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
  ): Promise<{ messages: HistoryMessage[]; pagination: PaginationInfo } | null> {
    const { limit = 50, offset = 0 } = options;

    const filePath = this.getSessionFilePath(projectSlug, sessionId);

    if (!existsSync(filePath)) {
      return null;
    }

    const rawMessages = await parseJSONLFile(filePath);
    const sorted = sortMessagesByParentUuid(rawMessages);
    const transformed = transformToHistoryMessages(sorted);

    const total = transformed.length;

    // Chat UI: Load from the END (most recent messages first)
    // offset=0 means "most recent N messages"
    // offset=50 means "skip 50 most recent, get next N older messages"
    const startIndex = Math.max(0, total - offset - limit);
    const endIndex = Math.max(0, total - offset);
    const paginated = transformed.slice(startIndex, endIndex);

    return {
      messages: paginated,
      pagination: {
        total,
        limit,
        offset,
        hasMore: startIndex > 0, // There are older messages to load
      },
    };
  }
}

/**
 * Create a new SessionService instance
 */
export function createSessionService(): SessionService {
  return new SessionService();
}

// Singleton export for controllers (Story 3.3)
export const sessionService = new SessionService();
