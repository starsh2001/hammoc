/** BMad core-config.yaml parsed result (relevant fields only) */
export interface BmadConfig {
  prdFile?: string;
  prdSharded?: boolean;
  prdShardedLocation?: string;
  epicFilePattern?: string;
  architectureFile?: string;
  architectureSharded?: boolean;
  architectureShardedLocation?: string;
  devStoryLocation?: string;
  qaLocation?: string;
}

/** Entry in a directory listing — either a file or a sub-directory with its own children */
export interface DirEntry {
  name: string;
  /** true when this entry is a sub-directory */
  isDir?: boolean;
  /** Children (only present when isDir is true) */
  children?: DirEntry[];
}

/** Document existence status */
interface BmadDocumentStatus {
  exists: boolean;
  path: string;
  /** Whether this document is sharded into multiple files */
  sharded?: boolean;
  /** Path to the sharded directory (present only when sharded is true) */
  shardedPath?: string;
  /** Entries inside the sharded directory */
  shardedFiles?: DirEntry[];
}

/** Well-known supplementary document (brief, front-end-spec, brainstorming, etc.) */
export interface BmadSupplementaryDoc {
  /** Machine key, e.g. "brief", "front-end-spec" */
  key: string;
  /** Human-readable label, e.g. "Project Brief" */
  label: string;
  exists: boolean;
  path: string;
}

/** Documents section of the response */
export interface BmadDocuments {
  prd: BmadDocumentStatus;
  architecture: BmadDocumentStatus;
  /** Well-known supplementary documents discovered in docs/ */
  supplementary: BmadSupplementaryDoc[];
}

/** Individual story status within an epic */
export interface BmadStoryStatus {
  file: string;
  status: string; // 'Draft' | 'Approved' | 'In Progress' | 'Done' | 'Blocked' | etc.
  title?: string; // Story title extracted from the file header
  /** Latest QA gate decision: 'PASS' | 'CONCERNS' | 'FAIL' | 'WAIVED' */
  gateResult?: string;
  /**
   * The story's qa-fix marker state relative to the CURRENT gate:
   *  - 'applied': Dev ran apply-qa-fixes against this gate → QA re-review is next
   *  - 'needed':  QA flagged this gate (CONCERNS/FAIL) and it is not yet
   *               addressed → apply-qa-fixes is next
   *  - undefined: no marker matches the current gate (legacy story or external
   *               BMad project) → the UI shows BOTH actions and lets the user pick
   * Derived from explicit marker comments in the story, never from file mtime.
   */
  gateFixState?: 'needed' | 'applied';
}

/** Epic with its stories */
export interface BmadEpicStatus {
  /**
   * Epic identifier.
   * - Regular epics: number (1, 2, 3, ...)
   * - Backlog standalone stories: grouped under the reserved key "BS"
   */
  number: number | string;
  name: string;
  stories: BmadStoryStatus[];
  /** Number of stories defined in the PRD epic file (may exceed stories.length) */
  plannedStories?: number;
  /** Project-relative path to the PRD file containing this epic */
  filePath?: string;
}

/** Auxiliary document info */
export interface BmadAuxDocument {
  type: string; // 'stories' | 'qa' | etc.
  path: string;
  fileCount: number;
  /** Entries in this directory (files and sub-directories) */
  files?: DirEntry[];
}

/** Response for GET /api/projects/:projectSlug/bmad-status */
/**
 * A QA gate file that failed to parse as YAML. Surfaced to the UI so it can warn
 * that next-step recommendations may be inaccurate until the file is fixed —
 * an unparseable gate is treated as "no gate", which silently misroutes the
 * recommendation (e.g. a PASS gate that won't parse looks like "needs review").
 */
export interface GateParseError {
  /** Gate file name, e.g. "1.7-rule-firing-pool-entry-accrual.yml" */
  file: string;
  /** Story id parsed from the file name, e.g. "1.7" */
  storyId: string;
  /** Parser error message */
  message: string;
}

export interface BmadStatusResponse {
  config: BmadConfig;
  documents: BmadDocuments;
  auxiliaryDocuments: BmadAuxDocument[];
  epics: BmadEpicStatus[];
  /** QA gate files that failed to parse. Omitted/empty when all gates parsed. */
  gateParseErrors?: GateParseError[];
}

export const BMAD_STATUS_ERRORS = {
  NOT_BMAD_PROJECT: {
    code: 'NOT_BMAD_PROJECT',
    message: 'BMad 프로젝트가 아닙니다. (.bmad-core/core-config.yaml 없음)',
    httpStatus: 404,
  },
  CONFIG_PARSE_ERROR: {
    code: 'CONFIG_PARSE_ERROR',
    message: 'core-config.yaml 파싱 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
  SCAN_ERROR: {
    code: 'SCAN_ERROR',
    message: '프로젝트 스캔 중 오류가 발생했습니다.',
    httpStatus: 500,
  },
} as const;
