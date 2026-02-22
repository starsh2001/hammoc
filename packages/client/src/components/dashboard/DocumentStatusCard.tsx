import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, Circle, FolderOpen, ArrowUpRight, ChevronDown } from 'lucide-react';
import type { BmadDocuments, BmadAuxDocument, BmadSupplementaryDoc, DirEntry } from '@bmad-studio/shared';

import { useFileStore } from '../../stores/fileStore.js';
import { generateUUID } from '../../utils/uuid.js';

interface DocumentStatusCardProps {
  documents: BmadDocuments;
  auxiliaryDocuments: BmadAuxDocument[];
  projectSlug: string;
}

const AUX_DOC_LABELS: Record<string, string> = {
  stories: '스토리',
  qa: 'QA',
};

function getAuxDocLabel(type: string): string {
  return AUX_DOC_LABELS[type] ?? type;
}

/** Agent command mapping for missing core documents */
const CREATE_AGENT: Record<string, string> = {
  prd: '/BMad:agents:pm',
  architecture: '/BMad:agents:architect',
};

type DocEntry = {
  key: string;
  label: string;
  exists: boolean;
  path: string;
  agentCommand?: string;
  sharded?: boolean;
  shardedPath?: string;
  shardedFiles?: DirEntry[];
  optional?: boolean;
};

function buildOrderedDocs(documents: BmadDocuments): DocEntry[] {
  const suppMap = new Map<string, BmadSupplementaryDoc>();
  for (const doc of documents.supplementary ?? []) {
    suppMap.set(doc.key, doc);
  }

  const suppOrder = ['brainstorming', 'market-research', 'competitor-analysis', 'brief'];
  const suppOrderAfterPrd = ['front-end-spec'];
  const suppOrderAfterArch = ['ui-architecture'];

  const entries: DocEntry[] = [];

  for (const key of suppOrder) {
    const doc = suppMap.get(key);
    if (doc) entries.push({ key: doc.key, label: doc.label, exists: doc.exists, path: doc.path, optional: true });
  }

  entries.push({
    key: 'prd',
    label: 'PRD',
    exists: documents.prd.exists,
    path: documents.prd.path,
    agentCommand: CREATE_AGENT.prd,
    sharded: documents.prd.sharded,
    shardedPath: documents.prd.shardedPath,
    shardedFiles: documents.prd.shardedFiles,
  });

  for (const key of suppOrderAfterPrd) {
    const doc = suppMap.get(key);
    if (doc) entries.push({ key: doc.key, label: doc.label, exists: doc.exists, path: doc.path, optional: true });
  }

  entries.push({
    key: 'architecture',
    label: 'Architecture',
    exists: documents.architecture.exists,
    path: documents.architecture.path,
    agentCommand: CREATE_AGENT.architecture,
    sharded: documents.architecture.sharded,
    shardedPath: documents.architecture.shardedPath,
    shardedFiles: documents.architecture.shardedFiles,
  });

  for (const key of suppOrderAfterArch) {
    const doc = suppMap.get(key);
    if (doc) entries.push({ key: doc.key, label: doc.label, exists: doc.exists, path: doc.path, optional: true });
  }

  return entries;
}

/** Recursive tree renderer for DirEntry[] */
function EntryTree({
  entries,
  basePath,
  onOpenFile,
  expandedDocs,
  toggleDoc,
  keyPrefix,
}: {
  entries: DirEntry[];
  basePath: string;
  onOpenFile: (path: string) => void;
  expandedDocs: Set<string>;
  toggleDoc: (key: string) => void;
  keyPrefix: string;
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((entry) => {
        const entryKey = `${keyPrefix}/${entry.name}`;
        if (entry.isDir && entry.children) {
          const isExpanded = expandedDocs.has(entryKey);
          return (
            <div key={entry.name}>
              <button
                onClick={() => toggleDoc(entryKey)}
                className="text-xs text-gray-600 dark:text-gray-400 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                {entry.name}/
                <span className="text-gray-400 dark:text-gray-500">{entry.children.length}개</span>
                <ChevronDown
                  className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {isExpanded && (
                <div className="mt-0.5 ml-4">
                  <EntryTree
                    entries={entry.children}
                    basePath={`${basePath}/${entry.name}`}
                    onOpenFile={onOpenFile}
                    expandedDocs={expandedDocs}
                    toggleDoc={toggleDoc}
                    keyPrefix={entryKey}
                  />
                </div>
              )}
            </div>
          );
        }
        return (
          <button
            key={entry.name}
            onClick={() => onOpenFile(`${basePath}/${entry.name}`)}
            className="block text-xs text-gray-600 dark:text-gray-400 hover:underline cursor-pointer"
          >
            {entry.name}
          </button>
        );
      })}
    </div>
  );
}

