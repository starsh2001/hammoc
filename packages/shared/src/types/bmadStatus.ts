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
export interface BmadDocumentStatus {
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
}

/** Epic with its stories */
export interface BmadEpicStatus {
  number: number;
  name: string;
  stories: BmadStoryStatus[];
  /** Number of stories defined in the PRD epic file (may exceed stories.length) */
  plannedStories?: number;
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
export interface BmadStatusResponse {
  config: BmadConfig;
  documents: BmadDocuments;
  auxiliaryDocuments: BmadAuxDocument[];
  epics: BmadEpicStatus[];
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

export type BmadStatusErrorCode = keyof typeof BMAD_STATUS_ERRORS;
