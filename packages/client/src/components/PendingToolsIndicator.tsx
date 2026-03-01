/**
 * PendingToolsIndicator — floating bar above chat input showing
 * currently running (pending) tool calls so the user knows what
 * the system is waiting on, even when the tool cards have scrolled
 * out of view.
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getToolIcon, getToolDisplayName, getToolDisplayInfo, formatDuration } from '../utils/toolUtils';
import { useScrollContext } from '../contexts/ScrollContext';
import type { StreamingSegment } from '../stores/chatStore';

interface PendingTool {
  id: string;
  name: string;
  description: string | null;
  startedAt: number;
}

const MAX_VISIBLE = 3;

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
      {formatDuration(elapsed)}
    </span>
  );
}

export function PendingToolsIndicator({ segments }: { segments: StreamingSegment[] }) {
  const pendingTools: PendingTool[] = segments
    .filter((seg): seg is Extract<StreamingSegment, { type: 'tool' }> =>
      seg.type === 'tool' && seg.status === 'pending',
    )
    .map((seg) => ({
      id: seg.toolCall.id,
      name: seg.toolCall.name,
      description: getToolDisplayInfo(seg.toolCall.name, seg.toolCall.input),
      startedAt: seg.toolCall.startedAt ?? Date.now(),
    }));

  const scrollCtx = useScrollContext();

  if (pendingTools.length === 0) return null;

  const visible = pendingTools.slice(0, MAX_VISIBLE);
  const remaining = pendingTools.length - MAX_VISIBLE;

  const handleClick = (toolId: string) => {
    // Use ScrollContext for container-scoped scroll with isProgrammaticScrollRef guard.
    // This prevents: (1) mobile page-level scroll from scrollIntoView, and
    // (2) auto-scroll state corruption (isUserScrolledUp false positive).
    scrollCtx?.scrollToElement(`tool-${toolId}`, { block: 'center', smooth: true });
  };

  return (
    <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm">
      <div className="content-container px-4 py-1.5 flex flex-col gap-1">
        {visible.map((tool) => {
          const Icon = getToolIcon(tool.name);
          const displayName = getToolDisplayName(tool.name);

          return (
            <button
              key={tool.id}
              onClick={() => handleClick(tool.id)}
              className="flex items-center gap-2 text-left w-full px-2 py-1 rounded
                         hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors
                         text-sm text-gray-600 dark:text-gray-400 group"
              title="클릭하여 해당 카드로 이동"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
              <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
              <span className="font-medium flex-shrink-0">
                {displayName}
              </span>
              {tool.description && (
                <span className="truncate opacity-70">
                  {tool.description}
                </span>
              )}
              <span className="ml-auto flex-shrink-0">
                <ElapsedTime startedAt={tool.startedAt} />
              </span>
            </button>
          );
        })}
        {remaining > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 px-2">
            +{remaining} more
          </span>
        )}
      </div>
    </div>
  );
}