export function DocumentStatusCard({ documents, auxiliaryDocuments, projectSlug }: DocumentStatusCardProps) {
  const navigate = useNavigate();
  const openFile = useFileStore((s) => s.requestFileNavigation);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  const toggleDoc = (key: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCreateDoc = (agentCommand: string) => {
    navigate(`/project/${projectSlug}/session/${generateUUID()}?agent=${encodeURIComponent(agentCommand)}`);
  };

  const handleOpenDoc = (docPath: string) => {
    openFile(projectSlug, docPath);
  };

  const orderedDocs = buildOrderedDocs(documents);

  return (
    <div
      role="region"
      aria-label="문서 현황"
      className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white">문서 현황</h2>
      </div>
      <div className="space-y-2 text-sm">
        {orderedDocs.map((doc) => {
          const hasShardedFiles = doc.sharded && doc.shardedFiles && doc.shardedFiles.length > 0;
          const isDocExpanded = expandedDocs.has(doc.key);

          return (
            <div key={doc.key}>
              {/* Document header row */}
              <div className="flex items-center gap-2">
                {doc.exists ? (
                  <CheckCircle className={`w-4 h-4 flex-shrink-0 ${doc.optional ? 'text-green-400 dark:text-green-600' : 'text-green-600 dark:text-green-400'}`} />
                ) : doc.optional ? (
                  <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                )}
                {doc.exists && hasShardedFiles ? (
                  <button
                    onClick={() => toggleDoc(doc.key)}
                    className="font-semibold text-gray-900 dark:text-white hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    {doc.label}
                    <ChevronDown
                      className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${isDocExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                ) : (
                  <span className={
                    doc.exists
                      ? (doc.optional ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white')
                      : (doc.optional ? 'text-gray-400 dark:text-gray-500' : 'font-semibold text-gray-900 dark:text-gray-100')
                  }>{doc.label}</span>
                )}
                {doc.sharded && (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                    Sharded
                  </span>
                )}
                {!hasShardedFiles && doc.exists && (
                  <button
                    onClick={() => handleOpenDoc(doc.path)}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:underline cursor-pointer truncate"
                  >
                    {doc.path}
                  </button>
                )}
                {!doc.exists && doc.agentCommand && (
                  <>
                    <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                      작성 필요
                    </span>
                    <button
                      onClick={() => handleCreateDoc(doc.agentCommand!)}
                      className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center gap-1"
                    >
                      작성하러 가기
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>

              {/* Level 1: consolidated file + sharded directory tree */}
              {isDocExpanded && hasShardedFiles && (
                <div className="mt-1 ml-6 space-y-1">
                  <button
                    onClick={() => handleOpenDoc(doc.path)}
                    className="block text-xs text-gray-600 dark:text-gray-400 hover:underline cursor-pointer"
                  >
                    {doc.path}
                  </button>
                  <EntryTree
                    entries={[{ name: `${doc.shardedPath}`, isDir: true, children: doc.shardedFiles! }]}
                    basePath=""
                    onOpenFile={handleOpenDoc}
                    expandedDocs={expandedDocs}
                    toggleDoc={toggleDoc}
                    keyPrefix={doc.key}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Auxiliary Documents */}
        {auxiliaryDocuments.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 space-y-2">
            {auxiliaryDocuments.map((doc) => {
              const hasFiles = doc.files && doc.files.length > 0;
              const isExpanded = expandedDocs.has(`aux-${doc.type}`);

              return (
                <div key={doc.type}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    {hasFiles ? (
                      <button
                        onClick={() => toggleDoc(`aux-${doc.type}`)}
                        className="text-gray-700 dark:text-gray-300 hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        {getAuxDocLabel(doc.type)}
                        <ChevronDown
                          className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    ) : (
                      <span className="text-gray-700 dark:text-gray-300">{getAuxDocLabel(doc.type)}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">{doc.fileCount}개</span>
                  </div>

                  {/* Expanded auxiliary file tree */}
                  {isExpanded && hasFiles && (
                    <div className="mt-1 ml-6">
                      <EntryTree
                        entries={doc.files!}
                        basePath={doc.path}
                        onOpenFile={handleOpenDoc}
                        expandedDocs={expandedDocs}
                        toggleDoc={toggleDoc}
                        keyPrefix={`aux-${doc.type}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
