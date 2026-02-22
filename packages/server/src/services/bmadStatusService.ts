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
} from '@bmad-studio/shared';

/**
 * Matches epic headers in various Markdown formats:
 *   # Epic 1: Name           (h1)
 *   ## Epic 1: Name          (h2)
 *   ### Epic 1: Name         (h3)
 *   # 6. Epic 1: Name        (numbered prefix)
 *   ## Epic 1 - Name         (dash separator)
 *   ## Epic 1 Name            (no separator)
 * Capture groups: (1) epic number, (2) epic name
 */
const EPIC_HEADER_RE = /^#{1,3}\s+(?:\d+\.\s+)?Epic\s+(\d+)[\s:–-]+(.+)/m;

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
    } catch {
      const err = new Error('BMad 프로젝트가 아닙니다. (.bmad-core/core-config.yaml 없음)');
      (err as NodeJS.ErrnoException).code = 'NOT_BMAD_PROJECT';
      throw err;
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

    return {
      prd: {
        exists: prdFileExists || prdShardedExists,
        path: prdFile,
        ...(config.prdSharded && { sharded: true, shardedPath: prdShardedDir }),
      },
      architecture: {
        exists: archFileExists || archShardedExists,
        path: archFile,
        ...(config.architectureSharded && { sharded: true, shardedPath: archShardedDir }),
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
      // Count files matching N.N.*.md pattern (story files)
      const count = await this.countFiles(
        path.join(projectRoot, config.devStoryLocation),
        /^\d+\.\d+\..+\.md$/
      );
      auxDocs.push({ type: 'stories', path: config.devStoryLocation, fileCount: count });
    }

    if (config.qaLocation) {
      const count = await this.countFiles(path.join(projectRoot, config.qaLocation));
      auxDocs.push({ type: 'qa', path: config.qaLocation, fileCount: count });
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
    const plannedMap = new Map<number, number>();

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
              this.countPlannedStories(content, plannedMap);
            }
          }
        } catch {
          // Directory not found, fall through to step 2
        }
      }

      // Step 2: Fallback - scan all .md files for epic headers
      if (epicMap.size === 0) {
        const shardedDir = path.join(projectRoot, config.prdShardedLocation);
        try {
          const files = await fs.readdir(shardedDir);
          for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const content = await fs.readFile(path.join(shardedDir, file), 'utf-8');
            const regex = new RegExp(EPIC_HEADER_RE.source, 'gm');
            let match;
            while ((match = regex.exec(content)) !== null) {
              epicMap.set(parseInt(match[1], 10), match[2].trim());
            }
            this.countPlannedStories(content, plannedMap);
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
          epicMap.set(parseInt(match[1], 10), match[2].trim());
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
            const status = await this.extractStoryStatus(path.join(storiesDir, file));
            const stories = storyMap.get(epicNum) || [];
            stories.push({ file, status });
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
        stories: (storyMap.get(number) || []).sort((a, b) => a.file.localeCompare(b.file)),
        ...(plannedMap.has(number) && { plannedStories: plannedMap.get(number) }),
      }));

    return epics;
  }

  /**
   * Count planned stories from PRD content by matching story headers.
   * Matches: "## Story 3.1: ...", "### Story 3.1: ...", "## Story 3.1 — ..."
   * Accumulates counts into the provided map keyed by epic number.
   */
  private countPlannedStories(content: string, plannedMap: Map<number, number>): void {
    const regex = /^#{2,3}\s+Story\s+(\d+)\.\d+/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const epicNum = parseInt(match[1], 10);
      plannedMap.set(epicNum, (plannedMap.get(epicNum) || 0) + 1);
    }
  }

  /**
   * Extract Status field from a story file header.
   * Reads only the first 500 bytes for performance.
   */
  private async extractStoryStatus(filePath: string): Promise<string> {
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
      return 'Unknown';
    }

    const match = header.match(/^## Status\s*\n\s*\n\s*(.+)/m);
    return match ? match[1].trim() : 'Unknown';
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
}

export const bmadStatusService = new BmadStatusService();
