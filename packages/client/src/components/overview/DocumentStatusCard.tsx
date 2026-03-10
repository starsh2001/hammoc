import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, CheckCircle, XCircle, Circle, FolderOpen, ArrowUpRight, ChevronDown } from 'lucide-react';
import type { BmadDocuments, BmadAuxDocument, BmadSupplementaryDoc, DirEntry } from '@hammoc/shared';
import type { TFunction } from 'i18next';

import { useFileStore } from '../../stores/fileStore.js';
import { generateUUID } from '../../utils/uuid.js';

interface DocumentStatusCardProps {
  documents: BmadDocuments;
  auxiliaryDocuments: BmadAuxDocument[];
  projectSlug: string;
}

const AUX_DOC_LABEL_KEYS: Record<string, string> = {
  stories: 'document.stories',
  qa: 'document.qa',
};

function getAuxDocLabel(type: string, t: TFunction): string {
  const key = AUX_DOC_LABEL_KEYS[type];
  return key ? t(key) : type;
}

/** Agent command mapping for creating documents */
const CREATE_AGENT: Record<string, string> = {
  brainstorming: '/BMad:agents:analyst',
  'market-research': '/BMad:agents:analyst',
  'competitor-analysis': '/BMad:agents:analyst',
  brief: '/BMad:agents:analyst',
  prd: '/BMad:agents:pm',
  'front-end-spec': '/BMad:agents:ux-expert',
  architecture: '/BMad:agents:architect',
  'ui-architecture': '/BMad:agents:architect',
};

/** Documents that show "작성 권장" instead of "작성 필요" */
const RECOMMENDED_DOCS = new Set(['brainstorming', 'brief']);

/** Group labels for visual separation */
const GROUP_CORE = new Set(['prd', 'architecture']);

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
  recommended?: boolean;
};

