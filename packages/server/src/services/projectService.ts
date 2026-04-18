/**
 * Project Service
 * Scans ~/.claude/projects/ directory for project list
 * [Source: Story 3.1 - Task 2]
 * [Extended: Story 3.6 - Task 2: Project creation service]
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import type {
  PromptHistoryData,
  PromptChainItem,
  ProjectInfo,
  ProjectSettings,
  UpdateProjectSettingsRequest,
  ProjectSettingsApiResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  ValidatePathResponse,
} from '@hammoc/shared';
import { preferencesService } from './preferencesService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('projectService');

// Resolve the server package root for locating bundled resources
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const BMAD_RESOURCES_DIR = path.join(SERVER_PACKAGE_ROOT, 'resources', 'bmad-method');

/**
 * Validate path for security (path traversal prevention)
 * Cross-platform compatible (Windows, macOS, Linux)
 * [Source: Story 3.6 - Task 2]
 */
function isValidPathFormat(inputPath: string): boolean {
  // Normalize path first for cross-platform compatibility
  const normalizedPath = path.normalize(inputPath);

  // Reject relative paths (works for both Windows and Unix)
  if (!path.isAbsolute(normalizedPath)) {
    return false;
  }

  // Reject path traversal sequences (check both normalized and original)
  // Windows: ..\, Unix: ../
  if (inputPath.includes('..') || normalizedPath.includes('..')) {
    return false;
  }

  // Reject null bytes (security)
  if (inputPath.includes('\0')) {
    return false;
  }

  // Additional Windows-specific checks
  // Reject reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (process.platform === 'win32') {
    const basename = path.basename(normalizedPath).toUpperCase();
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(basename)) {
      return false;
    }
  }

  return true;
}

/**
 * Structure of sessions-index.json file managed by Claude Code
 * Note: This structure is based on analysis of Claude Code's internal format
 * and may change with Claude Code updates
 *
 * Claude Code uses two possible formats:
 * 1. Legacy format: { originalPath: "...", entries: [...] }
 * 2. Current format (v1): { version: 1, entries: [{ projectPath: "...", ... }] }
 */
interface SessionsIndexEntry {
  sessionId: string;
  firstPrompt?: string;
  summary?: string;
  messageCount?: number;
  created?: string;
  modified?: string;
  // Current Claude Code format fields
  projectPath?: string;
  fullPath?: string;
  fileMtime?: number;
  gitBranch?: string;
  isSidechain?: boolean;
}

interface SessionsIndexFile {
  // Legacy format
  originalPath?: string;
  // Current format (v1)
  version?: number;
  // Both formats have entries
  entries?: SessionsIndexEntry[];
}

/**
 * ProjectService - Scans and lists Claude Code projects
 */
