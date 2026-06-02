/**
 * Story 31.3 (Task D.1): Observability panel (Epic 31).
 *
 * Mounts under "Project Settings → 관측성" (nav NOT gated — available on all
 * projects, like the Story 31.2 context-builder nav). Container for the MCP
 * section (McpCallChart + McpCallTimeline) and the token-attribution section
 * (TokenAttributionChart), plus the global tokenizer-tier toggle (AC-B4) which
 * lives INSIDE the panel (Common Design Principle 1 — harness tools stay on the
 * project tab) but persists to the global `~/.hammoc/preferences.json`.
 *
 * The store is the single source of truth; reads are append-only server data so
 * there is no STALE_WRITE flow. The current context-window size comes from
 * chatStore (last streaming usage), with a conservative fallback in the helpers.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  useObservabilityStore,
  DEFAULT_CONTEXT_WINDOW,
} from '../../stores/observabilityStore';
import { useChatStore } from '../../stores/chatStore';
import { McpCallChart } from './harness/observability/McpCallChart';
import { McpCallTimeline } from './harness/observability/McpCallTimeline';
import { TokenAttributionChart } from './harness/observability/TokenAttributionChart';

export function ObservabilityPanel({ projectSlug }: { projectSlug: string }) {
  const { t } = useTranslation('settings');

  const aggregates = useObservabilityStore((s) => s.aggregates);
  const timeline = useObservabilityStore((s) => s.timeline);
  const filter = useObservabilityStore((s) => s.filter);
  const mcpLoading = useObservabilityStore((s) => s.mcpLoading);
  const attribution = useObservabilityStore((s) => s.attribution);
  const attrLoading = useObservabilityStore((s) => s.attrLoading);
  const exactByHash = useObservabilityStore((s) => s.exactByHash);
  const exactPending = useObservabilityStore((s) => s.exactPending);
  const tokenizer = useObservabilityStore((s) => s.tokenizer);
  const tokenizerOptions = useObservabilityStore((s) => s.tokenizerOptions);

  const contextWindow = useChatStore((s) => s.contextUsage?.contextWindow ?? DEFAULT_CONTEXT_WINDOW);

  useEffect(() => {
    const store = useObservabilityStore.getState();
    void store.loadMcpCalls(projectSlug);
    void store.loadTokenAttribution(projectSlug);
    void store.loadTokenizerPref();
    return () => {
      useObservabilityStore.getState().reset();
    };
  }, [projectSlug]);

  const store = useObservabilityStore.getState();

  return (
    <div className="flex flex-col gap-5" data-testid="observability-panel">
      <div>
        <h3 className="text-sm font-semibold text-gray-100">{t('harness.observability.title')}</h3>
        <p className="text-xs text-gray-500">{t('harness.observability.subtitle')}</p>
      </div>

      {/* (A) MCP call log */}
      <div className="flex flex-col gap-3">
        <McpCallChart
          aggregates={aggregates}
          filter={filter}
          onFilterChange={(patch) => store.setFilter(patch)}
          loading={mcpLoading}
        />
        <McpCallTimeline timeline={timeline} />
      </div>

      {/* (B) token attribution */}
      <TokenAttributionChart
        items={attribution}
        exactByHash={exactByHash}
        exactPending={exactPending}
        contextWindow={contextWindow}
        onRequestExact={(item) => void store.requestExactCount(projectSlug, item)}
        loading={attrLoading}
      />

      {/* (B4) tokenizer tier toggle — panel-internal, persists globally */}
      <section data-testid="observability-tokenizer" className="rounded border border-gray-700 bg-gray-800/40 p-3">
        <h4 className="mb-1 text-sm font-semibold text-gray-100">{t('harness.observability.tokenizer.title')}</h4>
        <p className="mb-2 text-xs text-gray-500">{t('harness.observability.tokenizer.help')}</p>
        <div className="flex flex-col gap-1.5">
          {tokenizerOptions.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-xs text-gray-200">
              <input
                type="radio"
                name="observability-tokenizer"
                value={opt}
                checked={tokenizer === opt}
                onChange={() => void store.updateTokenizer(opt)}
                data-testid={`observability-tokenizer-${opt === 'size/4' ? 'size4' : opt}`}
              />
              {t(`harness.observability.tokenizer.option.${opt === 'size/4' ? 'size4' : 'anthropic'}`)}
            </label>
          ))}
        </div>
        {/* AC-B4.b — rationale notice (the tokenizer-grade tier was not adopted per spike #1). */}
        <p className="mt-2 text-[11px] text-gray-600" data-testid="observability-tokenizer-note">
          {t('harness.observability.tokenizer.notAdopted')}
        </p>
      </section>

      {(mcpLoading || attrLoading) && (
        <p className="flex items-center gap-1 text-[11px] text-gray-500">
          <Loader2 size={11} className="animate-spin" /> {t('harness.observability.common.loading')}
        </p>
      )}
    </div>
  );
}
