import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, Circle, FolderOpen, ArrowUpRight } from 'lucide-react';
import type { BmadDocuments, BmadAuxDocument, BmadSupplementaryDoc } from '@bmad-studio/shared';

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

/**
 * Unified ordered document list.
 * Order: Brainstorming → Brief → PRD → Frontend Spec → Architecture
 *
 * Supplementary docs (brainstorming, brief, front-end-spec) come from documents.supplementary.
 * PRD and Architecture are core docs from documents.prd / documents.architecture.
 */
type DocEntry = {
  key: string;
  label: string;
  exists: boolean;
  path: string;
  /** If missing, which agent can create this document? */
  agentCommand?: string;
  /** Whether this document is sharded into multiple files */
  sharded?: boolean;
  /** Path to the sharded directory */
  shardedPath?: string;
  /** Optional docs show gray indicator instead of red X when missing */
  optional?: boolean;
};

function buildOrderedDocs(documents: BmadDocuments): DocEntry[] {
  const suppMap = new Map<string, BmadSupplementaryDoc>();
  for (const doc of documents.supplementary ?? []) {
    suppMap.set(doc.key, doc);
  }

  // Ordered: Brainstorming → Market Research → Competitor Analysis → Brief → PRD → Frontend Spec → Architecture → UI Architecture
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
  });

  for (const key of suppOrderAfterArch) {
    const doc = suppMap.get(key);
    if (doc) entries.push({ key: doc.key, label: doc.label, exists: doc.exists, path: doc.path, optional: true });
  }

  return entries;
}

export function DocumentStatusCard({ documents, auxiliaryDocuments, projectSlug }: DocumentStatusCardProps) {
  const navigate = useNavigate();

  const handleCreateDoc = (agentCommand: string) => {
    navigate(`/project/${projectSlug}/session/${generateUUID()}?agent=${encodeURIComponent(agentCommand)}`);
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
        {orderedDocs.map((doc) => (
          <div key={doc.key} className="flex items-center gap-2">
            {doc.exists ? (
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : doc.optional ? (
              <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <span className={`text-gray-700 dark:text-gray-300${doc.optional ? '' : ' font-semibold'}`}>{doc.label}</span>
            {doc.sharded && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                Sharded
              </span>
            )}
            {doc.exists ? (
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {doc.shardedPath ? `${doc.path} + ${doc.shardedPath}/` : doc.path}
              </span>
            ) : doc.agentCommand ? (
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
            ) : null}
          </div>
        ))}

        {/* Auxiliary Documents */}
        {auxiliaryDocuments.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 space-y-2">
            {auxiliaryDocuments.map((doc) => (
              <div key={doc.type} className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">{getAuxDocLabel(doc.type)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{doc.fileCount}개</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{doc.path}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
