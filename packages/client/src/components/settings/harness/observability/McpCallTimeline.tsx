/**
 * Story 31.3 (Task C.2): MCP call timeline — recent calls in time order with
 * session / server / tool / duration / success labels. Presentational.
 */

import { useTranslation } from 'react-i18next';
import { Clock, Check, X, CircleDashed } from 'lucide-react';
import type { McpCallRecord } from '@hammoc/shared';

interface McpCallTimelineProps {
  timeline: McpCallRecord[];
}

function shortSession(id: string): string {
  return id ? id.slice(0, 8) : '—';
}

export function McpCallTimeline({ timeline }: McpCallTimelineProps) {
  const { t } = useTranslation('settings');

  return (
    <section data-testid="observability-mcp-timeline">
      <div className="mb-2 flex items-center gap-2">
        <Clock size={15} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-100">{t('harness.observability.timeline.title')}</h4>
      </div>

      {timeline.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500" data-testid="observability-timeline-empty">
          {t('harness.observability.timeline.empty')}
        </p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto" data-testid="observability-timeline-rows">
          {timeline.map((r) => {
            const orphan = r.success === null;
            return (
              <li
                key={`${r.id}-${r.startedAt}`}
                className="flex items-center gap-2 rounded border border-gray-800 bg-gray-800/40 px-2 py-1 text-xs"
                data-testid="observability-timeline-row"
              >
                {orphan ? (
                  <CircleDashed size={13} className="shrink-0 text-amber-400" aria-label={t('harness.observability.timeline.orphan')} />
                ) : r.success ? (
                  <Check size={13} className="shrink-0 text-green-400" aria-label={t('harness.observability.timeline.success')} />
                ) : (
                  <X size={13} className="shrink-0 text-red-400" aria-label={t('harness.observability.timeline.failure')} />
                )}
                <span className="shrink-0 tabular-nums text-gray-500">
                  {new Date(r.startedAt).toLocaleTimeString()}
                </span>
                {r.serverName && (
                  <span className="shrink-0 rounded bg-indigo-900/60 px-1 py-0.5 text-[10px] text-indigo-300">{r.serverName}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-gray-200" title={r.toolName}>{r.toolName}</span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {r.durationMs === null ? t('harness.observability.timeline.noDuration') : t('harness.observability.mcp.avgMs', { ms: r.durationMs })}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-gray-600" title={r.sessionId}>{shortSession(r.sessionId)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