class ProjectService {
  /**
   * Get the Claude projects directory path
   * @returns Path to ~/.claude/projects/
   */
  getClaudeProjectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
  }

  /**
   * Scan the projects directory and return project list
   * @returns Array of ProjectInfo sorted by lastModified (descending)
   */
  async scanProjects(): Promise<ProjectInfo[]> {
    const projectsDir = this.getClaudeProjectsDir();

    // Check if directory exists (AC 6: return empty array if not)
    try {
      await fs.access(projectsDir);
    } catch {
      return [];
    }

    // Read all entries in the projects directory
    let entries: string[];
    try {
      entries = await fs.readdir(projectsDir);
    } catch (error) {
      // Permission denied or other error
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        const err = new Error('디렉토리 접근 권한이 없습니다.');
        (err as NodeJS.ErrnoException).code = 'PERMISSION_DENIED';
        throw err;
      }
      throw error;
    }

    // Filter to only directories and process each
    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      const projectPath = path.join(projectsDir, entry);

      // Check if it's a directory
      try {
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // Try sessions-index.json first, fall back to JSONL-based discovery
      let projectInfo = await this.parseSessionsIndex(projectPath, entry);
      if (!projectInfo) {
        projectInfo = await this.buildProjectFromDirectory(projectPath, entry);
      }
      if (projectInfo) {
        // Filter out projects whose originalPath no longer exists
        const pathExists = await this.checkPathExists(projectInfo.originalPath);
        if (pathExists) {
          projects.push(projectInfo);
        }
      }
    }

    // Sort by lastModified descending (AC 5)
    projects.sort((a, b) => {
      const dateA = new Date(a.lastModified).getTime();
      const dateB = new Date(b.lastModified).getTime();
      return dateB - dateA;
    });

    return projects;
  }

  /**
   * Parse sessions-index.json file from a project directory
   * @param projectPath Full path to the project directory in ~/.claude/projects/
   * @param projectSlug The folder name (hash/slug)
   * @returns ProjectInfo or null if parsing fails
   */
  async parseSessionsIndex(
    projectPath: string,
    projectSlug: string
  ): Promise<ProjectInfo | null> {
    const indexPath = path.join(projectPath, 'sessions-index.json');

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionsIndexFile = JSON.parse(content);

      const entries = index.entries || [];

      // Determine originalPath from either format:
      // 1. Legacy format: index.originalPath at root level
      // 2. Current format (v1): entries[0].projectPath from first entry
      let originalPath: string | undefined = index.originalPath;

      if (!originalPath && entries.length > 0) {
        // Try to get projectPath from the first entry (current Claude Code format)
        originalPath = entries[0].projectPath;
      }

      // If still no originalPath, try extracting cwd from .jsonl session files
      // (Hammoc-created sessions may lack projectPath in index entries)
      if (!originalPath || typeof originalPath !== 'string') {
        originalPath = await this.extractCwdFromSessionFiles(projectPath) ?? undefined;

        // Backfill: write projectPath into entries so future lookups skip the fallback
        // Use atomic temp+rename to avoid corrupting the index during concurrent reads
        if (originalPath && entries.length > 0) {
          for (const e of entries) { e.projectPath = originalPath; }
          const tmpPath = `${indexPath}.tmp.${Date.now()}`;
          try {
            await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
            await fs.rename(tmpPath, indexPath);
          } catch {
            // Best-effort backfill — next call will retry
            fs.unlink(tmpPath).catch(() => {});
          }
        }
      }

      if (!originalPath || typeof originalPath !== 'string') {
        // Don't throw error, just skip - this might be a corrupted or empty project
        return null;
      }

      // Count sessions from index entries + unindexed .jsonl files
      const indexedSessionIds = new Set(entries.map((e) => e.sessionId));
      let sessionCount = entries.length;

      // Collect modification timestamps from index entries
      const modifiedTimestamps = entries
        .filter((e) => e.modified)
        .map((e) => new Date(e.modified!).getTime());

      // Scan for .jsonl files not in index (Hammoc sessions, SDK not yet synced)
      // and collect their mtimes for lastModified calculation
      try {
        const files = await fs.readdir(projectPath);
        for (const f of files) {
          if (!f.endsWith('.jsonl') || indexedSessionIds.has(f.replace('.jsonl', ''))) continue;
          sessionCount++;
          const fileStat = await fs.stat(path.join(projectPath, f));
          modifiedTimestamps.push(fileStat.mtime.getTime());
        }
      } catch {
        // Failed to read directory - use index data only
      }

      // Calculate lastModified
      let lastModified: string;
      if (modifiedTimestamps.length > 0) {
        lastModified = new Date(Math.max(...modifiedTimestamps)).toISOString();
      } else {
        // Fallback to index file mtime
        const stat = await fs.stat(indexPath);
        lastModified = stat.mtime.toISOString();
      }

      // Check if it's a BMad project (AC 4)
      const isBmadProject = await this.checkBmadProject(originalPath);

      // Read project settings from .hammoc/settings.json
      const settings = await this.readProjectSettings(originalPath);

      return {
        originalPath,
        projectSlug,
        sessionCount,
        lastModified,
        isBmadProject,
        ...(settings.hidden !== undefined && { hidden: settings.hidden }),
      };
    } catch (error) {
      // Re-throw specific errors
      if ((error as NodeJS.ErrnoException).code === 'INVALID_SESSION_INDEX') {
        throw error;
      }

      // File doesn't exist or is invalid JSON - skip this project
      return null;
    }
  }

  /**
   * Read project settings from <originalPath>/.hammoc/settings.json
   * Returns default values if file doesn't exist
   */
  async readProjectSettings(originalPath: string): Promise<ProjectSettings> {
    const settingsPath = path.join(originalPath, '.hammoc', 'settings.json');
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      return JSON.parse(content) as ProjectSettings;
    } catch {
      return {};
    }
  }

  /**
   * Write project settings to <originalPath>/.hammoc/settings.json
   * Creates .hammoc directory if it doesn't exist
   * Supports null values to delete overrides (null = remove field, undefined = no change)
   */
  async writeProjectSettings(originalPath: string, settings: UpdateProjectSettingsRequest): Promise<void> {
    const hammocDir = path.join(originalPath, '.hammoc');
    await fs.mkdir(hammocDir, { recursive: true });
    const settingsPath = path.join(hammocDir, 'settings.json');

    const existing = await this.readProjectSettings(originalPath);
    const merged = { ...existing };

    // Apply updates: null = delete override, undefined = no change, value = set
    for (const [key, value] of Object.entries(settings)) {
      if (value === null) {
        delete (merged as Record<string, unknown>)[key];
      } else if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }

    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  }

  /**
   * Internal helper: builds ProjectSettingsApiResponse from an already-resolved originalPath.
   * Used by both getProjectSettingsWithEffective() and updateProjectSettings() to avoid
   * redundant parseSessionsIndex() calls.
   */
  private async _buildEffectiveResponse(originalPath: string): Promise<ProjectSettingsApiResponse> {
    const projectSettings = await this.readProjectSettings(originalPath);
    const globalPrefs = await preferencesService.getEffectivePreferences();

    const _overrides: string[] = [];
    if (projectSettings.modelOverride !== undefined) _overrides.push('modelOverride');
    if (projectSettings.permissionModeOverride !== undefined) _overrides.push('permissionModeOverride');

    return {
      ...projectSettings,
      effectiveModel: projectSettings.modelOverride ?? globalPrefs.defaultModel ?? '',
      effectivePermissionMode: projectSettings.permissionModeOverride
        ?? (globalPrefs.permissionMode === 'latest' ? (globalPrefs.lastPermissionMode ?? 'default') : (globalPrefs.permissionMode ?? 'default')),
      _overrides,
    };
  }

  /**
   * Returns project settings merged with global preferences.
   * Calculates effective values and identifies which fields are overridden.
   */
  async getProjectSettingsWithEffective(projectSlug: string): Promise<ProjectSettingsApiResponse> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) {
      const err = new Error('프로젝트를 찾을 수 없습니다.');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    return this._buildEffectiveResponse(info.originalPath);
  }

  /**
   * Update settings for a project identified by its slug
   * @returns Updated ProjectSettingsApiResponse with effective values
   */
  async updateProjectSettings(projectSlug: string, settings: UpdateProjectSettingsRequest): Promise<ProjectSettingsApiResponse> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) {
      const err = new Error('프로젝트를 찾을 수 없습니다.');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      throw err;
    }
    await this.writeProjectSettings(info.originalPath, settings);
    return this._buildEffectiveResponse(info.originalPath);
  }

  /**
   * Read session names from <originalPath>/.hammoc/session-names.json
   * Returns empty object if file doesn't exist
   */
  async readSessionNames(originalPath: string): Promise<Record<string, string>> {
    const namesPath = path.join(originalPath, '.hammoc', 'session-names.json');
    try {
      const content = await fs.readFile(namesPath, 'utf-8');
      return JSON.parse(content) as Record<string, string>;
    } catch (err) {
      // Only return empty for missing file; rethrow other errors to prevent data loss
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  /**
   * Write session names to <originalPath>/.hammoc/session-names.json
   */
  private async writeSessionNames(originalPath: string, names: Record<string, string>): Promise<void> {
    const hammocDir = path.join(originalPath, '.hammoc');
    await fs.mkdir(hammocDir, { recursive: true });
    const namesPath = path.join(hammocDir, 'session-names.json');
    await fs.writeFile(namesPath, JSON.stringify(names, null, 2), 'utf-8');
  }

  // Per-path mutex for session-permissions.json read-modify-write
  private sessionPermissionLocks = new Map<string, Promise<void>>();

  /**
   * Read per-session permission modes from <originalPath>/.hammoc/session-permissions.json
   * Returns empty object if file doesn't exist
   */
  async readSessionPermissions(originalPath: string): Promise<Record<string, string>> {
    const filePath = path.join(originalPath, '.hammoc', 'session-permissions.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Record<string, string>;
    } catch (err: unknown) {
      // Only treat missing file as empty; re-throw parse/other errors to prevent data loss
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  /**
   * Write per-session permission modes to <originalPath>/.hammoc/session-permissions.json
   */
  private async writeSessionPermissions(originalPath: string, permissions: Record<string, string>): Promise<void> {
    const hammocDir = path.join(originalPath, '.hammoc');
    await fs.mkdir(hammocDir, { recursive: true });
    const filePath = path.join(hammocDir, 'session-permissions.json');
    await fs.writeFile(filePath, JSON.stringify(permissions, null, 2), 'utf-8');
  }

  /**
   * Update per-session permission mode for a specific session.
   * Uses per-path mutex to prevent read-modify-write races.
   */
  async updateSessionPermission(originalPath: string, sessionId: string, mode: string): Promise<void> {
    // Shield chain from previous failures, then run current operation
    const prev = this.sessionPermissionLocks.get(originalPath) ?? Promise.resolve();
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const next = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const shielded = next.catch(() => { /* shield chain */ });
    this.sessionPermissionLocks.set(originalPath, shielded);
    try {
      await prev.catch(() => { /* ignore previous failures */ });
      const permissions = await this.readSessionPermissions(originalPath);
      permissions[sessionId] = mode;
      await this.writeSessionPermissions(originalPath, permissions);
      resolve();
    } catch (err) {
      reject(err);
      throw err;
    } finally {
      // Clean up lock entry if no other operation has queued behind this one
      if (this.sessionPermissionLocks.get(originalPath) === shielded) {
        this.sessionPermissionLocks.delete(originalPath);
      }
    }
  }

  /**
   * Update a session name for a project identified by slug
   * @param name null to remove the name
   */
  async updateSessionName(
    projectSlug: string,
    sessionId: string,
    name: string | null,
  ): Promise<string | null> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) {
      const err = new Error('프로젝트를 찾을 수 없습니다.');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const names = await this.readSessionNames(info.originalPath);
    if (name) {
      names[sessionId] = name;
    } else {
      delete names[sessionId];
    }
    await this.writeSessionNames(info.originalPath, names);
    return name;
  }

  /**
   * Resolve a project slug to its original filesystem path.
   * Returns null if the project does not exist.
   */
  async resolveProjectPath(projectSlug: string): Promise<string | null> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    return info?.originalPath ?? null;
  }

  /**
   * Update a session name using a known original path directly,
   * bypassing parseSessionsIndex to avoid file contention with the SDK.
   */
  async updateSessionNameByPath(
    originalPath: string,
    sessionId: string,
    name: string | null,
  ): Promise<string | null> {
    const names = await this.readSessionNames(originalPath);
    if (name) {
      names[sessionId] = name;
    } else {
      delete names[sessionId];
    }
    await this.writeSessionNames(originalPath, names);
    return name;
  }

  /**
   * Read session names for a project identified by slug
   */
  async readSessionNamesBySlug(projectSlug: string): Promise<Record<string, string>> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) return {};
    return this.readSessionNames(info.originalPath);
  }

  /**
   * Read prompt history for a session within a project
   */
  async readPromptHistory(originalPath: string, sessionId: string): Promise<PromptHistoryData> {
    const historyPath = path.join(originalPath, '.hammoc', 'prompt-history', `${sessionId}.json`);
    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      return JSON.parse(content) as PromptHistoryData;
    } catch {
      return { history: [] };
    }
  }

  /**
   * Write prompt history for a session within a project
   */
  async writePromptHistory(originalPath: string, sessionId: string, data: PromptHistoryData): Promise<void> {
    const historyDir = path.join(originalPath, '.hammoc', 'prompt-history');
    await fs.mkdir(historyDir, { recursive: true });
    const historyPath = path.join(historyDir, `${sessionId}.json`);
    await fs.writeFile(historyPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Read prompt history for a session identified by project slug
   */
  async readPromptHistoryBySlug(projectSlug: string, sessionId: string): Promise<PromptHistoryData> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) return { history: [] };
    return this.readPromptHistory(info.originalPath, sessionId);
  }

  /**
   * Write prompt history for a session identified by project slug
   */
  async writePromptHistoryBySlug(projectSlug: string, sessionId: string, data: PromptHistoryData): Promise<void> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) {
      const err = new Error('프로젝트를 찾을 수 없습니다.');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      throw err;
    }
    await this.writePromptHistory(info.originalPath, sessionId, data);
  }

  /** Validate sessionId and resolve safe file path within chain-failures directory */
  private resolveChainFailurePath(sessionId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new Error(`Invalid sessionId format: ${sessionId}`);
    }
    const dir = path.join(os.homedir(), '.hammoc', 'chain-failures');
    const filePath = path.resolve(dir, `${sessionId}.json`);
    if (!filePath.startsWith(path.resolve(dir))) {
      throw new Error(`Path traversal detected for sessionId: ${sessionId}`);
    }
    return filePath;
  }

  /**
   * Read chain failure records for a session from ~/.hammoc/chain-failures/
   */
  async readChainFailures(sessionId: string): Promise<PromptChainItem[]> {
    try {
      const filePath = this.resolveChainFailurePath(sessionId);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      if (!data || !Array.isArray(data.failures)) {
        throw new Error(`Invalid chain-failures format for session ${sessionId}`);
      }
      return data.failures as PromptChainItem[];
    } catch (err: unknown) {
      // File not found is expected (no failures recorded yet)
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return [];
      }
      // Propagate corruption / permission errors so callers can handle them
      throw err;
    }
  }

  /**
   * Write chain failure records for a session to ~/.hammoc/chain-failures/
   */
  async writeChainFailures(sessionId: string, failures: PromptChainItem[]): Promise<void> {
    const filePath = this.resolveChainFailurePath(sessionId);
    const dir = path.dirname(filePath);
    if (failures.length === 0) {
      try {
        await fs.unlink(filePath);
      } catch (err: unknown) {
        // File not found is expected; rethrow other errors (permissions, etc.)
        if (err && typeof err === 'object' && 'code' in err && err.code !== 'ENOENT') {
          throw err;
        }
      }
      return;
    }
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ failures }, null, 2), 'utf-8');
  }

  /**
   * Extract originalPath (cwd) from a .jsonl session file's first few lines.
   * Used as fallback when sessions-index.json doesn't exist (e.g., VS Code extension projects).
   * Only reads the first 4KB to avoid loading large conversation logs.
   */
  private async extractCwdFromSessionFiles(projectDir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(projectDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
      if (jsonlFiles.length === 0) return null;

      const filePath = path.join(projectDir, jsonlFiles[0]);
      const handle = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(4096);
        const { bytesRead } = await handle.read(buffer, 0, 4096, 0);
        const chunk = buffer.toString('utf-8', 0, bytesRead);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.cwd && typeof entry.cwd === 'string') {
              return entry.cwd;
            }
          } catch {
            continue; // incomplete JSON line at buffer boundary
          }
        }
      } finally {
        await handle.close();
      }
    } catch {
      // Failed to read directory or file
    }
    return null;
  }

  /**
   * Build ProjectInfo from a project directory without sessions-index.json.
   * Scans .jsonl files for session count, timestamps, and originalPath.
   */
  private async buildProjectFromDirectory(
    projectDir: string,
    projectSlug: string
  ): Promise<ProjectInfo | null> {
    const originalPath = await this.extractCwdFromSessionFiles(projectDir);
    if (!originalPath) return null;

    let sessionCount = 0;
    const mtimes: number[] = [];

    try {
      const files = await fs.readdir(projectDir);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        sessionCount++;
        const fileStat = await fs.stat(path.join(projectDir, f));
        mtimes.push(fileStat.mtime.getTime());
      }
    } catch {
      // Failed to read directory
    }

    let lastModified: string;
    if (mtimes.length > 0) {
      lastModified = new Date(Math.max(...mtimes)).toISOString();
    } else {
      const stat = await fs.stat(projectDir);
      lastModified = stat.mtime.toISOString();
    }

    const isBmadProject = await this.checkBmadProject(originalPath);
    const settings = await this.readProjectSettings(originalPath);

    return {
      originalPath,
      projectSlug,
      sessionCount,
      lastModified,
      isBmadProject,
      ...(settings.hidden !== undefined && { hidden: settings.hidden }),
    };
  }

  /**
   * Resolve a project slug to its originalPath.
   * Tries sessions-index.json first, falls back to JSONL-based discovery.
   * @throws Error with code 'PROJECT_NOT_FOUND' if project cannot be resolved
   */
  async resolveOriginalPath(projectSlug: string): Promise<string> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    let info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) {
      info = await this.buildProjectFromDirectory(projectDir, projectSlug);
    }
    if (!info) {
      const err = new Error('프로젝트를 찾을 수 없습니다.');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      throw err;
    }
    return info.originalPath;
  }

  /**
   * Get session count for a single project (lightweight, no full scan).
   * Used by dashboard to avoid expensive scanProjects() calls.
   */
  async getProjectSessionCount(projectSlug: string): Promise<number> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (info) return info.sessionCount;
    const fallback = await this.buildProjectFromDirectory(projectDir, projectSlug);
    return fallback?.sessionCount ?? 0;
  }

  /**
   * Check if a path exists on the filesystem
   * @param targetPath Path to check
   * @returns true if path exists
   */
  async checkPathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a project has .bmad-core folder
   * @param originalPath The original project path from sessions-index.json
   * @returns true if .bmad-core folder exists
   */
  async checkBmadProject(originalPath: string): Promise<boolean> {
    const bmadCorePath = path.join(originalPath, '.bmad-core');

    try {
      const stat = await fs.stat(bmadCorePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Validate a directory path
   * [Source: Story 3.6 - Task 2]
   * @param inputPath Path to validate
   * @returns Validation result
   */
  async validatePath(inputPath: string): Promise<ValidatePathResponse> {
    // Security check
    if (!isValidPathFormat(inputPath)) {
      return {
        valid: false,
        exists: false,
        isProject: false,
        error: '경로 형식이 올바르지 않습니다. 절대 경로를 사용해 주세요.',
      };
    }

    // Check if path exists
    try {
      const stat = await fs.stat(inputPath);
      if (!stat.isDirectory()) {
        return {
          valid: false,
          exists: true,
          isProject: false,
          error: '지정한 경로가 파일입니다. 디렉토리 경로를 입력해 주세요.',
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Path doesn't exist yet - valid for project creation (will be created)
        return {
          valid: true,
          exists: false,
          isProject: false,
        };
      }
      throw error;
    }

    // Check if already a project
    const existingProject = await this.findProjectByPath(inputPath);
    if (existingProject) {
      return {
        valid: true,
        exists: true,
        isProject: true,
        projectSlug: existingProject.projectSlug,
      };
    }

    // Slug collision check: does another project's path encode to the same slug?
    // e.g. "C:\Users\me\my-app" and "C:\Users-me-my\app" both encode to "C-Users-me-my-app".
    // Without this check the two would silently share one ~/.claude/projects/ directory
    // and corrupt each other's session list.
    const collision = await this.findSlugCollision(inputPath);
    if (collision) {
      return {
        valid: false,
        exists: true,
        isProject: false,
        error: `이 경로는 기존 프로젝트 "${collision.originalPath}"와 동일한 내부 디렉토리(${collision.slug})로 인코딩되어 충돌합니다. 다른 경로를 선택하세요.`,
      };
    }

    return {
      valid: true,
      exists: true,
      isProject: false,
    };
  }

  /**
   * Detect whether `inputPath` would encode to a slug already used by a different project.
   * Returns the conflicting project's info or null if no collision.
   */
  private async findSlugCollision(
    inputPath: string,
  ): Promise<{ slug: string; originalPath: string } | null> {
    const slug = inputPath.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-/, '');
    const indexPath = path.join(this.getClaudeProjectsDir(), slug, 'sessions-index.json');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content) as { originalPath?: string };
      if (!index.originalPath) return null;

      const normalizedExisting = path.normalize(index.originalPath);
      const normalizedInput = path.normalize(inputPath);
      const isSamePath =
        process.platform === 'win32'
          ? normalizedExisting.toLowerCase() === normalizedInput.toLowerCase()
          : normalizedExisting === normalizedInput;
      if (isSamePath) return null;

      return { slug, originalPath: index.originalPath };
    } catch {
      return null;
    }
  }

  /**
   * Find project by original path
   * [Source: Story 3.6 - Task 2]
   * @param originalPath Original project path
   * @returns ProjectInfo or null
   */
  async findProjectByPath(originalPath: string): Promise<ProjectInfo | null> {
    const projects = await this.scanProjects();
    // Normalize both paths for comparison (handle case sensitivity on Windows)
    const normalizedInput = path.normalize(originalPath);
    return (
      projects.find((p) => {
        const normalizedProject = path.normalize(p.originalPath);
        // Case-insensitive comparison on Windows, case-sensitive on Unix
        if (process.platform === 'win32') {
          return normalizedProject.toLowerCase() === normalizedInput.toLowerCase();
        }
        return normalizedProject === normalizedInput;
      }) || null
    );
  }

  /**
   * Create a new project
   * [Source: Story 3.6 - Task 2]
   * @param request Create project request
   * @returns Created project info
   */
  async createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    const { path: projectPath, setupBmad = true, bmadVersion } = request;

    // Validate path first
    const validation = await this.validatePath(projectPath);
    if (!validation.valid) {
      const error = new Error(validation.error || '경로 검증 실패');
      (error as NodeJS.ErrnoException).code = 'INVALID_PATH';
      throw error;
    }

    // Check if already exists
    if (validation.isProject && validation.projectSlug) {
      const existingProject = await this.findProjectByPath(projectPath);
      if (existingProject) {
        return {
          project: existingProject,
          isExisting: true,
        };
      }
    }

    // Create project directory if it doesn't exist
    if (!validation.exists) {
      await fs.mkdir(projectPath, { recursive: true });
    }

    // Initialize Claude project (creates sessions-index.json)
    await this.initializeClaudeProject(projectPath);

    // Setup BMad if requested (graceful handling: project creation succeeds even if BMad setup fails)
    let bmadSetupError: string | undefined;
    if (setupBmad) {
      try {
        const version = bmadVersion || (await this.getLatestBmadVersion());
        if (!version) {
          throw new Error('사용 가능한 BMad 버전이 없습니다.');
        }
        await this.setupBmadCore(projectPath, version);
      } catch (err) {
        bmadSetupError = err instanceof Error ? err.message : 'BMad 설정 중 오류가 발생했습니다.';
      }
    }

    // Scan to get the created project info
    const project = await this.findProjectByPath(projectPath);
    if (!project) {
      throw new Error('프로젝트 생성 후 조회에 실패했습니다.');
    }

    return {
      project,
      isExisting: false,
      bmadSetupError,
    };
  }

  /**
   * Initialize a Claude project directory
   * Creates the necessary structure in ~/.claude/projects/
   * [Source: Story 3.6 - Task 2]
   *
   * Strategy:
   * 1. Check if project already exists with this path
   * 2. Try to use Claude Code CLI for initialization
   * 3. Fallback: use same path-encoding as Claude Code
   *
   * @param projectPath Original project path
   * @returns Project slug (path-encoded or existing)
   */
  async initializeClaudeProject(projectPath: string): Promise<string> {
    // Strategy 1: Check if project already exists with this path
    const existingProject = await this.findProjectByPath(projectPath);
    if (existingProject) {
      return existingProject.projectSlug;
    }

    // Strategy 2: Try to use Claude Code CLI for initialization
    try {
      const { execSync } = await import('child_process');
      // Run a minimal Claude command in the project directory to trigger project creation
      execSync('claude --version', {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 5000,
      });

      // After CLI execution, scan again to find the newly created project
      // Wait briefly for filesystem sync
      await new Promise((resolve) => setTimeout(resolve, 100));
      const newProject = await this.findProjectByPath(projectPath);
      if (newProject) {
        return newProject.projectSlug;
      }
    } catch {
      // CLI not available or failed - fall back to self-generation
      log.warn('Claude CLI not available, using fallback path-encoding');
    }

    // Strategy 3: Fallback - use same path-encoding as Claude Code
    // Claude Code encodes project paths by replacing all non-alphanumeric chars (except -) with hyphens.
    // This must match the SDK's encoding exactly, otherwise the Hammoc-created directory will diverge
    // from where the SDK writes JSONL files, causing sessions-index.json to never update.
    const projectSlug = projectPath.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-/, '');

    const claudeProjectDir = path.join(this.getClaudeProjectsDir(), projectSlug);

    // Create directory if not exists
    await fs.mkdir(claudeProjectDir, { recursive: true });

    // Create sessions-index.json
    const sessionsIndexPath = path.join(claudeProjectDir, 'sessions-index.json');

    if (!existsSync(sessionsIndexPath)) {
      const sessionsIndex = {
        originalPath: projectPath,
        entries: [],
        _generatedBy: 'hammoc',
        _warning: 'This project was created without Claude CLI and may not be fully compatible',
      };
      await fs.writeFile(sessionsIndexPath, JSON.stringify(sessionsIndex, null, 2));
    }

    // Note: Claude Code stores session JSONL files directly in the project folder,
    // not in a sessions subdirectory, so we don't create one here.

    return projectSlug;
  }

  /**
   * Get list of available BMad method versions from bundled resources
   * @returns Array of version strings sorted descending (latest first)
   */
  async getBmadVersions(): Promise<string[]> {
    try {
      const entries = await fs.readdir(BMAD_RESOURCES_DIR);
      const versions: string[] = [];
      for (const entry of entries) {
        const stat = await fs.stat(path.join(BMAD_RESOURCES_DIR, entry));
        if (stat.isDirectory()) {
          versions.push(entry);
        }
      }
      // Sort by semver descending (latest first)
      versions.sort((a, b) => {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const diff = (partsB[i] || 0) - (partsA[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      });
      return versions;
    } catch {
      return [];
    }
  }

  /**
   * Get the latest available BMad method version
   * @returns Latest version string or null if none available
   */
  async getLatestBmadVersion(): Promise<string | null> {
    const versions = await this.getBmadVersions();
    return versions[0] || null;
  }

  /**
   * Setup .bmad-core folder in project by copying from bundled template
   * Copies the full BMad method content (agents, tasks, templates, workflows, etc.)
   * @param projectPath Project directory path
   * @param version BMad method version to install
   */
  async setupBmadCore(projectPath: string, version: string): Promise<void> {
    const templateDir = path.join(BMAD_RESOURCES_DIR, version);

    // Validate the version exists
    try {
      await fs.access(templateDir);
    } catch {
      throw new Error(`BMad 버전 ${version}을 찾을 수 없습니다.`);
    }

    // Recursively copy template to project
    await this.copyDirRecursive(templateDir, projectPath);
  }

  /**
   * Setup BMad for an existing project by slug
   * @param projectSlug Project slug (folder name in ~/.claude/projects/)
   * @param version BMad version to install (defaults to latest)
   * @param force Force setup even if project already has .bmad-core
   * @returns Object with updated ProjectInfo and installed version
   */
  async setupBmadForProject(
    projectSlug: string,
    version?: string,
    force?: boolean
  ): Promise<{ project: ProjectInfo; installedVersion: string }> {
    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);
    const info = await this.parseSessionsIndex(projectDir, projectSlug);
    if (!info) {
      const err = new Error('프로젝트를 찾을 수 없습니다.');
      (err as NodeJS.ErrnoException).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    if (info.isBmadProject && !force) {
      const err = new Error('이미 BMad가 설정된 프로젝트입니다.');
      (err as NodeJS.ErrnoException).code = 'ALREADY_BMAD';
      throw err;
    }

    const resolvedVersion = version || await this.getLatestBmadVersion();
    if (!resolvedVersion) {
      const err = new Error('사용 가능한 BMad 버전이 없습니다.');
      (err as NodeJS.ErrnoException).code = 'NO_BMAD_VERSION';
      throw err;
    }

    await this.setupBmadCore(info.originalPath, resolvedVersion);
    return { project: { ...info, isBmadProject: true }, installedVersion: resolvedVersion };
  }

  /**
   * Delete a project's session data from ~/.claude/projects/
   * Optionally also deletes the actual project files on disk.
   * @param projectSlug Project slug (folder name in ~/.claude/projects/)
   * @param deleteFiles If true, also delete the project directory on disk
   * @returns true if deleted successfully
   */
  async deleteProject(projectSlug: string, deleteFiles = false): Promise<boolean> {
    if (!projectSlug || projectSlug.includes('..') || projectSlug.includes('/') || projectSlug.includes('\\')) {
      return false;
    }

    const projectDir = path.join(this.getClaudeProjectsDir(), projectSlug);

    // Read originalPath before deleting session data (needed for file deletion)
    let originalPath: string | undefined;
    if (deleteFiles) {
      const indexPath = path.join(projectDir, 'sessions-index.json');
      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const index = JSON.parse(content);
        originalPath = index.originalPath || index.entries?.[0]?.projectPath;
      } catch {
        // Can't read originalPath — skip file deletion
      }
    }

    try {
      const stat = await fs.stat(projectDir);
      if (!stat.isDirectory()) {
        return false;
      }
    } catch {
      return false;
    }

    // Delete session data
    await fs.rm(projectDir, { recursive: true, force: true });

    // Delete project files on disk if requested
    if (deleteFiles && originalPath) {
      try {
        await fs.rm(originalPath, { recursive: true, force: true });
      } catch {
        // Session data already deleted, log but don't fail
        log.warn(`Failed to delete project files at: ${originalPath}`);
      }
    }

    return true;
  }

  /**
   * Recursively copy directory contents from source to destination
   * Preserves directory structure. Does not overwrite existing files.
   * @param src Source directory path
   * @param dest Destination directory path
   */
  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcPath, destPath);
      } else {
        // Do not overwrite existing files
        if (!existsSync(destPath)) {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }
  }
}

// Singleton export - consistent with authService pattern
export const projectService = new ProjectService();
