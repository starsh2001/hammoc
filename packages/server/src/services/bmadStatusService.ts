import fs from 'fs/promises';
import { open } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type {
  BmadConfig,
  BmadStatusResponse,
  BmadDocuments,
  BmadSupplementaryDoc,
  BmadAuxDocument,
  BmadEpicStatus,
  BmadStoryStatus,
  DirEntry,
} from '@bmad-studio/shared';

/**
 * Matches epic headers in various Markdown formats:
 *   # Epic 1: Name           (h1)
 *   ## Epic 1: Name          (h2)
 *   ### Epic 1: Name         (h3)
 *   # 6. Epic 1: Name        (numbered prefix)
 *   ## Epic 1 - Name         (dash separator)
 *   ## Epic 1 Name            (no separator)
 *   Epic 1: Name              (plain text, no heading prefix)
 * Capture groups: (1) epic number, (2) epic name
 */
const EPIC_HEADER_RE = /^(?:#{1,3}\s+)?(?:\d+\.\s+)?Epic\s+(\d+)[\s:–-]+(.+)/m;

class BmadStatusService {
  /**
   * Scan a BMad project and return its status.
   * @param projectRoot Absolute path to the project root
   * @returns BmadStatusResponse
   * @throws Error with code 'NOT_BMAD_PROJECT' if .bmad-core/core-config.yaml not found
   * @throws Error with code 'CONFIG_PARSE_ERROR' if YAML parsing fails
   */
  async scanProject(projectRoot: string): Promise<BmadStatusResponse> {
    const config = await this.parseConfig(projectRoot);
    const documents = await this.checkDocuments(projectRoot, config);
    const auxiliaryDocuments = await this.scanAuxiliaryDocuments(projectRoot, config);
    const epics = await this.scanEpicsAndStories(projectRoot, config);

    return { config, documents, auxiliaryDocuments, epics };
  }

  /**
   * Parse .bmad-core/core-config.yaml
   */
  private async parseConfig(projectRoot: string): Promise<BmadConfig> {
    const configPath = path.join(projectRoot, '.bmad-core', 'core-config.yaml');

    let content: string;
    try {
      content = await fs.readFile(configPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const err = new Error('BMad 프로젝트가 아닙니다. (.bmad-core/core-config.yaml 없음)');
        (err as NodeJS.ErrnoException).code = 'NOT_BMAD_PROJECT';
        throw err;
      }
      // File exists but can't be read (locked, permissions, etc.) — re-throw original
      throw error;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = yaml.load(content) as Record<string, unknown>;
    } catch {
      const err = new Error('core-config.yaml 파싱 중 오류가 발생했습니다.');
      (err as NodeJS.ErrnoException).code = 'CONFIG_PARSE_ERROR';
      throw err;
    }

    const prd = parsed.prd as Record<string, unknown> | undefined;
    const architecture = parsed.architecture as Record<string, unknown> | undefined;
    const qa = parsed.qa as Record<string, unknown> | undefined;

    return {
      prdFile: prd?.prdFile as string | undefined,
      prdSharded: prd?.prdSharded as boolean | undefined,
      prdShardedLocation: prd?.prdShardedLocation as string | undefined,
      epicFilePattern: prd?.epicFilePattern as string | undefined,
      architectureFile: architecture?.architectureFile as string | undefined,
      architectureSharded: architecture?.architectureSharded as boolean | undefined,
      architectureShardedLocation: architecture?.architectureShardedLocation as string | undefined,
      devStoryLocation: parsed.devStoryLocation as string | undefined,
      qaLocation: qa?.qaLocation as string | undefined,
    };
  }

  /** Well-known supplementary documents to check for in docs/ */
  private static readonly SUPPLEMENTARY_DOCS: Array<{ key: string; label: string; file: string }> = [
    { key: 'brainstorming', label: 'Brainstorming', file: 'docs/brainstorming-session-results.md' },
    { key: 'market-research', label: 'Market Research', file: 'docs/market-research.md' },
    { key: 'competitor-analysis', label: 'Competitor Analysis', file: 'docs/competitor-analysis.md' },
    { key: 'brief', label: 'Project Brief', file: 'docs/brief.md' },
    { key: 'front-end-spec', label: 'Frontend Spec', file: 'docs/front-end-spec.md' },
    { key: 'ui-architecture', label: 'UI Architecture', file: 'docs/ui-architecture.md' },
  ];

  /**
   * Check PRD, Architecture, and well-known supplementary documents.
   * For sharded documents, checks both the consolidated file and the sharded folder.
   */
  private async checkDocuments(projectRoot: string, config: BmadConfig): Promise<BmadDocuments> {
    const prdFile = config.prdFile || 'docs/prd.md';
    const prdShardedDir = config.prdShardedLocation || 'docs/prd';
    const archFile = config.architectureFile || 'docs/architecture.md';
    const archShardedDir = config.architectureShardedLocation || 'docs/architecture';

    const [prdFileExists, prdShardedExists, archFileExists, archShardedExists] = await Promise.all([
      this.pathExists(path.join(projectRoot, prdFile)),
      config.prdSharded ? this.pathExists(path.join(projectRoot, prdShardedDir)) : Promise.resolve(false),
      this.pathExists(path.join(projectRoot, archFile)),
      config.architectureSharded ? this.pathExists(path.join(projectRoot, archShardedDir)) : Promise.resolve(false),
    ]);

    // Scan well-known supplementary documents (always return all, preserving definition order)
    const supplementary: BmadSupplementaryDoc[] = await Promise.all(
      BmadStatusService.SUPPLEMENTARY_DOCS.map(async (doc) => {
        const exists = await this.pathExists(path.join(projectRoot, doc.file));
        return { key: doc.key, label: doc.label, exists, path: doc.file };
      }),
    );

    // Collect file lists for sharded directories
    const [prdShardedFiles, archShardedFiles] = await Promise.all([
      prdShardedExists ? this.listEntries(path.join(projectRoot, prdShardedDir), /\.md$/) : Promise.resolve(undefined),
      archShardedExists ? this.listEntries(path.join(projectRoot, archShardedDir), /\.md$/) : Promise.resolve(undefined),
    ]);

    return {
      prd: {
        exists: prdFileExists || prdShardedExists,
        path: prdFile,
        ...(config.prdSharded && { sharded: true, shardedPath: prdShardedDir }),
        ...(prdShardedFiles && { shardedFiles: prdShardedFiles }),
      },
      architecture: {
        exists: archFileExists || archShardedExists,
        path: archFile,
        ...(config.architectureSharded && { sharded: true, shardedPath: archShardedDir }),
        ...(archShardedFiles && { shardedFiles: archShardedFiles }),
      },
      supplementary,
    };
  }

  /**
   * Scan auxiliary documents (stories, qa directories)
   */
  private async scanAuxiliaryDocuments(
    projectRoot: string,
    config: BmadConfig
  ): Promise<BmadAuxDocument[]> {
    const auxDocs: BmadAuxDocument[] = [];

    if (config.devStoryLocation) {
      const storyFiles = await this.listEntries(
        path.join(projectRoot, config.devStoryLocation),
        /^\d+\.\d+\..+\.md$/
      );
      auxDocs.push({
        type: 'stories',
        path: config.devStoryLocation,
        fileCount: this.countEntryFiles(storyFiles),
        ...(storyFiles && { files: storyFiles }),
      });
    }

    if (config.qaLocation) {
      const qaFiles = await this.listEntries(path.join(projectRoot, config.qaLocation));
      auxDocs.push({
        type: 'qa',
        path: config.qaLocation,
        fileCount: this.countEntryFiles(qaFiles),
        ...(qaFiles && { files: qaFiles }),
      });
    }

    return auxDocs;
  }

  /**
   * Scan epic definitions and story files with status extraction
   */
  private async scanEpicsAndStories(
    projectRoot: string,
    config: BmadConfig
  ): Promise<BmadEpicStatus[]> {
    const epicMap = new Map<number, string>();
    // Planned story count from PRD epic headers (## Story N.N / ### Story N.N)
    const plannedMap = new Map<number, Set<string>>();
    // Track which file each epic was found in (project-relative path)
    const epicFileMap = new Map<number, string>();

    // 3-step fallback strategy for epic discovery
    if (config.prdSharded && config.prdShardedLocation) {
      // Step 1: Search for epic files using epicFilePattern
      // Uses substring match to tolerate numeric prefixes (e.g. "6-epic-1-foo.md")
      if (config.epicFilePattern) {
        const pattern = this.epicFilePatternToRegex(config.epicFilePattern);
        const shardedDir = path.join(projectRoot, config.prdShardedLocation);
        try {
          const files = await fs.readdir(shardedDir);
          for (const file of files) {
            const match = file.match(pattern);
            if (match) {
              const epicNum = parseInt(match[1], 10);
              const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
              const nameMatch = content.match(EPIC_HEADER_RE);
              epicMap.set(epicNum, nameMatch ? nameMatch[2].trim() : `Epic ${epicNum}`);
              epicFileMap.set(epicNum, `${config.prdShardedLocation}/${file}`);
              this.countPlannedStories(content, plannedMap, epicNum);
            }
          }
        } catch {
          // Directory not found, fall through to step 2
        }
      }

      // Step 2: Scan all .md files for epic headers to fill gaps
      // Always run — Step 1 may only find some epics (e.g. epic-20, 21, 22)
      // while others (1–19) are defined in PRD shard files like 6-epic-details.md
      {
        const shardedDir = path.join(projectRoot, config.prdShardedLocation);
        // Track files already scanned in Step 1 to avoid double-counting planned stories
        const scannedFiles = new Set<string>();
        if (config.epicFilePattern) {
          const pattern = this.epicFilePatternToRegex(config.epicFilePattern);
          try {
            const files = await fs.readdir(shardedDir);
            for (const file of files) {
              if (file.match(pattern)) scannedFiles.add(file);
            }
          } catch { /* ignore */ }
        }
        try {
          const files = await fs.readdir(shardedDir);
          for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
            const regex = new RegExp(EPIC_HEADER_RE.source, 'gm');
            let match;
            const epicsInFile: number[] = [];
            while ((match = regex.exec(content)) !== null) {
              const epicNum = parseInt(match[1], 10);
              epicsInFile.push(epicNum);
              // Don't overwrite epics found in dedicated files (Step 1)
              if (!epicMap.has(epicNum)) {
                epicMap.set(epicNum, match[2].trim());
                epicFileMap.set(epicNum, `${config.prdShardedLocation}/${file}`);
              }
            }
            // Only count planned stories for files not already scanned in Step 1
            if (!scannedFiles.has(file)) {
              // Pass epic context for single-epic files so standalone "Story N" headers are counted
              const epicContext = epicsInFile.length === 1 ? epicsInFile[0] : undefined;
              this.countPlannedStories(content, plannedMap, epicContext);
            }
          }
        } catch {
          // Directory not found
        }
      }
    } else if (config.prdFile) {
      // Step 3: Monolithic PRD
      try {
        const content = await fs.readFile(path.join(projectRoot, config.prdFile), 'utf-8');
        const regex = new RegExp(EPIC_HEADER_RE.source, 'gm');
        let match;
        while ((match = regex.exec(content)) !== null) {
          const epicNum = parseInt(match[1], 10);
          epicMap.set(epicNum, match[2].trim());
          epicFileMap.set(epicNum, config.prdFile);
        }
        this.countPlannedStories(content, plannedMap);
      } catch {
        // File not found
      }
    }

    // Scan story files
    const storyMap = new Map<number, BmadStoryStatus[]>();
    if (config.devStoryLocation) {
      const storiesDir = path.join(projectRoot, config.devStoryLocation);
      try {
        const files = await fs.readdir(storiesDir);
        // Match story files: "1.1.story.md", "1.1.some-name.story.md",
        // or "2.1.kis-api-auth.md" (no ".story" suffix)
        const storyFileRegex = /^(\d+)\.(\d+)\..+\.md$/;

        for (const file of files) {
          const match = file.match(storyFileRegex);
          if (match) {
            const epicNum = parseInt(match[1], 10);
            const meta = await this.extractStoryMeta(path.join(storiesDir, file));
            const stories = storyMap.get(epicNum) || [];
            stories.push({ file, status: meta.status, ...(meta.title && { title: meta.title }) });
            storyMap.set(epicNum, stories);
          }
        }
      } catch {
        // Directory not found
      }
    }

    // Merge: ensure epics from storyMap appear even if not in epicMap
    for (const epicNum of storyMap.keys()) {
      if (!epicMap.has(epicNum)) {
        epicMap.set(epicNum, `Epic ${epicNum}`);
      }
    }

    // Build sorted result
    const epics: BmadEpicStatus[] = Array.from(epicMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([number, name]) => ({
        number,
        name,
        stories: (storyMap.get(number) || []).sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true })),
        ...(plannedMap.has(number) && { plannedStories: plannedMap.get(number)!.size }),
        ...(epicFileMap.has(number) && { filePath: epicFileMap.get(number) }),
      }));

    return epics;
  }

  /**
   * Collect planned story identifiers from PRD content by matching story headers.
   * Matches: "## Story 3.1: ...", "### Story 3.1: ...", "## Story 3.1 — ..."
   * Also matches standalone format: "### Story 1: ..." when epicContext is provided.
   * Uses a Set per epic to deduplicate stories that appear in multiple files.
   */
  private countPlannedStories(content: string, plannedMap: Map<number, Set<string>>, epicContext?: number): void {
    const regex = /^#{2,3}\s+Story\s+(\d+(?:\.\d+)?)/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const rawId = match[1];
      let epicNum: number;
      let storyId: string;

      if (rawId.includes('.')) {
        // Dotted format: "Story 3.1" → epic 3, story "3.1"
        storyId = rawId;
        epicNum = parseInt(rawId.split('.')[0], 10);
      } else if (epicContext != null) {
        // Standalone format: "Story 1" in an epic-specific file → "epicContext.rawId"
        storyId = `${epicContext}.${rawId}`;
        epicNum = epicContext;
      } else {
        // Standalone without context — can't determine epic, skip
        continue;
      }

      if (!plannedMap.has(epicNum)) {
        plannedMap.set(epicNum, new Set());
      }
      plannedMap.get(epicNum)!.add(storyId);
    }
  }

  /**
   * Extract Status field from a story file header.
   * Reads only the first 500 bytes for performance.
   */
  private async extractStoryMeta(filePath: string): Promise<{ status: string; title?: string }> {
    let header: string;
    try {
      const fh = await open(filePath, 'r');
      try {
        const buf = Buffer.alloc(500);
        const { bytesRead } = await fh.read(buf, 0, 500, 0);
        header = buf.subarray(0, bytesRead).toString('utf-8');
      } finally {
        await fh.close();
      }
    } catch {
      return { status: 'Unknown' };
    }

    // Match status in multiple formats:
    //   1. "## Status\n\nDone"       (heading + blank line + value)
    //   2. "## Status\nDone"         (heading + value, no blank line)
    //   3. "## Status: Done"         (heading with inline value)
    //   4. "Status: Done"            (key-value, no heading)
    //   5. "**Status:** Done"        (bold key-value)
    const statusMatch =
      header.match(/^## Status\s*\n\s*\n\s*(.+)/m) ||      // format 1
      header.match(/^## Status\s*\n\s*([^\n#].+)/m) ||      // format 2
      header.match(/^## Status\s*:\s*(.+)/m) ||              // format 3
      header.match(/^\*{0,2}Status\*{0,2}\s*:\s*(.+)/m);    // format 4 & 5
    const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

    // Match: "# Story 1.1: Title" or "# Story 1.1 — Title"
    const titleMatch = header.match(/^#\s+Story\s+\d+\.\d+[:\s–-]+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    return { status, title };
  }

  /**
   * Convert epicFilePattern like "epic-{n}*.md" to a regex.
   * Allows optional numeric prefix (e.g. "6-epic-1-foo.md" matches "epic-{n}*.md").
   */
  private epicFilePatternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{n\\\}/g, '(\\d+)')
      .replace(/\*/g, '.*');
    // Allow optional leading "digits-" prefix before the pattern
    return new RegExp(`^(?:\\d+-)?${escaped}$`);
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private async countFiles(dirPath: string, filter?: RegExp): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath);
      if (filter) {
        return entries.filter((e) => filter.test(e)).length;
      }
      return entries.length;
    } catch {
      return 0;
    }
  }

  /** Count only files (non-directory entries) recursively */
  private countEntryFiles(entries: DirEntry[] | undefined): number {
    if (!entries) return 0;
    let count = 0;
    for (const e of entries) {
      if (e.isDir) {
        count += this.countEntryFiles(e.children);
      } else {
        count++;
      }
    }
    return count;
  }

  /** List directory entries (files + sub-directories). Optionally filter files by regex. */
  private async listEntries(dirPath: string, filter?: RegExp): Promise<DirEntry[] | undefined> {
    try {
      const names = await fs.readdir(dirPath);
      const sorted = names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const results: DirEntry[] = [];
      for (const name of sorted) {
        const fullPath = path.join(dirPath, name);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            const children = await this.listEntries(fullPath);
            results.push({ name, isDir: true, children: children ?? [] });
          } else if (!filter || filter.test(name)) {
            results.push({ name });
          }
        } catch {
          // skip entries we can't stat
        }
      }
      return results;
    } catch {
      return undefined;
    }
  }
}

export const bmadStatusService = new BmadStatusService();
