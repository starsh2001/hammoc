import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, FolderOpen, ArrowUpRight } from 'lucide-react';
import type { BmadDocuments, BmadAuxDocument } from '@bmad-studio/shared';

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

export function DocumentStatusCard({ documents, auxiliaryDocuments, projectSlug }: DocumentStatusCardProps) {
  const navigate = useNavigate();

  const handleCreateDoc = (agentCommand: string) => {
    navigate(`/project/${projectSlug}/session/${generateUUID()}?agent=${encodeURIComponent(agentCommand)}`);
  };

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
        {/* PRD */}
        <div className="flex items-center gap-2">
          {documents.prd.exists ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          )}
          <span className="text-gray-700 dark:text-gray-300">PRD</span>
          {documents.prd.exists ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{documents.prd.path}</span>
          ) : (
            <>
              <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                작성 필요
              </span>
              <button
                onClick={() => handleCreateDoc('/BMad:agents:pm')}
                className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center gap-1"
              >
                작성하러 가기
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Architecture */}
        <div className="flex items-center gap-2">
          {documents.architecture.exists ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          )}
          <span className="text-gray-700 dark:text-gray-300">Architecture</span>
          {documents.architecture.exists ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{documents.architecture.path}</span>
          ) : (
            <>
              <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                작성 필요
              </span>
              <button
                onClick={() => handleCreateDoc('/BMad:agents:architect')}
                className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center gap-1"
              >
                작성하러 가기
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

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
