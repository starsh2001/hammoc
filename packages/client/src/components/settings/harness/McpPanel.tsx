/**
 * Story 28.3: MCP server list panel inside "Harness Workbench → MCP".
 *
 * One card per merged server name; each card carries every source the server
 * exists in (project / user / plugin). Plugin-source cards are read-only —
 * editing or toggling routes through "override-clone" copies into project or
 * user scope. The toggle next to each editable card switches the server on /
 * off via either `enabled: false` (Spike A 경로 1) or by moving the entry to
 * `mcp.disabled.json` (Spike A 경로 2). The store flushes the latest spike
 * outcome into `disableStrategy` so the UI consumes a single boolean.
 *
 * External-change events arrive through `harness:external-change` exactly the
 * same way as the Skills panel, but with extra path patterns matching
 * `<projectRoot>/.mcp.json`, `~/.claude/.mcp.json`, `~/.claude/settings.json`,
 * and the two `mcp.disabled.json` backups.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  HarnessMcpCard,
  HarnessMcpCopyRequest,
  HarnessMcpServerType,
  HarnessMcpSource,
  HarnessMcpSourceScope,
} from '@hammoc/shared';
import { useHarnessMcpStore } from '../../../stores/harnessMcpStore';
import { getSocket } from '../../../services/socket';
import { ApiError } from '../../../services/api/client';
import { updateMcp } from '../../../services/api/harnessMcpsApi';
import { generateUUID } from '../../../utils/uuid';
import { McpEditor } from './McpEditor';
import { McpCopyConflictDialog } from './McpCopyConflictDialog';
import { McpSecretConfirmDialog } from './McpSecretConfirmDialog';

interface Props {
  projectSlug: string;
}

interface CopyMenuAction {
  key: 'toUser' | 'toProject' | 'overrideToProject' | 'overrideToUser';
  request: Omit<HarnessMcpCopyRequest, 'onConflict' | 'targetName'>;
}

const ENV_REF_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;
const PLAIN_SECRET_LEN = 32;

const SECRET_PATTERNS: RegExp[] = [
  /^Bearer\s+[A-Za-z0-9._-]{16,}$/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /^[A-Za-z0-9+/=]{40,}$/,
];

function detectSecretsClient(value: unknown, basePath: string[] = []): string[] {
  const paths: string[] = [];
  const walk = (v: unknown, p: string[]): void => {
    if (typeof v === 'string') {
      if (ENV_REF_RE.test(v)) return;
      if (SECRET_PATTERNS.some((re) => re.test(v))) {
        paths.push(p.join('.'));
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, [...p, String(i)]));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        walk(child, [...p, k]);
      }
    }
  };
  walk(value, basePath);
  return paths;
}

function buildCopyActions(card: HarnessMcpCard, projectSlug: string): CopyMenuAction[] {
  const actions: CopyMenuAction[] = [];
  const active = card.sources.find((s) => s.scope === card.activeScope);
  if (!active) return actions;
  if (active.scope === 'project') {
    actions.push({
      key: 'toUser',
      request: {
        sourceScope: 'project',
        sourceProjectSlug: projectSlug,
        sourceName: card.name,
        targetScope: 'user',
      },
    });
  } else if (active.scope === 'user') {
    actions.push({
      key: 'toProject',
      request: {
        sourceScope: 'user',
        sourceName: card.name,
        targetScope: 'project',
        targetProjectSlug: projectSlug,
      },
    });
  } else {
    actions.push({
      key: 'overrideToProject',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: active.pluginKey,
        sourceFileKind: active.sourceFileKind,
        sourceName: card.name,
        targetScope: 'project',
        targetProjectSlug: projectSlug,
      },
    });
    actions.push({
      key: 'overrideToUser',
      request: {
        sourceScope: 'plugin',
        sourcePluginKey: active.pluginKey,
        sourceFileKind: active.sourceFileKind,
        sourceName: card.name,
        targetScope: 'user',
      },
    });
  }
  return actions;
}

export function McpPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();

  const cards = useHarnessMcpStore((s) => s.cards);
  const malformed = useHarnessMcpStore((s) => s.malformed);
  const userFileKind = useHarnessMcpStore((s) => s.userFileKind);
  const isLoading = useHarnessMcpStore((s) => s.isLoading);
  const error = useHarnessMcpStore((s) => s.error);
  const bannerVisible = useHarnessMcpStore((s) => s.bannerVisible);
  const load = useHarnessMcpStore((s) => s.load);
  const copy = useHarnessMcpStore((s) => s.copy);
  const showFreshSpawnBanner = useHarnessMcpStore((s) => s.showFreshSpawnBanner);
  const dismissBanner = useHarnessMcpStore((s) => s.dismissBanner);
  const handleExternalChange = useHarnessMcpStore((s) => s.handleExternalChange);

  const [openCard, setOpenCard] = useState<HarnessMcpCard | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<CopyMenuAction | null>(null);
  const [secretPaths, setSecretPaths] = useState<string[] | null>(null);
  const [conflictAction, setConflictAction] = useState<CopyMenuAction | null>(null);
  const [acknowledgedSecret, setAcknowledgedSecret] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [pluginRootWarning, setPluginRootWarning] = useState<string | null>(null);

  useEffect(() => {
    // Keep cached cards alive after this panel unmounts so re-entering the
    // workbench renders instantly while the store revalidates in the
    // background. `load()` is stale-while-revalidate.
    void load(projectSlug);
  }, [load, projectSlug]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'user' });
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: Parameters<typeof handleExternalChange>[0]) => {
      handleExternalChange(payload);
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'user' });
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
    };
  }, [handleExternalChange, projectSlug]);

  const isForbidden = error?.code === 'HARNESS_FORBIDDEN';

  const handleOpenCopyMenu = (action: CopyMenuAction) => {
    setOpenMenu(null);
    // Look at the active source's config — if it has secrets we need the modal
    // before showing the conflict dialog.
    const card = cards.find((c) => c.name === action.request.sourceName);
    const active = card?.sources.find(
      (s) =>
        s.scope === action.request.sourceScope
        && (s.pluginKey ?? '') === (action.request.sourcePluginKey ?? ''),
    );
    if (active) {
      const paths = detectSecretsClient(active.config);
      if (paths.length > 0) {
        setPendingAction(action);
        setSecretPaths(paths);
        return;
      }
    }
    setConflictAction(action);
    setCopyError(null);
  };

  const handleSecretConfirm = () => {
    if (!pendingAction) return;
    setAcknowledgedSecret(true);
    setSecretPaths(null);
    setConflictAction(pendingAction);
    setPendingAction(null);
    setCopyError(null);
  };

  const handleConflictSubmit = async (resolution: {
    onConflict: 'overwrite' | 'skip' | 'rename';
    targetName: string;
  }) => {
    if (!conflictAction) return;
    setCopyError(null);
    setPluginRootWarning(null);
    try {
      const result = await copy({
        ...conflictAction.request,
        targetName: resolution.targetName,
        onConflict: resolution.onConflict,
        ...(acknowledgedSecret ? { acknowledgedSecret: true } : {}),
      } as HarnessMcpCopyRequest);
      if (result.warnings?.includes('plugin-root-reference')) {
        setPluginRootWarning(t('harness.mcp.copy.conflict.pluginRootWarning'));
      }
      setConflictAction(null);
      setAcknowledgedSecret(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'HARNESS_FORBIDDEN'
          && (err.details as { cause?: string } | undefined)?.cause === 'secret-not-acknowledged'
        ) {
          // The server says we still need confirmation — surface the modal.
          const paths = (err.details as { paths?: string[] } | undefined)?.paths ?? [];
          setSecretPaths(paths);
          setPendingAction(conflictAction);
          setConflictAction(null);
          return;
        }
        if (err.code === 'HARNESS_MCP_NAME_CONFLICT') {
          setCopyError(t('harness.mcp.copy.conflict.renameInvalid'));
          return;
        }
        if (
          err.code === 'HARNESS_WRITE_ERROR'
          && (err.details as { cause?: string } | undefined)?.cause === 'cross-device'
        ) {
          setCopyError(t('harness.mcp.copy.error.crossDevice'));
          return;
        }
        setCopyError(err.message);
        return;
      }
      setCopyError((err as Error).message);
    }
  };

  const handleToggle = async (card: HarnessMcpCard) => {
    const active = card.sources.find((s) => s.scope === card.activeScope);
    if (!active || active.scope === 'plugin') return;
    try {
      await updateMcp(
        card.name,
        {
          scope: active.scope as 'project' | 'user',
          projectSlug: active.projectSlug ?? projectSlug,
        },
        { enabled: !card.enabled, expectedMtime: active.mtime },
      );
      // Spike A 결과(fresh-spawn) 에 따라 토글은 다음 user 메시지부터 적용된다.
      // 사용자에게 "지금 입력하면 아직 옛 상태에서 처리된다" 는 사실을 안내하고
      // 새 세션 CTA 를 함께 노출한다 — Story 28.1 PluginPanel 패턴 답습.
      showFreshSpawnBanner();
      void load(projectSlug);
    } catch (err) {
      // STALE_WRITE on toggle just reloads — the user can retry.
      if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
        void load(projectSlug);
      }
    }
  };

  const handleNewSession = () => {
    const newSessionId = generateUUID();
    dismissBanner();
    navigate(`/project/${projectSlug}/session/${encodeURIComponent(newSessionId)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {bannerVisible && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
        >
          <div className="flex-1">
            <p>{t('harness.mcp.banner.freshSpawn')}</p>
            <button
              type="button"
              onClick={handleNewSession}
              className="mt-1 inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-700 px-2.5 py-1 text-white text-xs font-medium"
            >
              {t('harness.mcp.banner.newSession')}
            </button>
          </div>
          <button
            type="button"
            aria-label={t('harness.mcp.banner.dismiss', { defaultValue: 'Dismiss' })}
            onClick={dismissBanner}
            className="text-amber-700 dark:text-amber-200 hover:text-amber-900"
          >
            ×
          </button>
        </div>
      )}

      {isForbidden && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30 px-3 py-2 text-sm text-yellow-900 dark:text-yellow-100">
          {t('harness.plugin.readonly.forbidden')}
        </div>
      )}

      {pluginRootWarning && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          {pluginRootWarning}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setPluginRootWarning(null)}
          >
            {t('harness.mcp.banner.dismiss', { defaultValue: 'Dismiss' })}
          </button>
        </div>
      )}

      {isLoading && cards.length === 0 && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {!isLoading && !isForbidden && cards.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('harness.mcp.empty.title')}
          </p>
          <p className="mt-1">{t('harness.mcp.empty.description')}</p>
          {userFileKind === null && (
            <p className="mt-2 text-amber-700 dark:text-amber-300">
              {t('harness.mcp.empty.noGlobalSupport')}
            </p>
          )}
        </div>
      )}

      {malformed.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">{t('harness.mcp.malformed.title')}</p>
          <ul className="mt-1 list-disc ml-5">
            {malformed.map((m, idx) => (
              <li key={`${m.absoluteFile}#${idx}`} className="text-xs">
                <code className="font-mono">{m.absoluteFile}</code> [{m.serverName}] —{' '}
                {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cards.map((card) => {
          const actions = buildCopyActions(card, projectSlug);
          const cardKey = `${card.name}#${card.activeScope}`;
          const isPlugin = card.activeScope === 'plugin';
          return (
            <div
              key={cardKey}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700"
              onClick={() => setOpenCard(card)}
              role="button"
              aria-label={t('harness.mcp.cardOpen', {
                name: card.name,
                defaultValue: `Open ${card.name}`,
              })}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {card.name}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {!isPlugin && (
                    <button
                      type="button"
                      onClick={() => handleToggle(card)}
                      className={
                        'px-2 py-1 text-xs rounded font-medium '
                        + (card.enabled
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300')
                      }
                    >
                      {card.enabled
                        ? t('harness.mcp.toggle.on')
                        : t('harness.mcp.toggle.off')}
                    </button>
                  )}
                  {actions.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={t('harness.mcp.copy.menuLabel', {
                          defaultValue: 'Copy actions',
                        })}
                        onClick={() => setOpenMenu((curr) => (curr === cardKey ? null : cardKey))}
                        className="px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        ⋮
                      </button>
                      {openMenu === cardKey && (
                        <ul className="absolute right-0 top-7 z-10 min-w-[14rem] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg text-sm">
                          {actions.map((action) => (
                            <li key={action.key}>
                              <button
                                type="button"
                                onClick={() => handleOpenCopyMenu(action)}
                                className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                              >
                                {t(`harness.mcp.copy.${action.key}.label`)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {card.sources.map((src) => (
                  <ScopeBadge
                    key={`${src.scope}#${src.pluginKey ?? ''}#${src.disabledByBackup ? 'bk' : 'ok'}`}
                    source={src}
                    isActive={src.scope === card.activeScope && !src.disabledByBackup}
                    activeScopeLabel={t(`harness.mcp.scopeBadge.${card.activeScope}`)}
                    shadowedScopeLabel={t(`harness.mcp.scopeBadge.${src.scope}`)}
                  />
                ))}
                <TypeBadge type={card.activeType} />
                {card.sources.some((s) => s.disabledByBackup) && !card.enabled && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                    {t('harness.mcp.toggle.disabledByBackup')}
                  </span>
                )}
              </div>
              {hasPlainSecretInConfig(card) && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400">
                  ● {t('harness.mcp.secret.marker')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openCard && (
        <McpEditor
          card={openCard}
          projectSlug={projectSlug}
          onClose={() => setOpenCard(null)}
        />
      )}

      {secretPaths !== null && (
        <McpSecretConfirmDialog
          secretPaths={secretPaths}
          onConfirm={handleSecretConfirm}
          onClose={() => {
            setSecretPaths(null);
            setPendingAction(null);
            setAcknowledgedSecret(false);
          }}
        />
      )}

      {conflictAction && (
        <McpCopyConflictDialog
          defaultName={conflictAction.request.sourceName}
          targetScope={conflictAction.request.targetScope}
          errorMessage={copyError}
          onSubmit={handleConflictSubmit}
          onClose={() => {
            setConflictAction(null);
            setCopyError(null);
            setAcknowledgedSecret(false);
          }}
        />
      )}
    </div>
  );
}

function hasPlainSecretInConfig(card: HarnessMcpCard): boolean {
  const active = card.sources.find((s) => s.scope === card.activeScope);
  if (!active) return false;
  let found = false;
  const walk = (v: unknown): void => {
    if (found) return;
    if (typeof v === 'string') {
      if (ENV_REF_RE.test(v)) return;
      if (SECRET_PATTERNS.some((re) => re.test(v)) || v.length >= PLAIN_SECRET_LEN) {
        found = true;
      }
      return;
    }
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(active.config);
  return found;
}

function ScopeBadge({
  source,
  isActive,
  activeScopeLabel,
  shadowedScopeLabel,
}: {
  source: HarnessMcpSource;
  isActive: boolean;
  activeScopeLabel: string;
  shadowedScopeLabel: string;
}) {
  const { t } = useTranslation('settings');
  const scopeColor: Record<HarnessMcpSourceScope, string> = {
    project: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200',
    user: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    plugin: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200',
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 font-medium ${scopeColor[source.scope]} ${
        isActive ? '' : 'opacity-50'
      }`}
      title={
        isActive
          ? undefined
          : t('harness.mcp.activeSourceTooltip', {
              active: activeScopeLabel,
              shadowed: shadowedScopeLabel,
            })
      }
    >
      {source.scope === 'plugin'
        ? t('harness.mcp.scopeBadge.pluginWithKey', {
            key: source.pluginKey,
            defaultValue: t('harness.mcp.scopeBadge.plugin'),
          })
        : t(`harness.mcp.scopeBadge.${source.scope}`)}
    </span>
  );
}

function TypeBadge({ type }: { type: HarnessMcpServerType }) {
  return (
    <span className="inline-flex rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-mono px-1.5 py-0.5 text-[11px]">
      {type}
    </span>
  );
}
