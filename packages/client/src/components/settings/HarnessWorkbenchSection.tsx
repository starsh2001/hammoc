/**
 * Story 28.1: Harness Workbench section container.
 *
 * Lives inside the project settings tab. Story 28.1 ships a single sub-panel
 * ("Plugins"); later stories (28.2–28.6) will slot Skills, MCP, Hooks,
 * Commands and Agents panels into the same nav. Keeping the nav + router
 * component separate from the individual panels lets each panel stay
 * single-responsibility.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginPanel } from './harness/PluginPanel';
import { SkillPanel } from './harness/SkillPanel';
import { McpPanel } from './harness/McpPanel';
import { HookPanel } from './harness/HookPanel';
import { CommandPanel } from './harness/CommandPanel';
import { AgentPanel } from './harness/AgentPanel';
import { ClaudeMdPanel } from './harness/ClaudeMdPanel';
import { SnippetPanel } from './harness/SnippetPanel';
import { ModeBanner } from './harness/ModeBanner';
import { LintCountBadge } from './harness/LintCountBadge';
import { LintRulePreferencesDialog } from './harness/LintRulePreferencesDialog';
import type { LintCardDomain } from '@hammoc/shared';
import { useHarnessPluginStore } from '../../stores/harnessPluginStore';
import { useHarnessSkillStore } from '../../stores/harnessSkillStore';
import { useHarnessMcpStore } from '../../stores/harnessMcpStore';
import { useHarnessHookStore } from '../../stores/harnessHookStore';
import { useHarnessCommandStore } from '../../stores/harnessCommandStore';
import { useHarnessAgentStore } from '../../stores/harnessAgentStore';
import { useClaudeMdStore } from '../../stores/claudeMdStore';
import { useSnippetStore } from '../../stores/snippetStore';
import { useHarnessShareScopeStore } from '../../stores/harnessShareScopeStore';
import { useHarnessLintStore } from '../../stores/harnessLintStore';
import { getSocket } from '../../services/socket';
import type { HarnessExternalChangeEvent } from '@hammoc/shared';
import {
  useSecretOnSharedDialogStore,
  deriveLocalSiblingPath,
} from '../../stores/secretOnSharedDialogStore';
import { SecretOnSharedDialog } from './harness/SecretOnSharedDialog';

type HarnessSubSection =
  | 'plugins'
  | 'skills'
  | 'mcps'
  | 'hooks'
  | 'commands'
  | 'agents'
  | 'claudeMd'
  | 'snippets';

const SUB_SECTIONS: readonly HarnessSubSection[] = [
  'plugins',
  'skills',
  'mcps',
  'hooks',
  'commands',
  'agents',
  'claudeMd',
  'snippets',
] as const;

interface Props {
  projectSlug: string;
}

// Map sub-section nav keys → lint card domains so the count badge knows
// which slice of `countsByDomain()` to surface. Sub-sections without a lint
// domain (`plugins` / `claudeMd` / `snippets`) intentionally render no badge.
const LINT_DOMAIN_BY_SECTION: Partial<Record<HarnessSubSection, LintCardDomain>> = {
  skills: 'skill',
  mcps: 'mcp',
  hooks: 'hook',
  commands: 'command',
  agents: 'agent',
};

export function HarnessWorkbenchSection({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const [active, setActive] = useState<HarnessSubSection>('plugins');
  const [lintPrefsOpen, setLintPrefsOpen] = useState(false);
  const shareMode = useHarnessShareScopeStore((s) => s.mode);
  const lintIssues = useHarnessLintStore((s) => s.issues);
  const secretDialogPayload = useSecretOnSharedDialogStore((s) => s.payload);
  const closeSecretDialog = useSecretOnSharedDialogStore((s) => s.close);

  // Recompute the per-domain (error, warn) tally directly from the subscribed
  // `lintIssues` array — calling `countsByDomain()` inside the selector would
  // produce a new object on every render and break Object.is equality.
  const lintCounts = lintIssues.reduce(
    (acc, issue) => {
      const slot = acc[issue.cardDomain];
      if (issue.severity === 'error') slot.error += 1;
      else slot.warn += 1;
      return acc;
    },
    {
      skill: { error: 0, warn: 0 },
      mcp: { error: 0, warn: 0 },
      hook: { error: 0, warn: 0 },
      command: { error: 0, warn: 0 },
      agent: { error: 0, warn: 0 },
    } as Record<LintCardDomain, { error: number; warn: number }>,
  );

  // Prefetch every sub-section's data in parallel as soon as the user enters
  // the workbench, so switching between sub-sections feels instant. Each
  // store's load() is stale-while-revalidate (the panel components also call
  // load() on mount, but a warm cache means no skeleton flash).
  useEffect(() => {
    void useHarnessPluginStore.getState().load(projectSlug);
    void useHarnessSkillStore.getState().load(projectSlug);
    void useHarnessMcpStore.getState().load(projectSlug);
    void useHarnessHookStore.getState().load(projectSlug);
    void useHarnessCommandStore.getState().load(projectSlug);
    void useHarnessAgentStore.getState().load(projectSlug);
    // Story 29.1: prefetch both CLAUDE.md columns in parallel.
    void useClaudeMdStore.getState().load('user');
    void useClaudeMdStore.getState().load('project', projectSlug);
    // Story 29.2: prefetch the snippet card grid for the active project.
    void useSnippetStore.getState().load(projectSlug);
    // Story 30.1: prefetch the project's share-scope verdicts (drives the
    // ShareBadge on every panel + the ModeBanner above the nav).
    void useHarnessShareScopeStore.getState().load(projectSlug);
    // Story 30.2: prefetch the lint issues (drives the count badges on the
    // sub-section nav + the inline marker on every card header).
    void useHarnessLintStore.getState().load(projectSlug);
  }, [projectSlug]);

  // Story 30.1 (AC2): subscribe to harness:external-change at the workbench
  // level so a single watcher event reaches the share-scope store. Sub-panels
  // already manage their own subscriptions for their own data; the Mode
  // verdict is workbench-wide, so it lives here.
  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: HarnessExternalChangeEvent) => {
      useHarnessShareScopeStore.getState().handleExternalChange(payload, projectSlug);
      useHarnessLintStore.getState().handleExternalChange(payload, projectSlug);
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
    };
  }, [projectSlug]);

  return (
    <div className="flex flex-col gap-3">
      {/* Story 30.1 (AC3.b): Mode banner sits above the sub-section nav so
          the verdict is workbench-wide and not duplicated per panel. */}
      {/* Story 30.4: onExportClick={null} hides the CTA while Story 30.3 is
          unimplemented — replace with the ExportBundleDialog open handler when
          Story 30.3 (Task 4) lands. */}
      <ModeBanner mode={shareMode} onExportClick={null} />
      {/* Story 30.2 (AC4.a): "lint 규칙" entry point sits above the sub-section
          nav as a workbench-wide meta line — same level as ModeBanner. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLintPrefsOpen(true)}
          data-testid="lint-rule-prefs-trigger"
          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {t('harness.tools.lint.preferences.title')}
        </button>
      </div>
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Sub-section nav: pill row on mobile (horizontal scroll, no wrap),
          sticky vertical sidebar on >=sm. The negative horizontal margin lets
          the scroll area extend to the parent's edge so the row feels like it
          continues off-screen — a standard mobile tab pattern. */}
      <nav
        aria-label={t('harness.workbench.title')}
        // Inline `scrollbar-width:none` is needed because index.css applies
        // `* { scrollbar-width: thin }` globally — Tailwind's arbitrary
        // variant has the same specificity and loses to the global rule.
        style={{ scrollbarWidth: 'none' }}
        className="-mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0 flex sm:flex-col gap-1.5 sm:gap-1 sm:w-48 sm:shrink-0 overflow-x-auto sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {SUB_SECTIONS.map((key) => {
          const lintDomain = LINT_DOMAIN_BY_SECTION[key];
          const counts = lintDomain ? lintCounts[lintDomain] : undefined;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={
                'shrink-0 whitespace-nowrap px-3.5 sm:px-3 py-1.5 sm:py-2 text-center sm:text-left rounded-full sm:rounded-md text-sm transition-colors flex items-center gap-1.5 justify-between '
                + (active === key
                  ? 'bg-blue-600 text-white sm:bg-blue-50 sm:text-blue-700 sm:dark:bg-blue-900/30 sm:dark:text-blue-200 font-medium shadow-sm sm:shadow-none'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-800 sm:bg-transparent sm:dark:bg-transparent sm:hover:bg-gray-100 sm:dark:hover:bg-gray-800')
              }
            >
              <span>{t(`harness.workbench.nav.${key}`)}</span>
              {counts && (counts.error > 0 || counts.warn > 0) && (
                // Render as a non-interactive span — the surrounding nav
                // <button> already switches sections on any inner click via
                // bubbling, so a clickable inner <button> would just nest
                // interactive controls (HTML spec violation) without adding
                // behavior. AC1.b ("click to jump to that sub-section") is
                // still satisfied through the parent button.
                <LintCountBadge errorCount={counts.error} warnCount={counts.warn} />
              )}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">
        {active === 'plugins' && <PluginPanel projectSlug={projectSlug} />}
        {active === 'skills' && (
          <SkillPanel
            projectSlug={projectSlug}
            onOpenLintPreferences={() => setLintPrefsOpen(true)}
          />
        )}
        {active === 'mcps' && (
          <McpPanel
            projectSlug={projectSlug}
            onOpenLintPreferences={() => setLintPrefsOpen(true)}
          />
        )}
        {active === 'hooks' && (
          <HookPanel
            projectSlug={projectSlug}
            onOpenLintPreferences={() => setLintPrefsOpen(true)}
          />
        )}
        {active === 'commands' && (
          <CommandPanel
            projectSlug={projectSlug}
            onOpenLintPreferences={() => setLintPrefsOpen(true)}
          />
        )}
        {active === 'agents' && (
          <AgentPanel
            projectSlug={projectSlug}
            onOpenLintPreferences={() => setLintPrefsOpen(true)}
          />
        )}
        {active === 'claudeMd' && <ClaudeMdPanel projectSlug={projectSlug} />}
        {active === 'snippets' && <SnippetPanel projectSlug={projectSlug} />}
      </div>
    </div>
    <LintRulePreferencesDialog open={lintPrefsOpen} onClose={() => setLintPrefsOpen(false)} />
    {secretDialogPayload && (
      <SecretOnSharedDialog
        targetPath={secretDialogPayload.targetPath}
        siblingLocalPath={deriveLocalSiblingPath(secretDialogPayload.targetPath) ?? secretDialogPayload.targetPath}
        willAutoCreateSibling
        secretLocations={secretDialogPayload.secretLocations}
        onMoveToLocal={() => {
          secretDialogPayload.onMoveToLocal();
          closeSecretDialog();
        }}
        onMarkNotSecret={() => {
          secretDialogPayload.onMarkNotSecret();
          closeSecretDialog();
        }}
        onCancel={closeSecretDialog}
      />
    )}
    </div>
  );
}
