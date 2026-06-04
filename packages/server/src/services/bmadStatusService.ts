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
  GateParseError,
} from '@hammoc/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('bmadStatusService');

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
    const { epics, gateParseErrors } = await this.scanEpicsAndStories(projectRoot, config);

    return {
      config,
      documents,
      auxiliaryDocuments,
      epics,
      ...(gateParseErrors.length > 0 && { gateParseErrors }),
    };
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
  ): Promise<{ epics: BmadEpicStatus[]; gateParseErrors: GateParseError[] }> {
    const gateParseErrors: GateParseError[] = [];
    const epicMap = new Map<number | string, string>();
    // Planned story count from PRD epic headers (## Story N.N / ### Story N.N)
    const plannedMap = new Map<number | string, Set<string>>();
    // Track which file each epic was found in (project-relative path)
    const epicFileMap = new Map<number | string, string>();

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
    const storyMap = new Map<number | string, BmadStoryStatus[]>();
    // Per-story qa-fix markers: maps story file → all markers found, each with
    // the gate identifier (the gate's `updated` value) it references and whether
    // it is an applied fix (Dev) or a needed fix (QA). Compared against the
    // current gate below to derive gateFixState — no mtime guesswork.
    const qaFixMarkersByFile = new Map<string, Array<{ gate: string; applied: boolean }>>();
    if (config.devStoryLocation) {
      const storiesDir = path.join(projectRoot, config.devStoryLocation);
      try {
        const files = await fs.readdir(storiesDir);
        // Match story files: "1.1.story.md", "1.1.some-name.story.md",
        // or "2.1.kis-api-auth.md" (no ".story" suffix)
        const storyFileRegex = /^(\d+)\.(\d+)\..+\.md$/;
        // Backlog standalone stories: "BS-1.some-name.md"
        const bfStandaloneRegex = /^BS-(\d+)\..+\.md$/;

        for (const file of files) {
          let epicKey: number | string;
          let match = file.match(storyFileRegex);
          if (match) {
            epicKey = parseInt(match[1], 10);
          } else if ((match = file.match(bfStandaloneRegex))) {
            epicKey = 'BS';
          } else {
            continue;
          }
          const storyPath = path.join(storiesDir, file);
          const meta = await this.extractStoryMeta(storyPath);
          const markers = await this.extractQaFixMarkers(storyPath);
          if (markers.length > 0) qaFixMarkersByFile.set(file, markers);
          const stories = storyMap.get(epicKey) || [];
          stories.push({ file, status: meta.status, ...(meta.title && { title: meta.title }) });
          storyMap.set(epicKey, stories);
        }
      } catch {
        // Directory not found
      }
    }

    // Scan QA gate files to determine gate decisions per story
    // Gate files: qaLocation/gates/{epic}.{story}-{slug}.yml
    // Parse YAML to read the `gate` field (PASS|CONCERNS|FAIL|WAIVED)
    // When multiple gate files exist for the same story, use the newest one (by file mtime)
    const gateResults = new Map<string, { gate: string; updated?: string }>();
    if (config.qaLocation) {
      const gatesDir = path.join(projectRoot, config.qaLocation, 'gates');
      try {
        const gateFiles = await fs.readdir(gatesDir);
        // Group gate files by story number, keeping the newest
        const latestGatePerStory = new Map<string, { file: string; mtime: number }>();
        for (const gf of gateFiles) {
          // Match regular (1.1-slug.yml) or standalone (BS-1-slug.yml)
          // Story id may have an optional patch segment (e.g. 28.0.5 for inserted prerequisite stories)
          const gateMatch = gf.match(/^(\d+\.\d+(?:\.\d+)?|BS-\d+)-.*\.yml$/);
          if (!gateMatch) continue;
          const storyId = gateMatch[1];
          try {
            const stat = await fs.stat(path.join(gatesDir, gf));
            const existing = latestGatePerStory.get(storyId);
            if (!existing || stat.mtimeMs > existing.mtime) {
              latestGatePerStory.set(storyId, { file: gf, mtime: stat.mtimeMs });
            }
          } catch {
            // Skip unreadable gate files
          }
        }
        // Read each latest gate file and store decision
        for (const [storyId, { file }] of latestGatePerStory) {
          try {
            const content = await fs.readFile(path.join(gatesDir, file), 'utf-8');
            const parsed = yaml.load(content) as Record<string, unknown> | null;
            const gate = (typeof parsed?.gate === 'string') ? parsed.gate.trim().toUpperCase() : '';
            // `updated` is the gate's identity for marker matching. Stored as-is
            // (string compare); when QA re-reviews it changes, invalidating any
            // stale qa-fix marker that pointed at the previous gate.
            const updated = (typeof parsed?.updated === 'string') ? parsed.updated.trim() : undefined;
            if (gate) {
              gateResults.set(storyId, { gate, updated });
            }
          } catch (err) {
            // Skip unparseable gate files but warn so the operator can spot a
            // malformed YAML (e.g. unescaped quotes) instead of silently missing
            // the gate decision. Also collect it so the UI can show a banner —
            // an unparseable gate is treated as "no gate" and silently misroutes
            // the next-step recommendation.
            const message = (err as Error)?.message ?? String(err);
            log.warn(
              `Failed to parse QA gate file ${file} (story ${storyId}); ` +
              `gate decision will be missing in the overview. Reason: ${message}`,
            );
            gateParseErrors.push({ file, storyId, message });
          }
        }
      } catch (err: unknown) {
        // Only suppress ENOENT (directory not found); propagate other errors
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
      }
    }

    // Apply gate results to stories. We do NOT infer fix state from file mtime —
    // that heuristic mis-fired because review-story writes the story (QA Results)
    // after the gate, making a freshly-reviewed story look stale. Instead, QA and
    // Dev leave explicit markers recording which gate they relate to (the gate's
    // `updated` value); gateFixState is derived by matching them against the
    // CURRENT gate, so a later re-review (new `updated`) invalidates stale markers.
    for (const stories of storyMap.values()) {
      for (const story of stories) {
        // Match regular (1.1), patch-versioned (28.0.5), or standalone (BS-1) story IDs
        const num = story.file.match(/^(\d+\.\d+(?:\.\d+)?)/)?.[1]
          ?? story.file.match(/^(BS-\d+)/)?.[1];
        if (!num) continue;
        const gateInfo = gateResults.get(num);
        if (!gateInfo) continue;
        story.gateResult = gateInfo.gate;
        // Derive gateFixState from markers referencing the CURRENT gate. An
        // 'applied' marker (Dev) wins over a 'needed' marker (QA) for the same
        // gate. No marker for the current gate → undefined → UI shows both actions.
        if (gateInfo.updated !== undefined) {
          const forThisGate = (qaFixMarkersByFile.get(story.file) ?? []).filter((mk) => mk.gate === gateInfo.updated);
          if (forThisGate.some((mk) => mk.applied)) {
            story.gateFixState = 'applied';
          } else if (forThisGate.length > 0) {
            story.gateFixState = 'needed';
          }
        }
      }
    }

    // Merge: ensure epics from storyMap appear even if not in epicMap
    for (const epicKey of storyMap.keys()) {
      if (!epicMap.has(epicKey)) {
        if (epicKey === 'BS') {
          epicMap.set(epicKey, 'Standalone Stories');
        } else {
          epicMap.set(epicKey, `Epic ${epicKey}`);
        }
      }
    }

    // Build sorted result: regular epics first (numeric sort), then BS
    const epics: BmadEpicStatus[] = Array.from(epicMap.entries())
      .sort((a, b) => {
        const aIsNum = typeof a[0] === 'number';
        const bIsNum = typeof b[0] === 'number';
        if (aIsNum && bIsNum) return (a[0] as number) - (b[0] as number);
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        // BS always goes last
        if (a[0] === 'BS') return 1;
        if (b[0] === 'BS') return -1;
        return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
      })
      .map(([number, name]) => ({
        number,
        name,
        stories: (storyMap.get(number) || []).sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true })),
        ...(plannedMap.has(number) && { plannedStories: plannedMap.get(number)!.size }),
        ...(epicFileMap.has(number) && { filePath: epicFileMap.get(number) }),
      }));

    return { epics, gateParseErrors };
  }

  /**
   * Collect planned story identifiers from PRD content by matching story headers.
   * Matches: "## Story 3.1: ...", "### Story 3.1: ...", "## Story 3.1 — ..."
   * Also matches standalone format: "### Story 1: ..." when epicContext is provided.
   * Uses a Set per epic to deduplicate stories that appear in multiple files.
   */
  private countPlannedStories(content: string, plannedMap: Map<number | string, Set<string>>, epicContext?: number | string): void {
    // Match regular stories: "Story 3.1", "Story 1"
    const regex = /^#{2,3}\s+Story\s+(\d+(?:\.\d+)?)/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const rawId = match[1];
      let epicKey: number | string;
      let storyId: string;

      if (rawId.includes('.')) {
        // Dotted format: "Story 3.1" → epic 3, story "3.1"
        storyId = rawId;
        epicKey = parseInt(rawId.split('.')[0], 10);
      } else if (epicContext != null) {
        // Standalone format: "Story 1" in an epic-specific file → "epicContext.rawId"
        storyId = `${epicContext}.${rawId}`;
        epicKey = epicContext;
      } else {
        // Standalone without context — can't determine epic, skip
        continue;
      }

      if (!plannedMap.has(epicKey)) {
        plannedMap.set(epicKey, new Set());
      }
      plannedMap.get(epicKey)!.add(storyId);
    }

  }

  /**
   * Extract Status and title from a story file header.
   * Reads line-by-line up to MAX_LINES so long Markdown blockquotes
   * (e.g. multi-paragraph "status journey" notes in CJK text where each
   * char is 3 bytes in UTF-8) cannot push the Status heading past a
   * fixed byte buffer. Blockquote lines are skipped so a `> **Status ...`
   * note never shadows the real `## Status` heading.
   */
  private async extractStoryMeta(filePath: string): Promise<{ status: string; title?: string }> {
    const MAX_LINES = 200;
    let status = 'Unknown';
    let title: string | undefined;
    let awaitingStatusValue = false;
    let linesRead = 0;

    let fh: Awaited<ReturnType<typeof open>>;
    try {
      fh = await open(filePath, 'r');
    } catch {
      return { status: 'Unknown' };
    }

    try {
      for await (const rawLine of fh.readLines({ encoding: 'utf-8' })) {
        if (++linesRead > MAX_LINES) break;
        const line = rawLine.replace(/\r$/, '');

        // Skip Markdown blockquote lines so prose mentioning "Status" does
        // not shadow the real heading.
        if (/^\s*>/.test(line)) continue;

        if (awaitingStatusValue) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Stop hunting if we hit another heading before a value (malformed file)
          if (trimmed.startsWith('#')) {
            awaitingStatusValue = false;
            continue;
          }
          status = trimmed;
          awaitingStatusValue = false;
          if (title) break;
          continue;
        }

        // Format 3: "## Status: Done"
        const inlineHeading = line.match(/^## Status\s*:\s*(.+)/);
        if (inlineHeading) {
          status = inlineHeading[1].trim();
          if (title) break;
          continue;
        }

        // Formats 1 & 2: "## Status" followed by value on next non-empty line
        if (/^## Status\s*$/.test(line)) {
          awaitingStatusValue = true;
          continue;
        }

        // Formats 4 & 5: "Status: Done" or "**Status:** Done"
        const inlineKv = line.match(/^\*{0,2}Status\*{0,2}\s*:\s*(.+)/);
        if (inlineKv) {
          status = inlineKv[1].trim();
          if (title) break;
          continue;
        }

        // Title: "# Story 1.1: Title", "# Story BS-1: Title", "# Story: Title"
        if (!title) {
          const titleMatch = line.match(/^#\s+Story(?:\s+(?:BS-)?[\d]+(?:\.\d+)?)?[:\s–-]+(.+)/);
          if (titleMatch) {
            title = titleMatch[1].trim();
            if (status !== 'Unknown') break;
          }
        }
      }
    } catch {
      // fall through with whatever we collected
    } finally {
      await fh.close().catch(() => {});
    }

    return { status, ...(title && { title }) };
  }

  /**
   * Scan a story file for Hammoc qa-fix markers:
   *   <!-- hammoc:qa-fix gate="<gate updated value>" applied="true|false" -->
   * QA's review leaves applied="false" (fix needed) in QA Results; Dev's
   * apply-qa-fixes leaves applied="true" (fix done) in Completion Notes. Returns
   * every marker found. Reads the whole file because markers can sit well past
   * the head region scanned by extractStoryMeta.
   */
  private async extractQaFixMarkers(filePath: string): Promise<Array<{ gate: string; applied: boolean }>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const re = /<!--\s*hammoc:qa-fix\s+gate="([^"]*)"\s+applied="(true|false)"\s*-->/g;
      const markers: Array<{ gate: string; applied: boolean }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        markers.push({ gate: m[1].trim(), applied: m[2] === 'true' });
      }
      return markers;
    } catch {
      return [];
    }
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