function buildOrderedDocs(documents: BmadDocuments): DocEntry[] {
  const suppMap = new Map<string, BmadSupplementaryDoc>();
  for (const doc of documents.supplementary ?? []) {
    suppMap.set(doc.key, doc);
  }

  const suppOrder = ['brainstorming', 'market-research', 'competitor-analysis', 'brief'];
  const suppOrderAfterPrd = ['front-end-spec', 'ui-architecture'];

  const entries: DocEntry[] = [];

  for (const key of suppOrder) {
    const doc = suppMap.get(key);
    if (doc) entries.push({ key: doc.key, label: doc.label, exists: doc.exists, path: doc.path, optional: true, agentCommand: CREATE_AGENT[doc.key], recommended: !documents.prd.exists && RECOMMENDED_DOCS.has(doc.key) });
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
    if (doc) entries.push({ key: doc.key, label: doc.label, exists: doc.exists, path: doc.path, optional: true, agentCommand: CREATE_AGENT[doc.key] });
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
                className="text-xs text-gray-600 dark:text-gray-300 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                {entry.name}/
                <span className="text-gray-400 dark:text-gray-400">{entry.children.length}개</span>
                <ChevronDown
                  className={`w-3 h-3 text-gray-400 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {isExpanded && (
                <div className="mt-0.5 ml-4">
                  <EntryTree
                    entries={entry.children}
                    basePath={basePath ? `${basePath}/${entry.name}` : entry.name}
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
            onClick={() => onOpenFile(basePath ? `${basePath}/${entry.name}` : entry.name)}
            className="block text-xs text-gray-600 dark:text-gray-300 hover:underline cursor-pointer"
          >
            {entry.name}
          </button>
        );
      })}
    </div>
  );
}

function DocRow({
  doc,
  isDocExpanded,
  toggleDoc,
  handleOpenDoc,
  handleCreateDoc,
  expandedDocs,
  t,
}: {
  doc: DocEntry;
  isDocExpanded: boolean;
  toggleDoc: (key: string) => void;
  handleOpenDoc: (path: string) => void;
  handleCreateDoc: (cmd: string) => void;
  expandedDocs: Set<string>;
  t: TFunction;
}) {
  const hasShardedFiles = doc.sharded && doc.shardedFiles && doc.shardedFiles.length > 0;
  const isCore = GROUP_CORE.has(doc.key);

  return (
    <div>
      {/* Document row */}
      <div className={`flex items-center gap-2 py-1 px-2 -mx-2 rounded-md transition-colors ${
        isCore ? 'bg-gray-100/50 dark:bg-[#253040]/30' : ''
      }`}>
        {doc.exists ? (
          <CheckCircle className={`w-4 h-4 flex-shrink-0 ${doc.optional ? 'text-green-400 dark:text-green-600' : 'text-green-600 dark:text-green-400'}`} />
        ) : doc.optional ? (
          <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
        )}

        {/* Name */}
        {doc.exists && hasShardedFiles ? (
          <button
            onClick={() => toggleDoc(doc.key)}
            className="font-semibold text-gray-900 dark:text-white hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            {doc.label}
            <ChevronDown
              className={`w-3 h-3 text-gray-400 dark:text-gray-400 transition-transform ${isDocExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <span className={
            doc.exists
              ? (doc.optional ? 'text-gray-700 dark:text-gray-200' : 'font-semibold text-gray-900 dark:text-white')
              : (doc.optional ? 'text-gray-400 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100')
          }>{doc.label}</span>
        )}

        {/* Sharded badge */}
        {hasShardedFiles && (
          <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
            {t('document.sharded')}
          </span>
        )}

        {/* Spacer to push right items */}
        <span className="flex-1" />

        {/* Path link or status badges — right-aligned */}
        {!hasShardedFiles && doc.exists && (
          <button
            onClick={() => handleOpenDoc(doc.path)}
            className="text-xs text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:underline cursor-pointer truncate max-w-[50%]"
          >
            {doc.path}
          </button>
        )}
        {!doc.exists && !doc.optional && (
          <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
            {t('document.writeRequired')}
          </span>
        )}
        {!doc.exists && doc.recommended && (
          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
            {t('document.writeRecommended')}
          </span>
        )}
        {!doc.exists && doc.agentCommand && (
          <button
            onClick={() => handleCreateDoc(doc.agentCommand!)}
            className={`p-0.5 rounded transition-colors cursor-pointer ${!doc.optional || doc.recommended ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50' : 'bg-gray-100 dark:bg-[#253040]/50 text-gray-300 dark:text-gray-600 hover:bg-gray-200 dark:hover:bg-[#253040] hover:text-gray-500 dark:hover:text-gray-400'}`}
            title={t('document.writeGo')}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Level 1: consolidated file + sharded directory tree */}
      {isDocExpanded && hasShardedFiles && (
        <div className="mt-1 ml-6 space-y-1">
          <button
            onClick={() => handleOpenDoc(doc.path)}
            className="block text-xs text-gray-600 dark:text-gray-300 hover:underline cursor-pointer"
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
}

export function DocumentStatusCard({ documents, auxiliaryDocuments, projectSlug }: DocumentStatusCardProps) {
  const { t } = useTranslation('common');
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

  // Count completed required docs
  const totalRequired = orderedDocs.filter((d) => !d.optional).length;
  const doneRequired = orderedDocs.filter((d) => !d.optional && d.exists).length;

  return (
    <div
      role="region"
      aria-label={t('document.statusTitle')}
      className="bg-gray-50 dark:bg-[#263240] rounded-xl border border-gray-200 dark:border-[#253040] p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('document.statusTitle')}</h2>
        </div>
        {totalRequired > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#253040] text-gray-500 dark:text-gray-300">
            {t('document.requiredCount', { done: doneRequired, total: totalRequired })}
          </span>
        )}
      </div>

      <div className="space-y-1 text-sm">
        {/* All documents in workflow order: Brainstorming → Brief → PRD → Spec → Architecture */}
        {orderedDocs.map((doc) => (
          <DocRow
            key={doc.key}
            doc={doc}
            isDocExpanded={expandedDocs.has(doc.key)}
            toggleDoc={toggleDoc}
            handleOpenDoc={handleOpenDoc}
            handleCreateDoc={handleCreateDoc}
            expandedDocs={expandedDocs}
            t={t}
          />
        ))}

        {/* Auxiliary Documents (stories, QA, etc.) */}
        {auxiliaryDocuments.length > 0 && (
          <div className="border-t border-gray-200 dark:border-[#253040] mt-2 pt-2 space-y-1">
            <p className="text-[11px] uppercase tracking-wider font-medium text-gray-400 dark:text-gray-400 mb-1">{t('document.deliverables')}</p>
            {auxiliaryDocuments.map((doc) => {
              const hasFiles = doc.files && doc.files.length > 0;
              const isExpanded = expandedDocs.has(`aux-${doc.type}`);

              return (
                <div key={doc.type}>
                  <div className="flex items-center gap-2 py-1 px-2 -mx-2 rounded-md">
                    <FolderOpen className="w-4 h-4 text-gray-400 dark:text-gray-400 flex-shrink-0" />
                    {hasFiles ? (
                      <button
                        onClick={() => toggleDoc(`aux-${doc.type}`)}
                        className="text-gray-700 dark:text-gray-200 hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        {getAuxDocLabel(doc.type, t)}
                        <ChevronDown
                          className={`w-3 h-3 text-gray-400 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    ) : (
                      <span className="text-gray-700 dark:text-gray-200">{getAuxDocLabel(doc.type, t)}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-400">{t('document.count', { count: doc.fileCount })}</span>
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
