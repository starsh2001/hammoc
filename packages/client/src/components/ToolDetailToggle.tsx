/**
 * ToolDetailToggle - Expandable detail panel for tool parameters (Read, Glob, Grep)
 * Shared between MessageArea (streaming) and ToolCallCard (history)
 * [Source: Story 7.2 - Task 3, QA Fix]
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getToolDetailParams } from '../utils/toolUtils';

interface ToolDetailToggleProps {
  toolName: string;
  input?: Record<string, unknown>;
  toolCallId: string;
}

export function ToolDetailToggle({ toolName, input, toolCallId }: ToolDetailToggleProps) {
  const [expanded, setExpanded] = useState(false);
  const params = getToolDetailParams(toolName, input);
  if (!params) return null;

  const panelId = `tool-detail-${toolCallId}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={expanded ? '도구 상세 정보 접기' : '도구 상세 정보 펼치기'}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
          : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
        <span>상세</span>
      </button>
      {expanded && (
        <div id={panelId} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 pl-6">
          {params.map((p) => (
            <div key={p.label} className="break-all">
              <span className="font-medium">{p.label}:</span> {p.value}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
