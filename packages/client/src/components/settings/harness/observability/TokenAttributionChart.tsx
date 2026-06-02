/**
 * Story 31.3 (Task C.3): token attribution chart — per harness-element token
 * bars + a context-window overlay + the two AC-B1.c percentages, an inline
 * `~N tokens (~X% of window)` approximation hint (AC-B2), and a per-element
 * "exact count" button (AC-B3). Presentational; the panel wires the store.
 *
 * Bars are Tailwind/CSS (no chart dependency). The approximation is byte
 * `size/4` (§14) so the `~` prefix + heuristic note are always shown until an
 * exact count is fetched. Selectors namespaced `observability-token-*`.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Calculator, Loader2, AlertCircle } from 'lucide-react';
import type { TokenAttributionItem, ExactTokenCountResponse } from '@hammoc/shared';
import {
  windowPercent,
  harnessSharePercent,
  effectiveTokens,
} from '../../../../stores/observabilityStore';

interface TokenAttributionChartProps {
  items: TokenAttributionItem[];
  exactByHash: Record<string, ExactTokenCountResponse>;
  exactPending: Record<string, boolean>;
  /** Current/last model context window (falls back inside the helpers). */
  contextWindow: number;
  onRequestExact: (item: TokenAttributionItem) => void;
  loading?: boolean;
}

export function TokenAttributionChart({
  items,
  exactByHash,
  exactPending,
  contextWindow,
  onRequestExact,
  loading,
}: TokenAttributionChartProps) {
  const { t } = useTranslation('settings');

  const totalTokens = useMemo(
    () => items.reduce((sum, it) => sum + effectiveTokens(it, exactByHash).tokens, 0),
    [items, exactByHash],
  );
  const overlayWinPct = windowPercent(totalTokens, contextWindow);

  return (
    <section data-testid="observability-token-attribution">
      <div className="mb-2 flex items-center gap-2">
        <Hash size={15} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-100">{t('harness.observability.tokens.title')}</h4>
      </div>
      <p className="mb-2 text-xs text-gray-500">{t('harness.observability.tokens.help')}</p>

      {/* Context-window overlay (AC-B1.b) — whole harness vs the window */}
      <div className="mb-3 rounded border border-gray-700 bg-gray-800/40 p-2" data-testid="observability-token-overlay">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-gray-300">{t('harness.observability.tokens.windowOverlay')}</span>
          <span className="tabular-nums text-gray-400">
            {t('harness.observability.tokens.total', { tokens: totalTokens.toLocaleString() })} · {t('harness.observability.tokens.ofWindow', { pct: overlayWinPct })}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-gray-900">
          <div
            className="h-full rounded bg-emerald-500"
            style={{ width: `${Math.min(100, Math.max(1, overlayWinPct))}%` }}
            data-testid="observability-token-overlay-bar"
          />
        </div>
      </div>

      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-gray-500">{t('harness.observability.common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500" data-testid="observability-token-empty">
          {t('harness.observability.tokens.empty')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="observability-token-rows">
          {items.map((it) => {
            const { tokens, isExact } = effectiveTokens(it, exactByHash);
            const winPct = windowPercent(tokens, contextWindow);
            const sharePct = harnessSharePercent(tokens, totalTokens);
            const pending = exactPending[it.contentHash];
            const result = exactByHash[it.contentHash];
            const failed = result?.failed;
            return (
              <li key={it.contentHash} className="text-xs" data-testid="observability-token-row">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-gray-200" title={it.path ?? it.label}>{it.label}</span>
                  <span className="shrink-0 tabular-nums text-gray-400" data-testid="observability-token-inline">
                    {isExact
                      ? t('harness.observability.tokens.inlineExact', { tokens: tokens.toLocaleString(), pct: winPct })
                      : t('harness.observability.tokens.inlineApprox', { tokens: tokens.toLocaleString(), pct: winPct })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-gray-800">
                    <div
                      className="h-full rounded bg-emerald-500/80"
                      style={{ width: `${Math.max(2, sharePct)}%` }}
                      data-testid="observability-token-bar"
                    />
                  </div>
                  <span className="shrink-0 tabular-nums text-gray-500">
                    {t('harness.observability.tokens.ofHarness', { pct: sharePct })}
                  </span>
                  {/* exact count control */}
                  {isExact ? (
                    <span className="shrink-0 text-emerald-400" title={t('harness.observability.tokens.exactDone')}>✓</span>
                  ) : pending ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-gray-400" aria-label={t('harness.observability.tokens.exactPending')} />
                  ) : failed ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-amber-400" title={t('harness.observability.tokens.exactFailed')} data-testid="observability-token-failed">
                      <AlertCircle size={12} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="flex shrink-0 items-center gap-1 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300 hover:bg-gray-700"
                      onClick={() => onRequestExact(it)}
                      data-testid="observability-token-exact-btn"
                    >
                      <Calculator size={11} /> {t('harness.observability.tokens.exactButton')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-gray-600" data-testid="observability-token-approx-note">
        {t('harness.observability.tokens.approxNote')}
      </p>
    </section>
  );
}
