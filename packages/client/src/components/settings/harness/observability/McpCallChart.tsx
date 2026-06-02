/**
 * Story 31.3 (Task C.1): MCP call aggregate chart — per server/tool call count
 * + average response time, with server/tool/session-window filters.
 *
 * Presentational: data + filter come from props (the panel wires the store).
 * Bars are Tailwind/CSS (no chart dependency — AC-B1.b constraint). Selectors
 * are namespaced `observability-mcp-*` for integration tests.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import type { McpCallAggregate, ObservabilityQuery } from '@hammoc/shared';

interface McpCallChartProps {
  aggregates: McpCallAggregate[];
  filter: ObservabilityQuery;
  onFilterChange: (patch: Partial<ObservabilityQuery>) => void;
  loading?: boolean;
}

const SINCE_OPTIONS = [7, 30, 90];

export function McpCallChart({ aggregates, filter, onFilterChange, loading }: McpCallChartProps) {
  const { t } = useTranslation('settings');

  const servers = useMemo(() => {
    const set = new Set<string>();
    for (const a of aggregates) if (a.serverName) set.add(a.serverName);
    if (filter.server) set.add(filter.server);
    return [...set].sort();
  }, [aggregates, filter.server]);

  const tools = useMemo(() => {
    const set = new Set<string>();
    for (const a of aggregates) set.add(a.toolName);
    if (filter.tool) set.add(filter.tool);
    return [...set].sort();
  }, [aggregates, filter.tool]);

  const maxCount = useMemo(
    () => aggregates.reduce((m, a) => Math.max(m, a.count), 0) || 1,
    [aggregates],
  );

  return (
    <section data-testid="observability-mcp-chart">
      <div className="mb-2 flex items-center gap-2">
        <BarChart3 size={15} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-100">{t('harness.observability.mcp.title')}</h4>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="observability-mcp-filters">
        <select
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
          value={filter.server ?? ''}
          onChange={(e) => onFilterChange({ server: e.target.value || undefined })}
          aria-label={t('harness.observability.mcp.filter.server')}
          data-testid="observability-mcp-filter-server"
        >
          <option value="">{t('harness.observability.mcp.filter.allServers')}</option>
          {servers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
          value={filter.tool ?? ''}
          onChange={(e) => onFilterChange({ tool: e.target.value || undefined })}
          aria-label={t('harness.observability.mcp.filter.tool')}
          data-testid="observability-mcp-filter-tool"
        >
          <option value="">{t('harness.observability.mcp.filter.allTools')}</option>
          {tools.map((tn) => (
            <option key={tn} value={tn}>{tn}</option>
          ))}
        </select>

        <select
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
          value={filter.sinceDays ?? 30}
          onChange={(e) => onFilterChange({ sinceDays: Number(e.target.value) })}
          aria-label={t('harness.observability.mcp.filter.sinceDays')}
          data-testid="observability-mcp-filter-since"
        >
          {SINCE_OPTIONS.map((d) => (
            <option key={d} value={d}>{t('harness.observability.mcp.filter.lastNDays', { days: d })}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-gray-500">{t('harness.observability.common.loading')}</p>
      ) : aggregates.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500" data-testid="observability-mcp-empty">
          {t('harness.observability.mcp.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="observability-mcp-rows">
          {aggregates.map((a) => (
            <li key={`${a.serverName ?? ''}/${a.toolName}`} className="text-xs" data-testid="observability-mcp-row">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-gray-200" title={a.toolName}>
                  {a.serverName && (
                    <span className="mr-1 rounded bg-indigo-900/60 px-1 py-0.5 text-[10px] text-indigo-300">{a.serverName}</span>
                  )}
                  {a.toolName}
                </span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {t('harness.observability.mcp.callCount', { count: a.count })} · {t('harness.observability.mcp.avgMs', { ms: a.avgDurationMs })}
                  {a.errorCount > 0 && (
                    <span className="ml-1 text-red-400" title={t('harness.observability.mcp.col.errors')}>
                      · {t('harness.observability.mcp.errorCount', { count: a.errorCount })}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-gray-800">
                <div
                  className="h-full rounded bg-indigo-500"
                  style={{ width: `${Math.max(2, (a.count / maxCount) * 100)}%` }}
                  data-testid="observability-mcp-bar"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
